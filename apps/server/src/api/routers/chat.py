import asyncio

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
    message: str
    session_id: str = "default"
    use_rag: bool = False
    system_prompt: str = ""
    lat: float | None = None
    lng: float | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


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
    long_term_facts = await episodic.search(req.message, top_k=5)
    if long_term_facts:
        facts_text = "\n".join(f"- {f.content}" for f in long_term_facts)
        memory_msg = SystemMessage(content=f"Relevant facts from previous conversations:\n{facts_text}")
        history = [memory_msg, *history]

    # Inject location + weather context when the client provides coordinates
    if req.lat is not None and req.lng is not None:
        try:
            location_ctx = await get_location_context(req.lat, req.lng)
            history = [SystemMessage(content=location_ctx), *history]
            log.debug("chat.location_context", lat=req.lat, lng=req.lng)
        except Exception as exc:
            log.warning("chat.location_context.error", error=str(exc))

    async def generate():
        accumulated: list[str] = []
        try:
            messages = [*history, HumanMessage(content=req.message)]

            if req.use_rag:
                chunks = await retriever.retrieve(req.message)
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

            yield "data: [DONE]\n\n"

        except Exception as e:
            log.error("chat.stream.error", error=str(e))
            yield f"data: Error: {e}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
