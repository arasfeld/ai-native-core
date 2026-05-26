from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Literal

from ai import get_llm
from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..rbac import Permission, require_permission

router = APIRouter(tags=["health"])

VERSION = "0.1.0"

Status = Literal["ok", "degraded", "down"]


class HealthResponse(BaseModel):
    status: str
    version: str


class DependencyHealth(BaseModel):
    name: str
    status: Status
    latency_ms: float | None = None
    detail: str | None = None


class DetailedHealthResponse(BaseModel):
    status: Status
    version: str
    checks: list[DependencyHealth]


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", version=VERSION)


async def _timed_check(
    name: str,
    coro_factory: Callable[[], Awaitable[None]],
    timeout: float,
) -> DependencyHealth:
    start = time.perf_counter()
    try:
        await asyncio.wait_for(coro_factory(), timeout=timeout)
    except TimeoutError:
        return DependencyHealth(
            name=name,
            status="down",
            latency_ms=(time.perf_counter() - start) * 1000,
            detail=f"timeout after {timeout}s",
        )
    except Exception as exc:
        return DependencyHealth(
            name=name,
            status="down",
            latency_ms=(time.perf_counter() - start) * 1000,
            detail=str(exc),
        )
    return DependencyHealth(
        name=name,
        status="ok",
        latency_ms=(time.perf_counter() - start) * 1000,
    )


async def _check_database(request: Request) -> DependencyHealth:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        return DependencyHealth(name="database", status="down", detail="pool not initialized")

    async def _probe() -> None:
        await pool.fetchval("SELECT 1")

    return await _timed_check("database", _probe, timeout=2.0)


async def _check_redis(request: Request) -> DependencyHealth:
    arq = getattr(request.app.state, "arq", None)
    if arq is None:
        return DependencyHealth(
            name="redis",
            status="down",
            detail="arq pool unavailable; POST /jobs disabled",
        )

    async def _probe() -> None:
        # arq pools expose the underlying redis client via `pool`
        underlying = getattr(arq, "pool", arq)
        await underlying.ping()

    return await _timed_check("redis", _probe, timeout=1.0)


async def _check_queue(request: Request) -> DependencyHealth:
    arq = getattr(request.app.state, "arq", None)
    if arq is None:
        return DependencyHealth(
            name="queue",
            status="down",
            detail="arq pool unavailable",
        )

    async def _probe() -> None:
        # queued_jobs() returns a list; surface it succeeded by awaiting it
        await arq.queued_jobs()

    return await _timed_check("queue", _probe, timeout=1.0)


async def _check_llm_provider() -> DependencyHealth:
    async def _probe() -> None:
        llm = get_llm()
        await llm.embed("ok")

    return await _timed_check("llm_provider", _probe, timeout=3.0)


def _aggregate(checks: list[DependencyHealth]) -> Status:
    if any(c.status == "down" for c in checks):
        return "down"
    if any(c.status == "degraded" for c in checks):
        return "degraded"
    return "ok"


@router.get(
    "/health/detailed",
    response_model=DetailedHealthResponse,
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def health_detailed(request: Request) -> DetailedHealthResponse:
    checks = await asyncio.gather(
        _check_database(request),
        _check_redis(request),
        _check_queue(request),
        _check_llm_provider(),
    )
    return DetailedHealthResponse(
        status=_aggregate(list(checks)),
        version=VERSION,
        checks=list(checks),
    )
