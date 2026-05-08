"""Admin router — global analytics for the dashboard."""

from __future__ import annotations

from datetime import date

import asyncpg
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from ..config import settings
from ..rbac import Permission, require_permission

router = APIRouter(prefix="/admin/analytics", tags=["admin"])


class Kpis(BaseModel):
    total_users: int
    pro_subscribers: int
    mrr_usd: float
    dau: int
    tokens_today: int
    tokens_this_month: int


class DayCount(BaseModel):
    day: date
    count: int


class DayTokens(BaseModel):
    day: date
    tokens: int


class DayUsers(BaseModel):
    day: date
    users: int


class AnalyticsOut(BaseModel):
    kpis: Kpis
    signups_per_day: list[DayCount]
    tokens_per_day: list[DayTokens]
    dau_per_day: list[DayUsers]


@router.get(
    "",
    response_model=AnalyticsOut,
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def get_analytics(
    request: Request,
    days: int = Query(30, ge=7, le=180, description="Look-back window for time series"),
) -> AnalyticsOut:
    pool: asyncpg.Pool = request.app.state.db_pool

    kpi_row = await pool.fetchrow(
        """
        SELECT
          (SELECT COUNT(*)::int FROM "user")                                AS total_users,
          (SELECT COUNT(*)::int FROM tenants WHERE stripe_subscription_id IS NOT NULL) AS pro_subscribers,
          (SELECT COUNT(DISTINCT tenant_id)::int
             FROM session_token_usage
             WHERE tenant_id IS NOT NULL
               AND recorded_at::date = CURRENT_DATE)                        AS dau,
          (SELECT COALESCE(SUM(tokens), 0)::int
             FROM session_token_usage
             WHERE recorded_at::date = CURRENT_DATE)                        AS tokens_today,
          (SELECT COALESCE(SUM(tokens), 0)::int
             FROM session_token_usage
             WHERE date_trunc('month', recorded_at) = date_trunc('month', NOW())) AS tokens_this_month
        """
    )

    signup_rows = await pool.fetch(
        """
        SELECT "createdAt"::date AS day, COUNT(*)::int AS count
        FROM "user"
        WHERE "createdAt" >= NOW() - ($1::int || ' days')::interval
        GROUP BY day
        ORDER BY day
        """,
        days,
    )

    token_rows = await pool.fetch(
        """
        SELECT recorded_at::date AS day, COALESCE(SUM(tokens), 0)::int AS tokens
        FROM session_token_usage
        WHERE recorded_at >= NOW() - ($1::int || ' days')::interval
        GROUP BY day
        ORDER BY day
        """,
        days,
    )

    dau_rows = await pool.fetch(
        """
        SELECT recorded_at::date AS day, COUNT(DISTINCT tenant_id)::int AS users
        FROM session_token_usage
        WHERE tenant_id IS NOT NULL
          AND recorded_at >= NOW() - ($1::int || ' days')::interval
        GROUP BY day
        ORDER BY day
        """,
        days,
    )

    pro_subs = kpi_row["pro_subscribers"] if kpi_row else 0
    mrr = round(pro_subs * settings.pro_plan_monthly_usd, 2)

    return AnalyticsOut(
        kpis=Kpis(
            total_users=kpi_row["total_users"] if kpi_row else 0,
            pro_subscribers=pro_subs,
            mrr_usd=mrr,
            dau=kpi_row["dau"] if kpi_row else 0,
            tokens_today=kpi_row["tokens_today"] if kpi_row else 0,
            tokens_this_month=kpi_row["tokens_this_month"] if kpi_row else 0,
        ),
        signups_per_day=[DayCount(day=row["day"], count=row["count"]) for row in signup_rows],
        tokens_per_day=[DayTokens(day=row["day"], tokens=row["tokens"]) for row in token_rows],
        dau_per_day=[DayUsers(day=row["day"], users=row["users"]) for row in dau_rows],
    )
