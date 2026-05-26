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
    system_instructions: str = ""
    created_at: str | None = None
    updated_at: str | None = None


class CreateConversationRequest(BaseModel):
    id: str


class PatchConversationRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    system_instructions: str | None = None


class MessageOut(BaseModel):
    role: str
    content: str


class SearchResult(BaseModel):
    conversation_id: str
    title: str
    updated_at: str | None = None
    match_type: str  # "title" | "message"
    snippet: str
    role: str | None = None


def _get_pool(request: Request):
    return request.app.state.db_pool


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    rows = await pool.fetch(
        "SELECT id, title, system_instructions, created_at, updated_at FROM conversations "
        "WHERE user_id = $1 ORDER BY updated_at DESC",
        user.id,
    )
    return [
        ConversationOut(
            id=row["id"],
            title=row["title"],
            system_instructions=row["system_instructions"],
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


@router.get("/search", response_model=list[SearchResult])
async def search_conversations(
    user: CurrentUser,
    request: Request,
    q: str = "",
    limit: int = 30,
):
    """Full-text search across the user's conversation titles and message content."""
    query = q.strip()
    if len(query) < 2:
        return []
    limit = max(1, min(limit, 100))
    pool = _get_pool(request)
    # \x02/\x03 are STX/ETX — used as highlight sentinels in the snippet so
    # the frontend can safely render <mark> without trusting raw HTML.
    rows = await pool.fetch(
        """
        WITH q AS (
          SELECT websearch_to_tsquery('english', $2) AS tsq
        ),
        title_matches AS (
          SELECT
            c.id   AS conversation_id,
            c.title,
            c.updated_at,
            'title'::text AS match_type,
            ts_headline(
              'english', c.title, q.tsq,
              'StartSel=' || chr(2) || ', StopSel=' || chr(3) || ', HighlightAll=true'
            ) AS snippet,
            2.0::real AS rank,
            NULL::text AS role
          FROM conversations c, q
          WHERE c.user_id = $1
            AND (to_tsvector('english', c.title) @@ q.tsq OR c.title ILIKE '%' || $2 || '%')
        ),
        msg_matches AS (
          SELECT DISTINCT ON (c.id)
            c.id   AS conversation_id,
            c.title,
            c.updated_at,
            'message'::text AS match_type,
            ts_headline(
              'english', cs.content, q.tsq,
              'StartSel=' || chr(2) || ', StopSel=' || chr(3) || ', MaxFragments=1, MaxWords=20, MinWords=5'
            ) AS snippet,
            ts_rank(to_tsvector('english', cs.content), q.tsq) AS rank,
            cs.role
          FROM conversations c
          JOIN chat_sessions cs ON cs.session_id = $1 || ':' || c.id
          CROSS JOIN q
          WHERE c.user_id = $1
            AND to_tsvector('english', cs.content) @@ q.tsq
          ORDER BY c.id, ts_rank(to_tsvector('english', cs.content), q.tsq) DESC
        )
        SELECT conversation_id, title, updated_at, match_type, snippet, rank, role
        FROM (
          SELECT * FROM title_matches
          UNION ALL
          SELECT * FROM msg_matches
          WHERE conversation_id NOT IN (SELECT conversation_id FROM title_matches)
        ) combined
        ORDER BY rank DESC, updated_at DESC
        LIMIT $3
        """,
        user.id,
        query,
        limit,
    )
    return [
        SearchResult(
            conversation_id=r["conversation_id"],
            title=r["title"],
            updated_at=r["updated_at"].isoformat() if r["updated_at"] else None,
            match_type=r["match_type"],
            snippet=r["snippet"],
            role=r["role"],
        )
        for r in rows
    ]


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
async def patch_conversation(
    conversation_id: str,
    body: PatchConversationRequest,
    user: CurrentUser,
    request: Request,
):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id, title, system_instructions FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    new_title = body.title if body.title is not None else row["title"]
    new_instructions = (
        body.system_instructions
        if body.system_instructions is not None
        else row["system_instructions"]
    )

    await pool.execute(
        "UPDATE conversations SET title = $1, system_instructions = $2, updated_at = NOW() WHERE id = $3",
        new_title,
        new_instructions,
        conversation_id,
    )
    return ConversationOut(
        id=conversation_id, title=new_title, system_instructions=new_instructions
    )


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
