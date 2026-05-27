"""Tests for API-key-based authentication in get_current_user."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import get_current_user
from fastapi import FastAPI, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials


def _request_with_bearer(app: FastAPI, token: str) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/chat",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
        "query_string": b"",
        "app": app,
    }
    return Request(scope)


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


@pytest.mark.asyncio
async def test_valid_api_key_authenticates_and_touches_last_used():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "dev@example.com",
            "name": "Dev",
            "image": None,
            "emailVerified": True,
            "banned": False,
            "key_id": "00000000-0000-0000-0000-000000000001",
        }
    )
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    app = FastAPI()
    app.state.db_pool = pool

    token = "ak_" + "a" * 64
    user = await get_current_user(_request_with_bearer(app, token), _creds(token))

    assert user.id == "user-1"
    assert user.email == "dev@example.com"

    # Looked up by SHA-256 of the full key
    expected_hash = hashlib.sha256(token.encode()).hexdigest()
    assert pool.fetchrow.await_args.args[1] == expected_hash

    # last_used_at gets touched for the matched key row
    pool.execute.assert_awaited_once()
    assert pool.execute.await_args.args[1] == "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_unknown_api_key_returns_401():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value=None)
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    app = FastAPI()
    app.state.db_pool = pool

    token = "ak_" + "b" * 64
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_request_with_bearer(app, token), _creds(token))

    assert exc_info.value.status_code == 401
    assert "api key" in exc_info.value.detail.lower()
    pool.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoked_api_key_returns_401():
    # Revoked keys are filtered by `revoked_at IS NULL` in the SQL, so the row is None.
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value=None)
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    app = FastAPI()
    app.state.db_pool = pool

    token = "ak_" + "c" * 64
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_request_with_bearer(app, token), _creds(token))

    assert exc_info.value.status_code == 401
    # SQL filter must include revoked_at IS NULL so revoked rows aren't returned.
    sql = pool.fetchrow.await_args.args[0]
    assert "revoked_at IS NULL" in sql


@pytest.mark.asyncio
async def test_banned_user_with_valid_api_key_rejected():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-2",
            "email": "banned@example.com",
            "name": None,
            "image": None,
            "emailVerified": True,
            "banned": True,
            "key_id": "00000000-0000-0000-0000-000000000002",
        }
    )
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    app = FastAPI()
    app.state.db_pool = pool

    token = "ak_" + "d" * 64
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(_request_with_bearer(app, token), _creds(token))

    assert exc_info.value.status_code == 401
    assert "suspended" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_non_api_key_token_uses_session_lookup():
    """Tokens without the `ak_` prefix should hit the session table, not user_api_keys."""
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-3",
            "email": "session@example.com",
            "name": "Session",
            "image": None,
            "emailVerified": True,
            "banned": False,
        }
    )
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    app = FastAPI()
    app.state.db_pool = pool

    token = "sess_token.sig"
    user = await get_current_user(_request_with_bearer(app, token), _creds(token))

    assert user.id == "user-3"
    sql = pool.fetchrow.await_args.args[0]
    assert "session" in sql.lower()
    assert "user_api_keys" not in sql
    # last_used_at update path must not fire for session auth.
    pool.execute.assert_not_awaited()
