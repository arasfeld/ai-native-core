"""Tests for the audit log service and router."""

from __future__ import annotations

import asyncio
from datetime import UTC
from unittest.mock import AsyncMock, patch

from api.auth.deps import AuthUser, get_current_user
from fastapi import FastAPI
from fastapi.testclient import TestClient

# ── Helpers ───────────────────────────────────────────────────────────────────


def authed_admin_client(app: FastAPI, mock_pool) -> TestClient:
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset(["admin:users:read", "admin:users:write"]),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


# ── _write unit tests ─────────────────────────────────────────────────────────


def test_write_inserts_row():
    from api.services.audit import _write

    pool = AsyncMock()
    pool.execute = AsyncMock()
    asyncio.run(_write(pool, "actor-1", "user.banned", "user", "target-1", {}, "1.2.3.4"))
    pool.execute.assert_called_once()
    sql = pool.execute.call_args[0][0]
    assert "INSERT INTO audit_logs" in sql


def test_write_swallows_db_errors():
    from api.services.audit import _write

    pool = AsyncMock()
    pool.execute = AsyncMock(side_effect=Exception("DB down"))
    # Must not raise
    asyncio.run(_write(pool, "actor-1", "user.banned", "user", "target-1", {}, None))


# ── GET /admin/audit-logs ─────────────────────────────────────────────────────


def test_list_audit_logs_returns_entries():
    from datetime import datetime

    from api.routers.audit_logs import router

    app = FastAPI()
    app.include_router(router)
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={"total": 1})
    mock_pool.fetch = AsyncMock(
        return_value=[
            {
                "id": "log-1",
                "actor_id": "admin-1",
                "actor_email": "admin@example.com",
                "action": "user.banned",
                "resource_type": "user",
                "resource_id": "user-123",
                "metadata": {},
                "ip_address": "1.2.3.4",
                "created_at": datetime(2026, 4, 29, 12, 0, 0, tzinfo=UTC),
            }
        ]
    )
    client = authed_admin_client(app, mock_pool)
    resp = client.get("/admin/audit-logs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["entries"]) == 1
    assert data["entries"][0]["action"] == "user.banned"
    assert data["entries"][0]["actor_email"] == "admin@example.com"


def test_list_audit_logs_applies_filters():
    from datetime import datetime

    from api.routers.audit_logs import router

    app = FastAPI()
    app.include_router(router)
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={"total": 0})
    mock_pool.fetch = AsyncMock(return_value=[])
    client = authed_admin_client(app, mock_pool)
    resp = client.get(
        "/admin/audit-logs",
        params={
            "actor": "alice",
            "action": "user.banned",
            "resource_type": "user",
            "since": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
        },
    )
    assert resp.status_code == 200
    sql = mock_pool.fetch.call_args[0][0]
    assert "u.email ILIKE" in sql
    assert "al.action ILIKE" in sql
    assert "al.resource_type =" in sql
    assert "al.created_at >=" in sql


# ── admin_users instrumentation ───────────────────────────────────────────────


def _make_admin_users_app(mock_pool) -> tuple[FastAPI, TestClient]:
    from api.routers.admin_users import router

    app = FastAPI()
    app.include_router(router)
    client = authed_admin_client(app, mock_pool)
    return app, client


def test_ban_user_logs_audit_event():
    mock_pool = AsyncMock()
    mock_pool.execute = AsyncMock()
    app, client = _make_admin_users_app(mock_pool)

    with patch("api.routers.admin_users.log_audit_event") as mock_log:
        resp = client.post("/admin/users/user-123/ban")

    assert resp.status_code == 200
    mock_log.assert_called_once()
    args = mock_log.call_args[0]
    assert args[1] == "admin-1"  # actor_id
    assert args[2] == "user.banned"  # action
    assert args[3] == "user"  # resource_type
    assert args[4] == "user-123"  # resource_id


def test_unban_user_logs_audit_event():
    mock_pool = AsyncMock()
    mock_pool.execute = AsyncMock()
    app, client = _make_admin_users_app(mock_pool)

    with patch("api.routers.admin_users.log_audit_event") as mock_log:
        resp = client.post("/admin/users/user-123/unban")

    assert resp.status_code == 200
    mock_log.assert_called_once()
    assert mock_log.call_args[0][2] == "user.unbanned"


def test_delete_user_logs_audit_event():
    mock_pool = AsyncMock()
    mock_pool.execute = AsyncMock()
    app, client = _make_admin_users_app(mock_pool)

    with patch("api.routers.admin_users.log_audit_event") as mock_log:
        resp = client.delete("/admin/users/user-123")

    assert resp.status_code == 204
    mock_log.assert_called_once()
    assert mock_log.call_args[0][2] == "user.deleted"
