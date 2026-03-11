"""Session memory — persists per-session conversation history in Postgres."""

from __future__ import annotations

import os

import asyncpg
import structlog
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

log = structlog.get_logger()

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    role        TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_sessions_session_id_idx
    ON chat_sessions (session_id, created_at);
"""


class SessionStore:
    """Stores and retrieves per-session conversation turns from Postgres.

    Usage::

        store = SessionStore()
        await store.ensure_table()   # once at startup
        history = await store.get_messages(session_id)
        await store.add_message(session_id, "human", text)
        await store.add_message(session_id, "assistant", reply)
    """

    def __init__(self, database_url: str | None = None) -> None:
        self._database_url = database_url or os.environ["DATABASE_URL"]

    async def ensure_table(self) -> None:
        """Create the chat_sessions table if it does not exist."""
        conn = await asyncpg.connect(self._database_url)
        try:
            await conn.execute(_CREATE_TABLE)
            log.debug("memory.session.table_ready")
        finally:
            await conn.close()

    async def get_messages(self, session_id: str) -> list[BaseMessage]:
        """Return full conversation history for a session, oldest-first."""
        conn = await asyncpg.connect(self._database_url)
        try:
            rows = await conn.fetch(
                """
                SELECT role, content
                FROM chat_sessions
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session_id,
            )
        finally:
            await conn.close()

        messages: list[BaseMessage] = []
        for row in rows:
            if row["role"] == "human":
                messages.append(HumanMessage(content=row["content"]))
            elif row["role"] == "assistant":
                messages.append(AIMessage(content=row["content"]))
        return messages

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Append a single turn to the session history."""
        conn = await asyncpg.connect(self._database_url)
        try:
            await conn.execute(
                """
                INSERT INTO chat_sessions (session_id, role, content)
                VALUES ($1, $2, $3)
                """,
                session_id,
                role,
                content,
            )
        finally:
            await conn.close()

    async def clear(self, session_id: str) -> None:
        """Delete all messages for a session."""
        conn = await asyncpg.connect(self._database_url)
        try:
            await conn.execute(
                "DELETE FROM chat_sessions WHERE session_id = $1",
                session_id,
            )
            log.info("memory.session.cleared", session_id=session_id)
        finally:
            await conn.close()
