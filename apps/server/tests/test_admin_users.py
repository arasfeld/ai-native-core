"""Tests for the admin users router."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.rbac.permissions import Permission
from api.routers.admin_users import router
from fastapi import FastAPI
from fastapi.testclient import TestClient

MOCK_USER_ROW = {
    "id": "user-1",
    "email": "test@example.com",
    "name": "Test User",
    "is_admin": False,
    "banned": False,
    "created_at": datetime(2024, 1, 1, tzinfo=UTC),
    "plan": "free",
    "token_limit": 100000,
    "tokens_used": 5000,
}


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(router)
    return a


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


def admin_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset([
                Permission.ADMIN_USERS_READ,
                Permission.ADMIN_USERS_WRITE,
            ]),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def unprivileged_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


# ── permission enforcement ────────────────────────────────────────────────────


def test_list_users_requires_permission(app, mock_pool):
    client = unprivileged_client(app, mock_pool)
    resp = client.get("/admin/users")
    assert resp.status_code == 403


# ── list users ────────────────────────────────────────────────────────────────


def test_list_users_returns_list(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[MOCK_USER_ROW])
    client = admin_client(app, mock_pool)
    resp = client.get("/admin/users")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["email"] == "test@example.com"
    assert data[0]["tokens_used"] == 5000


def test_list_users_passes_search_param(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[])
    client = admin_client(app, mock_pool)
    resp = client.get("/admin/users?search=alice")
    assert resp.status_code == 200
    call_sql = mock_pool.fetch.call_args[0][0]
    assert "ILIKE" in call_sql


# ── ban / unban ───────────────────────────────────────────────────────────────


def test_ban_user(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.post("/admin/users/user-1/ban")
    assert resp.status_code == 200
    assert resp.json()["banned"] is True
    call_sql = mock_pool.execute.call_args_list[0][0][0]
    assert "banned" in call_sql


def test_unban_user(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.post("/admin/users/user-1/unban")
    assert resp.status_code == 200
    assert resp.json()["banned"] is False


# ── delete ────────────────────────────────────────────────────────────────────


def test_delete_user(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.delete("/admin/users/user-1")
    assert resp.status_code == 204
    call_sql = mock_pool.execute.call_args_list[0][0][0]
    assert "DELETE FROM" in call_sql
