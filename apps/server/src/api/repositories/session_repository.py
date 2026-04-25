"""Session data access — wraps SessionStore and token budget logic."""
from __future__ import annotations

import asyncpg
from langchain_core.messages import BaseMessage
from memory import BudgetExceeded, SessionStore, TokenBudget


class SessionRepository:
    """All session-related data access. SQL and token budget logic lives here."""

    def __init__(
        self,
        store: SessionStore,
        pool: asyncpg.Pool,
        default_limit: int = 100_000,
    ) -> None:
        self._store = store
        self._pool = pool
        self._default_limit = default_limit

    @staticmethod
    def scope(user_id: str, session_id: str) -> str:
        """Return a user-scoped session ID string."""
        return f"{user_id}:{session_id}"

    async def get_messages(self, session_id: str) -> list[BaseMessage]:
        return await self._store.get_messages(session_id)

    async def save_message(self, session_id: str, role: str, content) -> None:
        await self._store.add_message(session_id, role, content)

    async def add_token_usage(
        self, session_id: str, tokens: int, tenant_id: str
    ) -> None:
        await self._store.add_token_usage(session_id, tokens, tenant_id=tenant_id)

    async def get_token_limit(self, user_id: str) -> int:
        row = await self._pool.fetchrow(
            "SELECT token_limit FROM tenants WHERE id = $1", user_id
        )
        return row["token_limit"] if row else self._default_limit

    async def check_budget(self, session_id: str, user_id: str) -> None:
        """Raise BudgetExceeded if the session has consumed its token budget."""
        limit = await self.get_token_limit(user_id)
        budget = TokenBudget(self._store, limit=limit)
        await budget.check(session_id)
