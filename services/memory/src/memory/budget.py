"""Per-session token budget enforcement."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import structlog

from .session import SessionStore

log = structlog.get_logger()


class BudgetExceeded(Exception):
    """Raised when a session has consumed its token (or dollar) budget."""

    def __init__(
        self,
        session_id: str,
        used: int | Decimal,
        limit: int | Decimal,
        *,
        mode: str = "tokens",
    ) -> None:
        self.session_id = session_id
        self.used = used
        self.limit = limit
        self.mode = mode
        unit = "tokens" if mode == "tokens" else "USD"
        super().__init__(
            f"Session '{session_id}' exceeded {mode} budget: {used}/{limit} {unit} used."
        )


def estimate_tokens(content: Any) -> int:
    """Rough token estimate based on character count (~4 chars per token)."""
    if isinstance(content, str):
        return max(1, len(content) // 4)
    try:
        return max(1, len(json.dumps(content)) // 4)
    except (TypeError, ValueError):
        return 1


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


class TenantMonthlyBudget:
    """Enforces a monthly limit aggregated across all sessions for a tenant.

    Defaults to a token limit. If ``cost_limit_usd`` is supplied the budget
    switches to dollar enforcement instead — used vs. limit is read from
    ``cost_usd`` on each ``session_token_usage`` row (which the
    :class:`SessionStore` populates from the pricing table at record time).
    Guests stay token-capped — never pass a ``cost_limit_usd`` for them.

    Usage::

        # Token budget (default)
        budget = TenantMonthlyBudget(store, limit=100_000)

        # Dollar budget
        budget = TenantMonthlyBudget(store, cost_limit_usd=Decimal("25.00"))
    """

    def __init__(
        self,
        store: SessionStore,
        limit: int = 100_000,
        *,
        cost_limit_usd: Decimal | None = None,
    ) -> None:
        self._store = store
        self._limit = limit
        self._cost_limit_usd = cost_limit_usd

    @property
    def mode(self) -> str:
        return "cost" if self._cost_limit_usd is not None else "tokens"

    async def remaining(self, tenant_id: str) -> int | Decimal:
        if self._cost_limit_usd is not None:
            used = await self._store.get_monthly_tenant_cost(tenant_id)
            return max(Decimal("0"), self._cost_limit_usd - used)
        used = await self._store.get_monthly_tenant_usage(tenant_id)
        return max(0, self._limit - used)

    async def check(self, tenant_id: str) -> None:
        """Raise ``BudgetExceeded`` if the tenant is at or over their monthly limit."""
        if self._cost_limit_usd is not None:
            used_cost = await self._store.get_monthly_tenant_cost(tenant_id)
            if used_cost >= self._cost_limit_usd:
                log.warning(
                    "budget.monthly.cost_exceeded",
                    tenant_id=tenant_id,
                    used_usd=str(used_cost),
                    limit_usd=str(self._cost_limit_usd),
                )
                raise BudgetExceeded(
                    session_id=tenant_id,
                    used=used_cost,
                    limit=self._cost_limit_usd,
                    mode="cost",
                )
            return

        used = await self._store.get_monthly_tenant_usage(tenant_id)
        if used >= self._limit:
            log.warning(
                "budget.monthly.exceeded",
                tenant_id=tenant_id,
                used=used,
                limit=self._limit,
            )
            raise BudgetExceeded(session_id=tenant_id, used=used, limit=self._limit)
