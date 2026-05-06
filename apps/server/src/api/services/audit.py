"""Fire-and-forget audit log helper."""
from __future__ import annotations

import asyncio
import json

import structlog
from fastapi import Request

log = structlog.get_logger()


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def _write(
    pool,
    actor_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None,
    metadata: dict,
    ip_address: str | None,
) -> None:
    try:
        await pool.execute(
            """
            INSERT INTO audit_logs
              (actor_id, action, resource_type, resource_id, metadata, ip_address)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            """,
            actor_id,
            action,
            resource_type,
            resource_id,
            json.dumps(metadata),
            ip_address,
        )
    except Exception as exc:
        log.warning("audit.write_failed", action=action, error=str(exc))


def log_audit_event(
    pool,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Schedule an audit log write. Never blocks the caller."""
    asyncio.create_task(
        _write(pool, actor_id, action, resource_type, resource_id, metadata or {}, ip_address)
    )
