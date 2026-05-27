"""Feedback router — captures thumbs-up / thumbs-down on assistant messages.

Open to both registered users and guests so that the eval signal is not
limited to authenticated traffic. Guests are identified by IP, matching the
chat router's convention.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth import OptionalUser
from ..auth.deps import AuthUser
from ..services.feedback_service import FeedbackService

log = structlog.get_logger()
router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    run_id: uuid.UUID
    rating: int = Field(..., description="Thumbs up = 1, thumbs down = -1")
    session_id: str = Field(..., min_length=1)
    comment: str | None = Field(None, max_length=2000)


class FeedbackResponse(BaseModel):
    id: uuid.UUID


def _guest_user_from_ip(ip: str) -> AuthUser:
    return AuthUser(id=f"guest:{ip}", email="guest@anonymous")


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    body: FeedbackRequest,
    request: Request,
    current_user: OptionalUser,
) -> FeedbackResponse:
    if body.rating not in (-1, 1):
        raise HTTPException(status_code=422, detail="rating must be -1 or 1")

    user = current_user or _guest_user_from_ip(request.client.host if request.client else "unknown")
    is_guest = current_user is None
    tenant_id = user.org_id if not is_guest and user.org_id else user.id

    service = FeedbackService(pool=request.app.state.db_pool)
    try:
        feedback_id = await service.record(
            run_id=body.run_id,
            rating=body.rating,
            session_id=body.session_id,
            tenant_id=tenant_id,
            user_id=None if is_guest else user.id,
            comment=body.comment,
        )
    except Exception as exc:
        log.error("feedback.insert_failed", run_id=str(body.run_id), error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to record feedback") from exc

    log.info(
        "feedback.recorded",
        run_id=str(body.run_id),
        rating=body.rating,
        tenant_id=tenant_id,
        is_guest=is_guest,
    )
    return FeedbackResponse(id=feedback_id)
