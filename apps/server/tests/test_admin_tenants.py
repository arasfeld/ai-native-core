"""Tests for the admin tenants router."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.rbac.permissions import Permission
from api.routers.admin_tenants import router
from fastapi import FastAPI
from fastapi.testclient import TestClient

MOCK_TENANT_ROW = {
    "id": "tenant-1",
    "email": "user@example.com",
    "name": "User One",
    "plan": "free",
    "token_limit": 100000,
    "tokens_used": 12000,
    "stripe_customer_id": None,
    "stripe_subscription_id": None,
    "created_at": datetime(2024, 1, 1, tzinfo=UTC),
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
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_list_tenants_requires_permission(app, mock_pool):
    client = unprivileged_client(app, mock_pool)
    resp = client.get("/admin/tenants")
    assert resp.status_code == 403


def test_list_tenants_returns_list(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[MOCK_TENANT_ROW])
    client = admin_client(app, mock_pool)
    resp = client.get("/admin/tenants")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["email"] == "user@example.com"
    assert data[0]["tokens_used"] == 12000


def test_patch_tenant_plan(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(
        return_value={**MOCK_TENANT_ROW, "plan": "pro", "token_limit": 2000000}
    )
    client = admin_client(app, mock_pool)
    resp = client.patch("/admin/tenants/tenant-1", json={"plan": "pro", "token_limit": 2000000})
    assert resp.status_code == 200
    assert resp.json()["plan"] == "pro"
    assert mock_pool.execute.call_count >= 1


def test_patch_tenant_only_plan(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={**MOCK_TENANT_ROW, "plan": "pro"})
    client = admin_client(app, mock_pool)
    resp = client.patch("/admin/tenants/tenant-1", json={"plan": "pro"})
    assert resp.status_code == 200
    call_sql = mock_pool.execute.call_args[0][0]
    assert "plan" in call_sql
