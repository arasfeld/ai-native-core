"""Tests for the admin analytics router."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock

from api.auth.deps import AuthUser, get_current_user
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(mock_pool) -> TestClient:
    from api.routers.admin_analytics import router

    app = FastAPI()
    app.include_router(router)
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset(["admin:users:read"]),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_get_analytics_returns_full_payload():
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "total_users": 42,
            "pro_subscribers": 5,
            "dau": 17,
            "tokens_today": 12_345,
            "tokens_this_month": 678_901,
        }
    )
    mock_pool.fetch = AsyncMock(
        side_effect=[
            [{"day": date(2026, 4, 1), "count": 3}],
            [{"day": date(2026, 4, 1), "tokens": 1500}],
            [{"day": date(2026, 4, 1), "users": 7}],
        ]
    )

    resp = _client(mock_pool).get("/admin/analytics")
    assert resp.status_code == 200
    data = resp.json()

    assert data["kpis"]["total_users"] == 42
    assert data["kpis"]["pro_subscribers"] == 5
    assert data["kpis"]["dau"] == 17
    assert data["kpis"]["tokens_today"] == 12_345
    assert data["kpis"]["tokens_this_month"] == 678_901
    # MRR is 0 by default since pro_plan_monthly_usd defaults to 0
    assert data["kpis"]["mrr_usd"] == 0
    assert data["signups_per_day"] == [{"day": "2026-04-01", "count": 3}]
    assert data["tokens_per_day"] == [{"day": "2026-04-01", "tokens": 1500}]
    assert data["dau_per_day"] == [{"day": "2026-04-01", "users": 7}]


def test_get_analytics_computes_mrr_from_setting(monkeypatch):
    from api import config as config_module

    monkeypatch.setattr(config_module.settings, "pro_plan_monthly_usd", 20.0)

    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "total_users": 100,
            "pro_subscribers": 12,
            "dau": 0,
            "tokens_today": 0,
            "tokens_this_month": 0,
        }
    )
    mock_pool.fetch = AsyncMock(return_value=[])

    resp = _client(mock_pool).get("/admin/analytics")
    assert resp.status_code == 200
    assert resp.json()["kpis"]["mrr_usd"] == 240.0
