"""Tests for the admin evals router."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

from api.auth.deps import AuthUser, get_current_user
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(mock_pool) -> TestClient:
    from api.routers.admin_evals import router

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


def _unauthed_client(mock_pool) -> TestClient:
    from api.routers.admin_evals import router

    app = FastAPI()
    app.include_router(router)
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="u@example.com", permissions=frozenset())

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def _row(**overrides):
    base = {
        "id": uuid.uuid4(),
        "commit_sha": "abc1234",
        "branch": "main",
        "category": "factual",
        "scorer": "keyword",
        "pass_count": 8,
        "total_count": 9,
        "score": Decimal("0.8500"),
        "threshold": Decimal("0.8000"),
        "langsmith_run_url": None,
        "created_at": datetime(2026, 5, 27, tzinfo=UTC),
    }
    base.update(overrides)
    return base


def test_latest_returns_summary_per_category_scorer():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(
        return_value=[
            _row(category="factual", scorer="keyword", score=Decimal("0.85")),
            _row(category="tool_use", scorer="tool_use", score=Decimal("0.92")),
        ]
    )

    resp = _client(mock_pool).get("/admin/evals/latest")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["category"] == "factual"
    assert data[0]["latest_score"] == 0.85
    assert data[0]["threshold"] == 0.80
    assert data[0]["pass_count"] == 8
    assert data[1]["category"] == "tool_use"
    assert data[1]["latest_score"] == 0.92


def test_latest_returns_empty_when_no_runs():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])

    resp = _client(mock_pool).get("/admin/evals/latest")
    assert resp.status_code == 200
    assert resp.json() == []


def test_history_returns_time_series():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(
        return_value=[
            _row(score=Decimal("0.80")),
            _row(score=Decimal("0.85")),
            _row(score=Decimal("0.90")),
        ]
    )

    resp = _client(mock_pool).get("/admin/evals/history?category=factual&days=14")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert data[0]["score"] == 0.80
    assert data[-1]["score"] == 0.90

    # Confirm the SQL parameters are passed through correctly
    call = mock_pool.fetch.await_args
    assert call.args[1] == 14  # days
    assert "factual" in call.args  # category filter


def test_history_without_filters_passes_only_days():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])

    resp = _client(mock_pool).get("/admin/evals/history?days=7")
    assert resp.status_code == 200
    call = mock_pool.fetch.await_args
    assert call.args[1] == 7
    # No category/scorer params appended
    assert len(call.args) == 2  # (sql, days)


def test_admin_endpoints_require_admin_permission():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])
    client = _unauthed_client(mock_pool)

    assert client.get("/admin/evals/latest").status_code == 403
    assert client.get("/admin/evals/history").status_code == 403


def test_history_days_query_param_clamped():
    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])
    client = _client(mock_pool)

    # 0 is below the minimum of 1
    assert client.get("/admin/evals/history?days=0").status_code == 422
    # 400 is above the maximum of 365
    assert client.get("/admin/evals/history?days=400").status_code == 422
