"""Per-session token budget enforcement."""

from __future__ import annotations

import structlog

from .session import SessionStore

log = structlog.get_logger()


class BudgetExceeded(Exception):
    """Raised when a session has consumed its token budget."""

    def __init__(self, session_id: str, used: int, limit: int) -> None:
        self.session_id = session_id
        self.used = used
        self.limit = limit
        super().__init__(
            f"Session '{session_id}' exceeded token budget: {used}/{limit} tokens used."
        )


def estimate_tokens(text: str) -> int:
    """Rough token estimate based on character count (~4 chars per token)."""
    return max(1, len(text) // 4)


class TokenBudget:
    """Enforces a per-session token limit backed by Postgres.

    Usage::

        budget = TokenBudget(store, limit=100_000)

        # Before running the agent:
        await budget.check(session_id)          # raises BudgetExceeded if over limit

        # After the agent responds:
        await budget.record(session_id, tokens) # persist consumed tokens
    """

    def __init__(self, store: SessionStore, limit: int = 100_000) -> None:
        self._store = store
        self._limit = limit

    async def remaining(self, session_id: str) -> int:
        """Return tokens remaining in the budget for this session."""
        used = await self._store.get_token_usage(session_id)
        return max(0, self._limit - used)

    async def check(self, session_id: str) -> None:
        """Raise ``BudgetExceeded`` if the session is at or over the limit."""
        used = await self._store.get_token_usage(session_id)
        if used >= self._limit:
            log.warning(
                "budget.exceeded",
                session_id=session_id,
                used=used,
                limit=self._limit,
            )
            raise BudgetExceeded(session_id=session_id, used=used, limit=self._limit)

    async def record(self, session_id: str, tokens: int) -> None:
        """Persist token consumption for a session turn."""
        await self._store.add_token_usage(session_id, tokens)
        log.debug("budget.recorded", session_id=session_id, tokens=tokens)
