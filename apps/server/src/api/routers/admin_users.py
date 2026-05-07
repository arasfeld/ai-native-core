"""Admin router — user management (list, ban, unban, delete)."""

from __future__ import annotations

from datetime import datetime

import asyncpg
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import CurrentUser
from ..rbac import Permission, require_permission
from ..services.audit import get_client_ip, log_audit_event

log = structlog.get_logger()
router = APIRouter(prefix="/admin/users", tags=["admin"])

_BASE_QUERY = """
    SELECT
        u.id,
        u.email,
        u.name,
        u."isAdmin"    AS is_admin,
        u.banned,
        u."createdAt"  AS created_at,
        t.plan,
        t."tokenLimit" AS token_limit,
        COALESCE(stu.tokens_used, 0)::int AS tokens_used
    FROM "user" u
    LEFT JOIN tenants t ON t.id = u.id
    LEFT JOIN (
        SELECT tenant_id, SUM(tokens) AS tokens_used
        FROM session_token_usage
        WHERE date_trunc('month', recorded_at) = date_trunc('month', NOW())
        GROUP BY tenant_id
    ) stu ON stu.tenant_id = u.id
"""


class AdminUserOut(BaseModel):
    id: str
    email: str
    name: str | None
    is_admin: bool
    banned: bool
    plan: str | None
    token_limit: int | None
    tokens_used: int
    created_at: datetime


def _row_to_user(row: asyncpg.Record) -> AdminUserOut:
    return AdminUserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        is_admin=row["is_admin"],
        banned=row["banned"],
        plan=row["plan"],
        token_limit=row["token_limit"],
        tokens_used=row["tokens_used"],
        created_at=row["created_at"],
    )


@router.get(
    "",
    response_model=list[AdminUserOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_users(request: Request, search: str = "") -> list[AdminUserOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    if search:
        rows = await pool.fetch(
            _BASE_QUERY
            + ' WHERE u.email ILIKE $1 OR u.name ILIKE $1 ORDER BY u."createdAt" DESC LIMIT 100',
            f"%{search}%",
        )
    else:
        rows = await pool.fetch(
            _BASE_QUERY + ' ORDER BY u."createdAt" DESC LIMIT 100',
        )
    return [_row_to_user(r) for r in rows]


@router.post(
    "/{user_id}/ban",
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def ban_user(user_id: str, request: Request, actor: CurrentUser) -> dict:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute('UPDATE "user" SET banned = TRUE WHERE id = $1', user_id)
    log_audit_event(pool, actor.id, "user.banned", "user", user_id,
                    ip_address=get_client_ip(request))
    log.info("admin.user.banned", user_id=user_id)
    return {"banned": True}


@router.post(
    "/{user_id}/unban",
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def unban_user(user_id: str, request: Request, actor: CurrentUser) -> dict:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute('UPDATE "user" SET banned = FALSE WHERE id = $1', user_id)
    log_audit_event(pool, actor.id, "user.unbanned", "user", user_id,
                    ip_address=get_client_ip(request))
    log.info("admin.user.unbanned", user_id=user_id)
    return {"banned": False}


@router.delete(
    "/{user_id}",
    status_code=204,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def delete_user(user_id: str, request: Request, actor: CurrentUser) -> Response:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute('DELETE FROM "user" WHERE id = $1', user_id)
    log_audit_event(pool, actor.id, "user.deleted", "user", user_id,
                    ip_address=get_client_ip(request))
    log.info("admin.user.deleted", user_id=user_id)
    return Response(status_code=204)
