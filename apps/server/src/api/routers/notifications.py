"""Notifications router — list, mark read, mark all read."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth.deps import AuthUser, get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime


def _pool(request: Request):
    return request.app.state.db_pool


@router.get("", response_model=list[NotificationOut])
async def list_notifications(user: CurrentUser, request: Request):
    pool = _pool(request)
    rows = await pool.fetch(
        "SELECT id, type, title, body, read_at, created_at "
        "FROM notifications WHERE user_id = $1 "
        "ORDER BY read_at NULLS FIRST, created_at DESC "
        "LIMIT 20",
        user.id,
    )
    return [
        NotificationOut(
            id=str(row["id"]),
            type=row["type"],
            title=row["title"],
            body=row["body"],
            read_at=row["read_at"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.patch("/read-all", status_code=204)
async def mark_all_read(user: CurrentUser, request: Request):
    pool = _pool(request)
    await pool.execute(
        "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
        user.id,
    )


@router.patch("/{notification_id}/read", status_code=204)
async def mark_one_read(notification_id: str, user: CurrentUser, request: Request):
    pool = _pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM notifications WHERE id = $1::uuid AND user_id = $2",
        notification_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    await pool.execute(
        "UPDATE notifications SET read_at = NOW() WHERE id = $1::uuid",
        notification_id,
    )
