"""Tests for /referrals routes."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.referrals import REFERRAL_BONUS_TOKENS, router
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
    pool.fetchval = AsyncMock(return_value=0)
    pool.execute = AsyncMock()

    # `async with pool.acquire() as conn` for the transactional accept path.
    conn = AsyncMock()
    conn.execute = AsyncMock()
    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__ = AsyncMock(return_value=None)
    conn.transaction.return_value.__aexit__ = AsyncMock(return_value=None)

    @asynccontextmanager
    async def _acquire():
        yield conn

    pool.acquire = _acquire
    pool._conn = conn  # exposed for tests to assert on
    return pool


def authed_client(app, mock_pool, user_id: str = "user-1") -> TestClient:
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id=user_id, email=f"{user_id}@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_get_my_referral_creates_code_when_missing(app, mock_pool):
    mock_pool.fetchrow.side_effect = [
        None,  # no existing code
        {"code": "abc12345"},  # insert returning
    ]
    mock_pool.fetchval.return_value = 3
    client = authed_client(app, mock_pool)

    resp = client.get("/referrals/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == "abc12345"
    assert body["url"].endswith("/r/abc12345")
    assert body["accepted_count"] == 3
    assert body["bonus_tokens"] == REFERRAL_BONUS_TOKENS


def test_get_my_referral_returns_existing_code(app, mock_pool):
    mock_pool.fetchrow.return_value = {"code": "existing"}
    mock_pool.fetchval.return_value = 0
    client = authed_client(app, mock_pool)

    resp = client.get("/referrals/me")
    assert resp.status_code == 200
    assert resp.json()["code"] == "existing"


def test_accept_grants_bonus_to_both_tenants(app, mock_pool):
    ref_id = uuid.uuid4()
    mock_pool.fetchrow.side_effect = [
        None,  # not yet accepted
        {"id": ref_id, "referrer_user_id": "referrer-1"},  # code lookup
    ]
    client = authed_client(app, mock_pool, user_id="new-user")

    resp = client.post("/referrals/accept", json={"code": "abc12345"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"accepted": True, "bonus_tokens": REFERRAL_BONUS_TOKENS}

    calls = [str(c) for c in mock_pool._conn.execute.call_args_list]
    assert any("UPDATE referrals" in c for c in calls)
    bonus_updates = [c for c in calls if "referral_bonus_tokens" in c]
    assert len(bonus_updates) == 2  # one per side


def test_accept_rejects_own_code(app, mock_pool):
    mock_pool.fetchrow.side_effect = [
        None,
        {"id": uuid.uuid4(), "referrer_user_id": "user-1"},
    ]
    client = authed_client(app, mock_pool, user_id="user-1")

    resp = client.post("/referrals/accept", json={"code": "selfcode"})
    assert resp.status_code == 400


def test_accept_returns_404_for_unknown_code(app, mock_pool):
    mock_pool.fetchrow.side_effect = [None, None]
    client = authed_client(app, mock_pool, user_id="new-user")

    resp = client.post("/referrals/accept", json={"code": "nope"})
    assert resp.status_code == 404


def test_accept_idempotent_when_already_used(app, mock_pool):
    mock_pool.fetchrow.return_value = {"id": uuid.uuid4()}
    client = authed_client(app, mock_pool, user_id="new-user")

    resp = client.post("/referrals/accept", json={"code": "anything"})
    assert resp.status_code == 200
    assert resp.json() == {"accepted": False, "bonus_tokens": 0}


def test_referrals_require_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    assert client.get("/referrals/me").status_code == 401
    assert client.post("/referrals/accept", json={"code": "x"}).status_code == 401
