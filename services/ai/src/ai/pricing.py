"""Per-model unit cost lookup and dollar-cost computation.

Reads the ``model_pricing`` table (seeded in migration ``0018_model_pricing.sql``)
into an in-memory map keyed by ``(provider, model)``. Rates are USD per 1M tokens
for input and output respectively.

The cache is loaded once at app startup via :func:`load_pricing` and kept on
``app.state.pricing``. Admin updates write to the DB and re-load by calling
:meth:`PricingTable.upsert`/:meth:`PricingTable.delete` so the in-memory map
stays in sync without a full reload.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import structlog

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class ModelRate:
    provider: str
    model: str
    input_usd_per_mtok: Decimal
    output_usd_per_mtok: Decimal
    is_override: bool


class PricingTable:
    """In-memory model_pricing cache with DB-backed mutations."""

    def __init__(self, pool: Any, rates: dict[tuple[str, str], ModelRate]):
        self._pool = pool
        self._rates = rates

    @property
    def rates(self) -> dict[tuple[str, str], ModelRate]:
        return self._rates

    def get(self, provider: str, model: str | None) -> ModelRate | None:
        if not model:
            return None
        return self._rates.get((provider, model))

    def compute_cost(
        self,
        provider: str,
        model: str | None,
        input_tokens: int,
        output_tokens: int,
    ) -> Decimal | None:
        """Return USD cost for the given token counts, or ``None`` if unpriced.

        ``None`` lets callers distinguish "we don't know" from "$0.00" (Ollama).
        """
        rate = self.get(provider, model)
        if rate is None:
            return None
        in_cost = (Decimal(input_tokens) * rate.input_usd_per_mtok) / Decimal(1_000_000)
        out_cost = (Decimal(output_tokens) * rate.output_usd_per_mtok) / Decimal(1_000_000)
        return (in_cost + out_cost).quantize(Decimal("0.000001"))

    async def upsert(
        self,
        provider: str,
        model: str,
        input_usd_per_mtok: Decimal,
        output_usd_per_mtok: Decimal,
    ) -> ModelRate:
        await self._pool.execute(
            """
            INSERT INTO model_pricing
              (provider, model, input_usd_per_mtok, output_usd_per_mtok, is_override, updated_at)
            VALUES ($1, $2, $3, $4, TRUE, NOW())
            ON CONFLICT (provider, model)
            DO UPDATE SET
              input_usd_per_mtok = EXCLUDED.input_usd_per_mtok,
              output_usd_per_mtok = EXCLUDED.output_usd_per_mtok,
              is_override = TRUE,
              updated_at = NOW()
            """,
            provider,
            model,
            input_usd_per_mtok,
            output_usd_per_mtok,
        )
        rate = ModelRate(
            provider=provider,
            model=model,
            input_usd_per_mtok=input_usd_per_mtok,
            output_usd_per_mtok=output_usd_per_mtok,
            is_override=True,
        )
        self._rates[(provider, model)] = rate
        return rate

    async def delete(self, provider: str, model: str) -> bool:
        """Remove an override row and drop it from the cache.

        Returns True when a row was deleted. The caller can re-run the seed
        migration to restore the default rate if desired.
        """
        result = await self._pool.execute(
            "DELETE FROM model_pricing WHERE provider = $1 AND model = $2",
            provider,
            model,
        )
        existed = self._rates.pop((provider, model), None) is not None
        return existed or result.endswith(" 1")


async def load_pricing(pool: Any) -> PricingTable:
    """Read all model_pricing rows into an in-memory ``PricingTable``."""
    try:
        rows = await pool.fetch(
            "SELECT provider, model, input_usd_per_mtok, output_usd_per_mtok, is_override "
            "FROM model_pricing"
        )
    except Exception as exc:
        log.warning("pricing.load_failed", error=str(exc))
        return PricingTable(pool=pool, rates={})

    rates: dict[tuple[str, str], ModelRate] = {}
    for row in rows:
        rate = ModelRate(
            provider=row["provider"],
            model=row["model"],
            input_usd_per_mtok=row["input_usd_per_mtok"],
            output_usd_per_mtok=row["output_usd_per_mtok"],
            is_override=row["is_override"],
        )
        rates[(rate.provider, rate.model)] = rate
    log.info("pricing.loaded", count=len(rates))
    return PricingTable(pool=pool, rates=rates)
