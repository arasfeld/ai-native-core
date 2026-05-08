"""Admin router — read-only audit log viewer with filters."""

from __future__ import annotations

from datetime import datetime

import asyncpg
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from ..rbac import Permission, require_permission

router = APIRouter(prefix="/admin/audit-logs", tags=["admin"])


class AuditLogOut(BaseModel):
    id: str
    actor_id: str | None
    actor_email: str | None
    action: str
    resource_type: str
    resource_id: str | None
    metadata: dict
    ip_address: str | None
    created_at: datetime


class AuditLogPage(BaseModel):
    entries: list[AuditLogOut]
    total: int


@router.get(
    "",
    response_model=AuditLogPage,
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_audit_logs(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    actor: str | None = Query(
        None, description="Filter by actor email (substring, case-insensitive)"
    ),
    action: str | None = Query(None, description="Filter by action (substring, case-insensitive)"),
    resource_type: str | None = Query(None, description="Filter by resource type (exact match)"),
    since: datetime | None = Query(None, description="Filter: events at or after this time"),  # noqa: B008
    until: datetime | None = Query(None, description="Filter: events at or before this time"),  # noqa: B008
) -> AuditLogPage:
    pool: asyncpg.Pool = request.app.state.db_pool

    where: list[str] = []
    params: list[object] = []

    def add(condition: str, value: object) -> None:
        params.append(value)
        where.append(condition.replace("$?", f"${len(params)}"))

    if actor:
        add("u.email ILIKE $?", f"%{actor}%")
    if action:
        add("al.action ILIKE $?", f"%{action}%")
    if resource_type:
        add("al.resource_type = $?", resource_type)
    if since is not None:
        add("al.created_at >= $?", since)
    if until is not None:
        add("al.created_at <= $?", until)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    count_row = await pool.fetchrow(
        f"""
        SELECT COUNT(*)::int AS total
        FROM audit_logs al
        LEFT JOIN "user" u ON u.id = al.actor_id
        {where_sql}
        """,
        *params,
    )
    total = count_row["total"] if count_row else 0

    params.append(limit)
    params.append(offset)
    rows = await pool.fetch(
        f"""
        SELECT
            al.id::text,
            al.actor_id,
            u.email AS actor_email,
            al.action,
            al.resource_type,
            al.resource_id,
            al.metadata,
            al.ip_address,
            al.created_at
        FROM audit_logs al
        LEFT JOIN "user" u ON u.id = al.actor_id
        {where_sql}
        ORDER BY al.created_at DESC
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """,
        *params,
    )

    entries = [
        AuditLogOut(
            id=row["id"],
            actor_id=row["actor_id"],
            actor_email=row["actor_email"],
            action=row["action"],
            resource_type=row["resource_type"],
            resource_id=row["resource_id"],
            metadata=dict(row["metadata"]) if row["metadata"] else {},
            ip_address=row["ip_address"],
            created_at=row["created_at"],
        )
        for row in rows
    ]
    return AuditLogPage(entries=entries, total=total)


@router.get(
    "/resource-types",
    response_model=list[str],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_resource_types(request: Request) -> list[str]:
    """Distinct resource_type values for filter dropdown."""
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch("SELECT DISTINCT resource_type FROM audit_logs ORDER BY resource_type")
    return [row["resource_type"] for row in rows]
