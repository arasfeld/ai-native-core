"""Tests for RBAC endpoints and helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.rbac.helpers import sync_is_admin
from api.rbac.permissions import Permission
from api.routers.rbac import router
from fastapi import FastAPI
from fastapi.testclient import TestClient

# ── Fixtures ──────────────────────────────────────────────────────────────────


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
    """Client authenticated as an admin user (has ADMIN_USERS_READ + WRITE)."""
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset(
                [
                    Permission.ADMIN_USERS_READ,
                    Permission.ADMIN_USERS_WRITE,
                ]
            ),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def unprivileged_client(app, mock_pool):
    """Client authenticated as a user with no permissions."""
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


# ── Permission enforcement ─────────────────────────────────────────────────────


def test_list_permissions_requires_admin_users_read(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[])
    client = unprivileged_client(app, mock_pool)
    resp = client.get("/rbac/permissions")
    assert resp.status_code == 403


def test_list_permissions_returns_list(app, mock_pool):
    mock_pool.fetch = AsyncMock(
        return_value=[{"id": "admin:users:read", "description": "View users"}]
    )
    client = admin_client(app, mock_pool)
    resp = client.get("/rbac/permissions")
    assert resp.status_code == 200
    assert resp.json()[0]["id"] == "admin:users:read"


# ── Roles ─────────────────────────────────────────────────────────────────────


def test_list_roles_returns_roles_with_permissions(app, mock_pool):
    mock_pool.fetch = AsyncMock(
        side_effect=[
            [{"id": "admin", "description": "Admin role"}],
            [{"permission_id": "admin:users:read"}],
        ]
    )
    client = admin_client(app, mock_pool)
    resp = client.get("/rbac/roles")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["id"] == "admin"
    assert "admin:users:read" in data[0]["permissions"]


def test_add_role_permission_inserts(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.post(
        "/rbac/roles/admin/permissions",
        json={"permission_id": "billing:manage"},
    )
    assert resp.status_code == 201
    mock_pool.execute.assert_called_once()
    call_sql = mock_pool.execute.call_args[0][0]
    assert "INSERT INTO role_permissions" in call_sql


def test_remove_role_permission_deletes(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.delete("/rbac/roles/admin/permissions/billing:manage")
    assert resp.status_code == 204
    call_sql = mock_pool.execute.call_args[0][0]
    assert "DELETE FROM role_permissions" in call_sql


# ── User roles ────────────────────────────────────────────────────────────────


def test_list_user_roles_returns_assignments(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[{"id": "ur-1", "role_id": "admin", "org_id": None}])
    client = admin_client(app, mock_pool)
    resp = client.get("/rbac/users/user-1/roles")
    assert resp.status_code == 200
    assert resp.json()[0]["role_id"] == "admin"


def test_assign_user_role_inserts_and_syncs_admin(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={"1": 1})
    client = admin_client(app, mock_pool)
    resp = client.post("/rbac/users/user-1/roles", json={"role_id": "admin"})
    assert resp.status_code == 201
    assert mock_pool.execute.call_count >= 1


def test_revoke_user_role_deletes_and_syncs(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = admin_client(app, mock_pool)
    resp = client.delete("/rbac/users/user-1/roles/admin")
    assert resp.status_code == 204
    assert mock_pool.execute.call_count == 2


# ── User direct permissions ───────────────────────────────────────────────────


def test_grant_user_permission_inserts(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.post(
        "/rbac/users/user-1/permissions",
        json={"permission_id": "billing:manage"},
    )
    assert resp.status_code == 201
    call_sql = mock_pool.execute.call_args[0][0]
    assert "INSERT INTO user_permissions" in call_sql


def test_revoke_user_permission_deletes(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.delete("/rbac/users/user-1/permissions/billing:manage")
    assert resp.status_code == 204
    call_sql = mock_pool.execute.call_args[0][0]
    assert "DELETE FROM user_permissions" in call_sql


# ── sync_is_admin helper ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_is_admin_sets_true_when_admin_role_exists():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"1": 1})
    pool.execute = AsyncMock()

    await sync_is_admin(pool, "user-1")

    update_call = pool.execute.call_args[0]
    assert '"isAdmin"' in update_call[0]
    assert update_call[1] is True
    assert update_call[2] == "user-1"


@pytest.mark.asyncio
async def test_sync_is_admin_sets_false_when_no_admin_role():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()

    await sync_is_admin(pool, "user-1")

    update_call = pool.execute.call_args[0]
    assert update_call[1] is False
