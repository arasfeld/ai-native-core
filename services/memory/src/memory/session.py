"""Session memory — persists per-session conversation history in Postgres."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

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

CREATE TABLE IF NOT EXISTS session_token_usage (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    tenant_id   BIGINT,
    tokens      INTEGER     NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS session_token_usage_session_id_idx
    ON session_token_usage (session_id);
CREATE INDEX IF NOT EXISTS session_token_usage_tenant_id_idx
    ON session_token_usage (tenant_id, recorded_at);
"""


class SessionStore:
    """Stores and retrieves per-session conversation turns from Postgres.

    Accepts an optional ``asyncpg.Pool`` for connection reuse.  Falls back to
    opening a single connection per call when no pool is supplied.

    Usage::

        # With a shared pool (preferred in long-running servers)
        pool = await asyncpg.create_pool(database_url)
        store = SessionStore(pool=pool)
        await store.ensure_table()

        history = await store.get_messages(session_id)
        await store.add_message(session_id, "human", text)
        await store.add_message(session_id, "assistant", reply)
    """

    def __init__(
        self,
        pool: asyncpg.Pool | None = None,
        database_url: str | None = None,
    ) -> None:
        self._pool = pool
        self._database_url = database_url or os.environ["DATABASE_URL"]

    @asynccontextmanager
    async def _conn(self) -> AsyncIterator[asyncpg.Connection]:
        if self._pool is not None:
            async with self._pool.acquire() as conn:
                yield conn
        else:
            conn = await asyncpg.connect(self._database_url)
            try:
                yield conn
            finally:
                await conn.close()

    async def ensure_table(self) -> None:
        """Create the chat_sessions table if it does not exist."""
        async with self._conn() as conn:
            await conn.execute(_CREATE_TABLE)
            log.debug("memory.session.table_ready")

    async def get_messages(self, session_id: str) -> list[BaseMessage]:
        """Return full conversation history for a session, oldest-first."""
        async with self._conn() as conn:
            rows = await conn.fetch(
                """
                SELECT role, content
                FROM chat_sessions
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session_id,
            )

        messages: list[BaseMessage] = []
        for row in rows:
            if row["role"] == "human":
                messages.append(HumanMessage(content=row["content"]))
            elif row["role"] == "assistant":
                messages.append(AIMessage(content=row["content"]))
        return messages

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Append a single turn to the session history."""
        async with self._conn() as conn:
            await conn.execute(
                """
                INSERT INTO chat_sessions (session_id, role, content)
                VALUES ($1, $2, $3)
                """,
                session_id,
                role,
                content,
            )

    async def clear(self, session_id: str) -> None:
        """Delete all messages for a session."""
        async with self._conn() as conn:
            await conn.execute(
                "DELETE FROM chat_sessions WHERE session_id = $1",
                session_id,
            )
        log.info("memory.session.cleared", session_id=session_id)

    async def add_token_usage(
        self, session_id: str, tokens: int, tenant_id: int | None = None
    ) -> None:
        """Record token consumption for a session turn."""
        async with self._conn() as conn:
            await conn.execute(
                "INSERT INTO session_token_usage (session_id, tenant_id, tokens) VALUES ($1, $2, $3)",
                session_id,
                tenant_id,
                tokens,
            )

    async def get_token_usage(self, session_id: str) -> int:
        """Return total tokens consumed by a session."""
        async with self._conn() as conn:
            row = await conn.fetchrow(
                "SELECT COALESCE(SUM(tokens), 0) AS total FROM session_token_usage WHERE session_id = $1",
                session_id,
            )
        return int(row["total"])
