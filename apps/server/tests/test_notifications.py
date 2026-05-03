"""Tests for the notifications router."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.notifications import router
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
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


def authed_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_list_returns_empty_when_no_notifications(app, mock_pool):
    mock_pool.fetch.return_value = []
    client = authed_client(app, mock_pool)
    resp = client.get("/notifications")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/notifications")
    assert resp.status_code == 401


def test_list_returns_notifications_ordered_unread_first(app, mock_pool):
    now = datetime.now(UTC)
    mock_pool.fetch.return_value = [
        {
            "id": "aaa-111",
            "type": "budget_warning",
            "title": "Budget at 80%",
            "body": "You've used 80% of your tokens.",
            "read_at": None,
            "created_at": now,
        },
        {
            "id": "bbb-222",
            "type": "welcome",
            "title": "Welcome!",
            "body": "Your account is ready.",
            "read_at": now,
            "created_at": now,
        },
    ]
    client = authed_client(app, mock_pool)
    resp = client.get("/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["id"] == "aaa-111"
    assert data[0]["read_at"] is None
    assert data[1]["id"] == "bbb-222"


def test_mark_all_read_returns_no_content(app, mock_pool):
    client = authed_client(app, mock_pool)
    resp = client.patch("/notifications/read-all")
    assert resp.status_code == 204
    mock_pool.execute.assert_called_once()


def test_mark_all_read_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.patch("/notifications/read-all")
    assert resp.status_code == 401


def test_mark_one_read_returns_no_content(app, mock_pool):
    mock_pool.fetchrow.return_value = {"id": "aaa-111"}
    client = authed_client(app, mock_pool)
    resp = client.patch("/notifications/aaa-111/read")
    assert resp.status_code == 204


def test_mark_one_read_returns_404_when_not_found(app, mock_pool):
    mock_pool.fetchrow.return_value = None
    client = authed_client(app, mock_pool)
    resp = client.patch("/notifications/no-such-id/read")
    assert resp.status_code == 404
