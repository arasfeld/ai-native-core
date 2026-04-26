"""Chat router — thin HTTP adapter. All orchestration is in ChatService."""
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import CurrentUser
from ..services.chat_service import ChatService

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


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


ChatServiceDep = Depends(get_chat_service)


@router.post("")
async def chat(
    req: ChatRequest,
    current_user: CurrentUser,
    chat_service: ChatService = ChatServiceDep,
) -> StreamingResponse:
    """Stream a chat response via Server-Sent Events."""
    return StreamingResponse(
        chat_service.stream(req, current_user),
        media_type="text/event-stream",
    )
