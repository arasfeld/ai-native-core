import structlog
from agents import ChatState, RAGState, build_chat_graph, build_rag_graph
from ai import get_llm
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from rag import PgVectorRetriever

log = structlog.get_logger()
router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    use_rag: bool = False


class ChatResponse(BaseModel):
    reply: str
    session_id: str


@router.post("")
async def chat(req: ChatRequest) -> StreamingResponse:
    """Stream a chat response via Server-Sent Events."""
    llm = get_llm()

    async def generate():
        try:
            if req.use_rag:
                retriever = PgVectorRetriever(llm=llm)
                chunks = await retriever.retrieve(req.message)
                agent = build_rag_graph(llm=llm)
                state: RAGState = {
                    "messages": [HumanMessage(content=req.message)],
                    "session_id": req.session_id,
                    "context_chunks": [c.content for c in chunks],
                }
            else:
                agent = build_chat_graph(llm=llm)
                state: ChatState = {
                    "messages": [HumanMessage(content=req.message)],
                    "session_id": req.session_id,
                    "system_prompt": "",
                }

            log.info("chat.stream.start", session_id=req.session_id, use_rag=req.use_rag)
            async for token in agent.stream(state):
                yield f"data: {token}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            log.error("chat.stream.error", error=str(e))
            yield f"data: Error: {e}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
