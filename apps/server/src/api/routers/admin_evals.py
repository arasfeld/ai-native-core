"""Admin router — eval pass-rate history written by the CI eval workflow."""

from __future__ import annotations

from datetime import datetime

import asyncpg
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from ..rbac import Permission, require_permission

router = APIRouter(prefix="/admin/evals", tags=["admin"])


class EvalRunOut(BaseModel):
    id: str
    commit_sha: str
    branch: str | None
    category: str
    scorer: str
    pass_count: int
    total_count: int
    score: float
    threshold: float | None
    langsmith_run_url: str | None
    created_at: datetime


class EvalSummary(BaseModel):
    category: str
    scorer: str
    latest_score: float
    threshold: float | None
    pass_count: int
    total_count: int
    latest_at: datetime
    commit_sha: str
    branch: str | None
    langsmith_run_url: str | None


@router.get(
    "/latest",
    response_model=list[EvalSummary],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def latest(request: Request) -> list[EvalSummary]:
    """Most recent row per (category, scorer)."""
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch(
        """
        SELECT DISTINCT ON (category, scorer)
            category, scorer, score, threshold,
            pass_count, total_count, created_at,
            commit_sha, branch, langsmith_run_url
        FROM eval_runs
        ORDER BY category, scorer, created_at DESC
        """
    )
    return [
        EvalSummary(
            category=row["category"],
            scorer=row["scorer"],
            latest_score=float(row["score"]),
            threshold=float(row["threshold"]) if row["threshold"] is not None else None,
            pass_count=row["pass_count"],
            total_count=row["total_count"],
            latest_at=row["created_at"],
            commit_sha=row["commit_sha"],
            branch=row["branch"],
            langsmith_run_url=row["langsmith_run_url"],
        )
        for row in rows
    ]


@router.get(
    "/history",
    response_model=list[EvalRunOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def history(
    request: Request,
    category: str | None = Query(None),
    scorer: str | None = Query(None),
    days: int = Query(30, ge=1, le=365),
) -> list[EvalRunOut]:
    """Time series of eval scores; optionally filtered by category and scorer."""
    pool: asyncpg.Pool = request.app.state.db_pool

    where_clauses = ["created_at >= NOW() - ($1::int || ' days')::interval"]
    params: list = [days]
    if category:
        params.append(category)
        where_clauses.append(f"category = ${len(params)}")
    if scorer:
        params.append(scorer)
        where_clauses.append(f"scorer = ${len(params)}")
    where = " AND ".join(where_clauses)

    rows = await pool.fetch(
        f"""
        SELECT id, commit_sha, branch, category, scorer,
               pass_count, total_count, score, threshold,
               langsmith_run_url, created_at
        FROM eval_runs
        WHERE {where}
        ORDER BY created_at ASC
        """,
        *params,
    )
    return [
        EvalRunOut(
            id=str(row["id"]),
            commit_sha=row["commit_sha"],
            branch=row["branch"],
            category=row["category"],
            scorer=row["scorer"],
            pass_count=row["pass_count"],
            total_count=row["total_count"],
            score=float(row["score"]),
            threshold=float(row["threshold"]) if row["threshold"] is not None else None,
            langsmith_run_url=row["langsmith_run_url"],
            created_at=row["created_at"],
        )
        for row in rows
    ]
