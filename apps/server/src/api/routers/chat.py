import asyncio
from typing import Any

import structlog
from agents import ChatState, RAGState, build_chat_graph, build_rag_graph
from ai import get_llm
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from memory import (  # noqa: F401 (estimate_tokens used inline)
    BudgetExceeded,
    EpisodicStore,
    MemoryExtractor,
    SessionStore,
    SummaryCompressor,
    TokenBudget,
    estimate_tokens,
)
from pydantic import BaseModel
from rag import PgVectorRetriever
from tools import get_location_context

from ..auth import CurrentUser

log = structlog.get_logger()
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str | list[dict[str, Any]]
    session_id: str = "default"
    use_rag: bool = False
    system_prompt: str = ""
    lat: float | None = None
    lng: float | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


def _extract_text(message: str | list[dict[str, Any]]) -> str:
    """Extract text from potentially multi-modal message content."""
    if isinstance(message, str):
        return message
    return " ".join(
        part.get("text", "")
        for part in message
        if isinstance(part, dict) and part.get("type") == "text"
    )

@router.post("")
async def chat(req: ChatRequest, request: Request, current_user: CurrentUser) -> StreamingResponse:
    """Stream a chat response via Server-Sent Events."""
    llm = get_llm()
    pool = request.app.state.db_pool
    store: SessionStore = request.app.state.session_store
    compressor: SummaryCompressor = request.app.state.compressor
    retriever: PgVectorRetriever = request.app.state.retriever
    episodic: EpisodicStore = request.app.state.episodic
    extractor: MemoryExtractor = request.app.state.extractor

    # Extract text content for searching and retrieval
    message_text = _extract_text(req.message)

    # Scope session to the authenticated user
    session_id = f"{current_user.id}:{req.session_id}"

    # Load per-tenant token limit and enforce budget
    tenant_row = await pool.fetchrow(
        "SELECT token_limit FROM tenants WHERE id = $1", current_user.id
    )
    token_limit = tenant_row["token_limit"] if tenant_row else 100_000
    budget = TokenBudget(store, limit=token_limit)

    try:
        await budget.check(session_id)
    except BudgetExceeded as exc:
        msg = str(exc)

        async def budget_error():
            yield f"data: Error: {msg}\n\n"

        return StreamingResponse(budget_error(), media_type="text/event-stream")

    # Load and compress conversation history for this session
    history = await store.get_messages(session_id)
    history = await compressor.compress(history)
    await store.add_message(session_id, "human", req.message)

    # Retrieve relevant long-term memories and prepend as a system message
    long_term_facts = await episodic.search(message_text, top_k=5)
    if long_term_facts:
        facts_text = "\n".join(f"- {f.content}" for f in long_term_facts)
        memory_msg = SystemMessage(content=f"Relevant facts from previous conversations:\n{facts_text}")
        history = [memory_msg, *history]

    # Inject location + weather context when the client provides coordinates
    location_place: str | None = None
    if req.lat is not None and req.lng is not None:
        try:
            from datetime import UTC, datetime
            now = datetime.now(UTC)
            location_ctx = await get_location_context(req.lat, req.lng)
            
            # Combine current time with location + weather info
            location_info = (
                f"The user has shared their device location with you. "
                f"Use this information confidently when asked about their location, weather, or nearby places — "
                f"do not say you lack location access.\n\n"
                f"Current date and time: {now.strftime('%A, %B %d, %Y')} at {now.strftime('%H:%M')} UTC\n"
                f"{location_ctx}"
            )
            log.info("chat.location_injected", place=location_ctx.split("\n")[0])
            history = [SystemMessage(content=location_info), *history]
            # Extract the place name for episodic storage (first line: "User is in <place>.")
            first_line = location_ctx.split("\n")[0]
            location_place = first_line.removeprefix("User is in ").removesuffix(".")
            log.debug("chat.location_context", lat=req.lat, lng=req.lng)
        except Exception as exc:
            log.warning("chat.location_context.error", error=str(exc))

    async def generate():
        accumulated: list[str] = []
        try:
            messages = [*history, HumanMessage(content=req.message)]

            if req.use_rag:
                chunks = await retriever.retrieve(message_text)
                agent = build_rag_graph(llm=llm)
                state: RAGState = {
                    "messages": messages,
                    "session_id": session_id,
                    "context_chunks": [c.content for c in chunks],
                }
            else:
                agent = build_chat_graph(llm=llm)
                state: ChatState = {
                    "messages": messages,
                    "session_id": session_id,
                    "system_prompt": req.system_prompt,
                }

            log.info("chat.stream.start", session_id=session_id, use_rag=req.use_rag, user_id=current_user.id)
            async for token in agent.stream(state):
                accumulated.append(token)
                yield f"data: {token}\n\n"

            full_reply = "".join(accumulated)
            await store.add_message(session_id, "assistant", full_reply)

            # Record token usage tagged with tenant for billing aggregation
            tokens_used = estimate_tokens(req.message) + estimate_tokens(full_reply)
            await store.add_token_usage(session_id, tokens_used, tenant_id=current_user.id)

            # Extract and store long-term memories in the background
            asyncio.ensure_future(
                extractor.extract_and_store(
                    human_message=req.message,
                    assistant_reply=full_reply,
                    session_id=session_id,
                    metadata={"user_id": current_user.id},
                )
            )

            # Store location as an episodic fact so future sessions know where the user has been
            if location_place:
                from datetime import UTC, datetime
                date_str = datetime.now(UTC).strftime("%Y-%m-%d")
                asyncio.ensure_future(
                    episodic.store(
                        f"On {date_str}, the user was in {location_place}.",
                        session_id=session_id,
                        metadata={"user_id": current_user.id, "type": "location"},
                    )
                )

            yield "data: [DONE]\n\n"

        except Exception as e:
            log.error("chat.stream.error", error=str(e))
            yield f"data: Error: {e}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
