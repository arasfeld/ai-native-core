"""Session memory — persists per-session conversation history in Postgres."""

from __future__ import annotations

import contextlib
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from decimal import Decimal

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
    id            BIGSERIAL PRIMARY KEY,
    session_id    TEXT        NOT NULL,
    tenant_id     TEXT,
    tokens        INTEGER     NOT NULL,
    provider      TEXT,
    model         TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    cost_usd      NUMERIC(12, 6),
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE session_token_usage
    ADD COLUMN IF NOT EXISTS tenant_id     TEXT,
    ADD COLUMN IF NOT EXISTS provider      TEXT,
    ADD COLUMN IF NOT EXISTS model         TEXT,
    ADD COLUMN IF NOT EXISTS input_tokens  INTEGER,
    ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS cost_usd      NUMERIC(12, 6);
CREATE INDEX IF NOT EXISTS session_token_usage_session_id_idx
    ON session_token_usage (session_id);
CREATE INDEX IF NOT EXISTS session_token_usage_tenant_id_idx
    ON session_token_usage (tenant_id, recorded_at);
CREATE INDEX IF NOT EXISTS session_token_usage_provider_model_idx
    ON session_token_usage (provider, model);
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
            content = row["content"]
            # Attempt to parse JSON for multi-modal content
            if content.startswith("[") or content.startswith("{"):
                with contextlib.suppress(json.JSONDecodeError):
                    content = json.loads(content)

            if row["role"] == "human":
                messages.append(HumanMessage(content=content))
            elif row["role"] == "assistant":
                messages.append(AIMessage(content=content))
        return messages

    async def add_message(self, session_id: str, role: str, content: str | list | dict) -> None:
        """Append a single turn to the session history."""
        content_str = content if isinstance(content, str) else json.dumps(content)

        async with self._conn() as conn:
            await conn.execute(
                """
                INSERT INTO chat_sessions (session_id, role, content)
                VALUES ($1, $2, $3)
                """,
                session_id,
                role,
                content_str,
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
        self,
        session_id: str,
        tokens: int,
        tenant_id: str | None = None,
        *,
        provider: str | None = None,
        model: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        cost_usd: Decimal | None = None,
    ) -> None:
        """Record token consumption for a session turn.

        ``provider``/``model`` and the input/output split are optional so
        callers without that information (older callers, embedding endpoints,
        background jobs) still get a row written. ``cost_usd`` should be
        precomputed by the caller against the ``model_pricing`` cache.
        """
        async with self._conn() as conn:
            await conn.execute(
                """
                INSERT INTO session_token_usage
                  (session_id, tenant_id, tokens, provider, model,
                   input_tokens, output_tokens, cost_usd)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                session_id,
                tenant_id,
                tokens,
                provider,
                model,
                input_tokens,
                output_tokens,
                cost_usd,
            )

    async def get_token_usage(self, session_id: str) -> int:
        """Return total tokens consumed by a session."""
        async with self._conn() as conn:
            row = await conn.fetchrow(
                "SELECT COALESCE(SUM(tokens), 0) AS total FROM session_token_usage WHERE session_id = $1",
                session_id,
            )
        return int(row["total"])

    async def get_monthly_tenant_usage(self, tenant_id: str) -> int:
        """Return total tokens consumed by a tenant in the current calendar month."""
        async with self._conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT COALESCE(SUM(tokens), 0) AS total
                FROM session_token_usage
                WHERE tenant_id = $1
                  AND date_trunc('month', recorded_at) = date_trunc('month', NOW())
                """,
                tenant_id,
            )
        return int(row["total"])

    async def get_monthly_tenant_cost(self, tenant_id: str) -> Decimal:
        """Return total USD cost recorded for a tenant in the current calendar month.

        Rows with NULL ``cost_usd`` (older usage, Ollama, embedding endpoints
        without a pricing entry) are treated as zero so the sum stays
        well-defined.
        """
        async with self._conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT COALESCE(SUM(cost_usd), 0) AS total
                FROM session_token_usage
                WHERE tenant_id = $1
                  AND date_trunc('month', recorded_at) = date_trunc('month', NOW())
                """,
                tenant_id,
            )
        return Decimal(row["total"])
