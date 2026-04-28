"""Tests for profile, session management, and account deletion endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.auth import router
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(router)
    return a


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    return pool


@pytest.fixture
def authed_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override_current_user():
        return AuthUser(
            id="user-1",
            email="test@example.com",
            name="Test User",
            image=None,
            email_verified=True,
        )

    app.dependency_overrides[get_current_user] = override_current_user
    return TestClient(app)


def test_get_profile_returns_user_fields(authed_client, mock_pool):
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "test@example.com",
            "name": "Test User",
            "image": None,
            "emailVerified": True,
        }
    )

    resp = authed_client.get("/auth/profile")

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "user-1"
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert data["emailVerified"] is True


def test_put_profile_updates_name_and_image(authed_client, mock_pool):
    mock_pool.execute = AsyncMock()
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "test@example.com",
            "name": "New Name",
            "image": "https://example.com/avatar.jpg",
            "emailVerified": True,
        }
    )

    resp = authed_client.put(
        "/auth/profile",
        json={"name": "New Name", "image": "https://example.com/avatar.jpg"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["image"] == "https://example.com/avatar.jpg"


def test_get_sessions_returns_list(authed_client, mock_pool):
    mock_pool.fetch = AsyncMock(
        return_value=[
            {
                "id": "sess-1",
                "token": "tok-1",
                "ipAddress": "127.0.0.1",
                "userAgent": "Mozilla/5.0",
                "createdAt": "2026-01-01T00:00:00+00:00",
                "expiresAt": "2026-02-01T00:00:00+00:00",
            }
        ]
    )

    resp = authed_client.get("/auth/sessions")

    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) == 1
    assert sessions[0]["id"] == "sess-1"
    assert sessions[0]["ipAddress"] == "127.0.0.1"


def test_delete_session_revokes_it(authed_client, mock_pool):
    mock_pool.execute = AsyncMock()

    resp = authed_client.delete("/auth/sessions/tok-abc")

    assert resp.status_code == 204
    call_args = mock_pool.execute.call_args[0]
    assert "DELETE" in call_args[0]
    assert "tok-abc" in call_args


def test_delete_account_removes_user(authed_client, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)  # no tenant row
    mock_pool.execute = AsyncMock()

    resp = authed_client.delete("/auth/account")

    assert resp.status_code == 204
