"""Admin router — per-model unit pricing (USD per 1M tokens).

Reads/writes the ``model_pricing`` table and keeps ``app.state.pricing`` in sync.
Seeded rows are returned alongside overrides; ``is_override`` distinguishes
admin edits from defaults. Deleting an override drops it from the cache; the
seed row only comes back if the migration is re-run.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..auth import CurrentUser
from ..rbac import Permission, require_permission
from ..services.audit import get_client_ip, log_audit_event

log = structlog.get_logger()
router = APIRouter(prefix="/admin/pricing", tags=["admin"])


class ModelPricingOut(BaseModel):
    provider: str
    model: str
    input_usd_per_mtok: Decimal
    output_usd_per_mtok: Decimal
    is_override: bool
    updated_at: datetime | None = None


class ModelPricingUpsert(BaseModel):
    input_usd_per_mtok: Decimal = Field(ge=0)
    output_usd_per_mtok: Decimal = Field(ge=0)


@router.get(
    "",
    response_model=list[ModelPricingOut],
    dependencies=[require_permission(Permission.ADMIN_BILLING_READ)],
)
async def list_pricing(request: Request) -> list[ModelPricingOut]:
    pool = request.app.state.db_pool
    rows = await pool.fetch(
        "SELECT provider, model, input_usd_per_mtok, output_usd_per_mtok, "
        "is_override, updated_at FROM model_pricing "
        "ORDER BY provider, model"
    )
    return [ModelPricingOut(**dict(row)) for row in rows]


@router.put(
    "/{provider}/{model:path}",
    response_model=ModelPricingOut,
    dependencies=[require_permission(Permission.ADMIN_BILLING_WRITE)],
)
async def upsert_pricing(
    provider: str,
    model: str,
    body: ModelPricingUpsert,
    request: Request,
    current_user: CurrentUser,
) -> ModelPricingOut:
    pricing = request.app.state.pricing
    rate = await pricing.upsert(
        provider=provider,
        model=model,
        input_usd_per_mtok=body.input_usd_per_mtok,
        output_usd_per_mtok=body.output_usd_per_mtok,
    )

    log_audit_event(
        request.app.state.db_pool,
        actor_id=current_user.id,
        action="pricing.update",
        resource_type="model_pricing",
        resource_id=f"{provider}/{model}",
        metadata={
            "input_usd_per_mtok": str(body.input_usd_per_mtok),
            "output_usd_per_mtok": str(body.output_usd_per_mtok),
        },
        ip_address=get_client_ip(request),
    )

    return ModelPricingOut(
        provider=rate.provider,
        model=rate.model,
        input_usd_per_mtok=rate.input_usd_per_mtok,
        output_usd_per_mtok=rate.output_usd_per_mtok,
        is_override=True,
    )


@router.delete(
    "/{provider}/{model:path}",
    status_code=204,
    dependencies=[require_permission(Permission.ADMIN_BILLING_WRITE)],
)
async def delete_pricing(
    provider: str,
    model: str,
    request: Request,
    current_user: CurrentUser,
) -> Response:
    pricing = request.app.state.pricing
    removed = await pricing.delete(provider, model)
    if not removed:
        raise HTTPException(status_code=404, detail="pricing row not found")

    log_audit_event(
        request.app.state.db_pool,
        actor_id=current_user.id,
        action="pricing.delete",
        resource_type="model_pricing",
        resource_id=f"{provider}/{model}",
        ip_address=get_client_ip(request),
    )
    return Response(status_code=204)
