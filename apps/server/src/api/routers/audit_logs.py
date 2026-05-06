"""Admin router — read-only audit log viewer."""
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


@router.get(
    "",
    response_model=list[AuditLogOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_audit_logs(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[AuditLogOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch(
        """
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
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2
        """,
        limit,
        offset,
    )
    return [
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
