"""Tests for the billing usage time-series endpoint."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock

from api.auth.deps import AuthUser, get_current_user
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(mock_pool) -> TestClient:
    from api.routers.billing import router

    app = FastAPI()
    app.include_router(router)
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="tenant-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_get_usage_returns_time_series():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(
        return_value=[
            {"day": date(2026, 5, 25), "tokens": 1_200},
            {"day": date(2026, 5, 27), "tokens": 3_400},
        ]
    )

    resp = _client(mock_pool).get("/billing/usage?days=7")
    assert resp.status_code == 200
    body = resp.json()

    assert body["days"] == 7
    assert body["total_tokens"] == 4_600
    assert body["tokens_per_day"] == [
        {"day": "2026-05-25", "tokens": 1_200},
        {"day": "2026-05-27", "tokens": 3_400},
    ]


def test_get_usage_handles_empty_history():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])

    resp = _client(mock_pool).get("/billing/usage")
    assert resp.status_code == 200
    body = resp.json()

    assert body["days"] == 30
    assert body["total_tokens"] == 0
    assert body["tokens_per_day"] == []


def test_get_usage_rejects_out_of_range_days():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])

    too_small = _client(mock_pool).get("/billing/usage?days=1")
    assert too_small.status_code == 422

    too_big = _client(mock_pool).get("/billing/usage?days=999")
    assert too_big.status_code == 422
