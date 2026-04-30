"""Admin router — tenant management (list, patch plan/limits)."""

from __future__ import annotations

from datetime import datetime

import asyncpg
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..rbac import Permission, require_permission

log = structlog.get_logger()
router = APIRouter(prefix="/admin/tenants", tags=["admin"])

_BASE_QUERY = """
    SELECT
        t.id,
        u.email,
        u.name,
        t.plan,
        t."tokenLimit"           AS token_limit,
        t."stripeCustomerId"     AS stripe_customer_id,
        t."stripeSubscriptionId" AS stripe_subscription_id,
        t."createdAt"            AS created_at,
        COALESCE(stu.tokens_used, 0)::int AS tokens_used
    FROM tenants t
    JOIN "user" u ON u.id = t.id
    LEFT JOIN (
        SELECT tenant_id, SUM(tokens) AS tokens_used
        FROM session_token_usage
        WHERE date_trunc('month', recorded_at) = date_trunc('month', NOW())
        GROUP BY tenant_id
    ) stu ON stu.tenant_id = t.id
"""


class AdminTenantOut(BaseModel):
    id: str
    email: str
    name: str | None
    plan: str
    token_limit: int
    tokens_used: int
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    created_at: datetime


class PatchTenantIn(BaseModel):
    plan: str | None = None
    token_limit: int | None = None


def _row_to_tenant(row: asyncpg.Record) -> AdminTenantOut:
    return AdminTenantOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
        token_limit=row["token_limit"],
        tokens_used=row["tokens_used"],
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        created_at=row["created_at"],
    )


@router.get(
    "",
    response_model=list[AdminTenantOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_tenants(request: Request) -> list[AdminTenantOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch(_BASE_QUERY + ' ORDER BY t."createdAt" DESC LIMIT 200')
    return [_row_to_tenant(r) for r in rows]


@router.patch(
    "/{tenant_id}",
    response_model=AdminTenantOut,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def patch_tenant(tenant_id: str, body: PatchTenantIn, request: Request) -> AdminTenantOut:
    pool: asyncpg.Pool = request.app.state.db_pool
    if body.plan is not None:
        await pool.execute("UPDATE tenants SET plan = $1 WHERE id = $2", body.plan, tenant_id)
    if body.token_limit is not None:
        await pool.execute(
            'UPDATE tenants SET "tokenLimit" = $1 WHERE id = $2', body.token_limit, tenant_id
        )
    row = await pool.fetchrow(_BASE_QUERY + " WHERE t.id = $1", tenant_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    log.info("admin.tenant.patched", tenant_id=tenant_id, plan=body.plan)
    return _row_to_tenant(row)
