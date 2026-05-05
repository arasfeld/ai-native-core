"""Tests for GET/PUT /preferences."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.preferences import router
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
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


def authed_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_get_preferences_new_user(app, mock_pool):
    mock_pool.fetchrow.return_value = None
    client = authed_client(app, mock_pool)
    resp = client.get("/preferences")
    assert resp.status_code == 200
    assert resp.json() == {"system_instructions": ""}


def test_put_preferences_upserts(app, mock_pool):
    client = authed_client(app, mock_pool)
    payload = {"system_instructions": "You are a helpful assistant."}
    resp = client.put("/preferences", json=payload)
    assert resp.status_code == 200
    assert resp.json() == payload
    mock_pool.execute.assert_called_once()


def test_put_preferences_updates_on_second_call(app, mock_pool):
    client = authed_client(app, mock_pool)
    client.put("/preferences", json={"system_instructions": "first"})
    resp = client.put("/preferences", json={"system_instructions": "second"})
    assert resp.status_code == 200
    assert resp.json()["system_instructions"] == "second"


def test_get_preferences_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/preferences")
    assert resp.status_code == 401
