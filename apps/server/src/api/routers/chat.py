"""Chat router — thin HTTP adapter. All orchestration is in ChatService."""
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import OptionalUser
from ..auth.deps import AuthUser
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


def _guest_user_from_ip(ip: str) -> AuthUser:
    """Derive a stable, anonymous AuthUser from the client IP."""
    return AuthUser(id=f"guest:{ip}", email="guest@anonymous")


@router.post("")
async def chat(
    req: ChatRequest,
    request: Request,
    current_user: OptionalUser,
    chat_service: ChatService = ChatServiceDep,
) -> StreamingResponse:
    """Stream a chat response via Server-Sent Events. Auth is optional; guests use IP-based identity."""
    user = current_user or _guest_user_from_ip(
        request.client.host if request.client else "unknown"
    )
    return StreamingResponse(
        chat_service.stream(req, user, is_guest=current_user is None),
        media_type="text/event-stream",
    )
