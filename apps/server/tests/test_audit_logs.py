"""Tests for the audit log service and router."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
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
    from datetime import datetime, timezone

    from api.routers.audit_logs import router

    app = FastAPI()
    app.include_router(router)
    mock_pool = AsyncMock()
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
                "created_at": datetime(2026, 4, 29, 12, 0, 0, tzinfo=timezone.utc),
            }
        ]
    )
    client = authed_admin_client(app, mock_pool)
    resp = client.get("/admin/audit-logs")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["action"] == "user.banned"
    assert data[0]["actor_email"] == "admin@example.com"
