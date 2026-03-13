"""Auth routes — user info."""

from __future__ import annotations

import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from ..auth import CurrentUser

log = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])


class UserOut(BaseModel):
    id: str
    email: str


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    """Return the currently authenticated user."""
    return UserOut(id=current_user.id, email=current_user.email)
