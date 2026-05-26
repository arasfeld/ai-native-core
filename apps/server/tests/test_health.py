"""Tests for the health router (basic + detailed probe)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from api.auth.deps import AuthUser, get_current_user
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _admin() -> AuthUser:
    return AuthUser(
        id="admin-1",
        email="admin@example.com",
        permissions=frozenset(["admin:users:read"]),
    )


def _non_admin() -> AuthUser:
    return AuthUser(
        id="user-1",
        email="user@example.com",
        permissions=frozenset(),
    )


def _make_app(*, db_ok: bool = True, arq_ok: bool = True) -> FastAPI:
    from api.routers.health import router

    app = FastAPI()
    app.include_router(router)

    pool = AsyncMock()
    if db_ok:
        pool.fetchval = AsyncMock(return_value=1)
    else:
        pool.fetchval = AsyncMock(side_effect=RuntimeError("connection refused"))
    app.state.db_pool = pool

    if arq_ok:
        arq = AsyncMock()
        arq.pool = AsyncMock()
        arq.pool.ping = AsyncMock(return_value=True)
        arq.queued_jobs = AsyncMock(return_value=[])
        app.state.arq = arq
    else:
        app.state.arq = None

    return app


def test_health_basic_returns_ok():
    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "version": "0.1.0"}


@patch("api.routers.health.get_llm")
def test_health_detailed_all_ok(mock_get_llm):
    llm = MagicMock()
    llm.embed = AsyncMock(return_value=[0.0])
    mock_get_llm.return_value = llm

    app = _make_app()
    app.dependency_overrides[get_current_user] = _admin

    with TestClient(app) as client:
        resp = client.get("/health/detailed")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert {c["name"] for c in data["checks"]} == {
        "database",
        "redis",
        "queue",
        "llm_provider",
    }
    assert all(c["status"] == "ok" for c in data["checks"])


@patch("api.routers.health.get_llm")
def test_health_detailed_db_down_is_down(mock_get_llm):
    llm = MagicMock()
    llm.embed = AsyncMock(return_value=[0.0])
    mock_get_llm.return_value = llm

    app = _make_app(db_ok=False)
    app.dependency_overrides[get_current_user] = _admin

    with TestClient(app) as client:
        resp = client.get("/health/detailed")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "down"
    db_check = next(c for c in data["checks"] if c["name"] == "database")
    assert db_check["status"] == "down"
    assert "connection refused" in db_check["detail"]


@patch("api.routers.health.get_llm")
def test_health_detailed_llm_down_is_down(mock_get_llm):
    llm = MagicMock()
    llm.embed = AsyncMock(side_effect=RuntimeError("provider unreachable"))
    mock_get_llm.return_value = llm

    app = _make_app()
    app.dependency_overrides[get_current_user] = _admin

    with TestClient(app) as client:
        resp = client.get("/health/detailed")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "down"
    llm_check = next(c for c in data["checks"] if c["name"] == "llm_provider")
    assert llm_check["status"] == "down"
    assert "provider unreachable" in llm_check["detail"]


def test_health_detailed_redis_unavailable_when_arq_none():
    app = _make_app(arq_ok=False)
    app.dependency_overrides[get_current_user] = _admin

    with patch("api.routers.health.get_llm") as mock_get_llm:
        llm = MagicMock()
        llm.embed = AsyncMock(return_value=[0.0])
        mock_get_llm.return_value = llm
        with TestClient(app) as client:
            resp = client.get("/health/detailed")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "down"
    redis_check = next(c for c in data["checks"] if c["name"] == "redis")
    queue_check = next(c for c in data["checks"] if c["name"] == "queue")
    assert redis_check["status"] == "down"
    assert queue_check["status"] == "down"


def test_health_detailed_non_admin_is_forbidden():
    app = _make_app()
    app.dependency_overrides[get_current_user] = _non_admin

    with TestClient(app) as client:
        resp = client.get("/health/detailed")

    assert resp.status_code == 403
