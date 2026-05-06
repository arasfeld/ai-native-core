"""Tests for the conversations router."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.conversations import router
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


def test_list_returns_empty_for_new_user(app, mock_pool):
    mock_pool.fetch.return_value = []
    client = authed_client(app, mock_pool)
    resp = client.get("/conversations")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/conversations")
    assert resp.status_code == 401


def test_create_returns_id_and_title(app, mock_pool):
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.post("/conversations", json={"id": "conv-abc"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "conv-abc"
    assert data["title"] == "New chat"


def test_patch_updates_title(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(
        return_value={"id": "conv-abc", "title": "New chat", "system_instructions": ""}
    )
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.patch("/conversations/conv-abc", json={"title": "My renamed chat"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "My renamed chat"


def test_patch_returns_404_for_unknown_id(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.patch("/conversations/no-such-id", json={"title": "x"})
    assert resp.status_code == 404


def test_delete_returns_204(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-abc", "user_id": "user-1"})
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.delete("/conversations/conv-abc")
    assert resp.status_code == 204


def test_delete_returns_404_for_unknown_id(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.delete("/conversations/no-such-id")
    assert resp.status_code == 404


def test_get_messages_returns_list(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-abc", "user_id": "user-1"})
    mock_pool.fetch = AsyncMock(
        return_value=[
            {"role": "human", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ]
    )
    client = authed_client(app, mock_pool)
    resp = client.get("/conversations/conv-abc/messages")
    assert resp.status_code == 200
    msgs = resp.json()
    assert len(msgs) == 2
    assert msgs[0]["role"] == "human"
    assert msgs[1]["content"] == "Hi there"
