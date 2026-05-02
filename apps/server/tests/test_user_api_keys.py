"""Tests for the user API keys router."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.user_api_keys import router
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
    resp = client.get("/user/api-keys")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/user/api-keys")
    assert resp.status_code == 401


def test_create_returns_key_with_correct_format(app, mock_pool):
    now = datetime.now(UTC)
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "name": "My script",
            "key_prefix": "ak_a1b2c3",
            "created_at": now,
        }
    )
    client = authed_client(app, mock_pool)
    resp = client.post("/user/api-keys", json={"name": "My script"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["key"].startswith("ak_")
    assert len(data["key"]) == 67
    assert data["name"] == "My script"
    assert "key_prefix" in data


def test_create_stores_sha256_hash(app, mock_pool):
    now = datetime.now(UTC)
    captured = {}

    async def fake_fetchrow(query, *args):
        captured["key_hash"] = args[2]  # third positional arg is key_hash
        return {
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "name": "test",
            "key_prefix": args[3],
            "created_at": now,
        }

    mock_pool.fetchrow = fake_fetchrow
    client = authed_client(app, mock_pool)
    resp = client.post("/user/api-keys", json={"name": "test"})
    assert resp.status_code == 201
    returned_key = resp.json()["key"]
    expected_hash = hashlib.sha256(returned_key.encode()).hexdigest()
    assert captured["key_hash"] == expected_hash


def test_delete_revokes_key(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(
        return_value={"id": "123e4567-e89b-12d3-a456-426614174000", "user_id": "user-1"}
    )
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.delete("/user/api-keys/123e4567-e89b-12d3-a456-426614174000")
    assert resp.status_code == 204


def test_delete_returns_404_for_unknown_key(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.delete("/user/api-keys/no-such-id")
    assert resp.status_code == 404


def test_delete_returns_404_for_other_users_key(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.delete("/user/api-keys/some-other-key-id")
    assert resp.status_code == 404
