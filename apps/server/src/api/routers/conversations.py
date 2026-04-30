"""Conversations router — CRUD for named chat sessions."""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth.deps import AuthUser, get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/conversations", tags=["conversations"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str | None = None
    updated_at: str | None = None


class CreateConversationRequest(BaseModel):
    id: str


class PatchConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class MessageOut(BaseModel):
    role: str
    content: str


def _get_pool(request: Request):
    return request.app.state.db_pool


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    rows = await pool.fetch(
        "SELECT id, title, created_at, updated_at FROM conversations "
        "WHERE user_id = $1 ORDER BY updated_at DESC",
        user.id,
    )
    return [
        ConversationOut(
            id=row["id"],
            title=row["title"],
            created_at=row["created_at"].isoformat() if row["created_at"] else None,
            updated_at=row["updated_at"].isoformat() if row["updated_at"] else None,
        )
        for row in rows
    ]


@router.post("", response_model=ConversationOut)
async def create_conversation(body: CreateConversationRequest, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    await pool.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, 'New chat') "
        "ON CONFLICT (id) DO NOTHING",
        body.id,
        user.id,
    )
    return ConversationOut(id=body.id, title="New chat")


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(conversation_id: str, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    scoped_id = f"{user.id}:{conversation_id}"
    rows = await pool.fetch(
        "SELECT role, content FROM chat_sessions WHERE session_id = $1 ORDER BY id ASC",
        scoped_id,
    )
    return [MessageOut(role=r["role"], content=r["content"]) for r in rows]


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: str,
    body: PatchConversationRequest,
    user: CurrentUser,
    request: Request,
):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await pool.execute(
        "UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2",
        body.title,
        conversation_id,
    )
    return ConversationOut(id=conversation_id, title=body.title)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    scoped_id = f"{user.id}:{conversation_id}"
    await pool.execute("DELETE FROM chat_sessions WHERE session_id = $1", scoped_id)
    await pool.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
