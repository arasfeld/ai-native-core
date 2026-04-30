"""Tests for permission loading in get_current_user."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import get_current_user
from fastapi import FastAPI, Request


@pytest.fixture
def pool_with_permissions():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "test@example.com",
            "name": "Test",
            "image": None,
            "emailVerified": True,
            "banned": False,
        }
    )
    pool.fetch = AsyncMock(return_value=[{"id": "admin:users:read"}, {"id": "billing:manage"}])
    return pool


@pytest.mark.asyncio
async def test_get_current_user_loads_permissions(pool_with_permissions):
    app = FastAPI()
    app.state.db_pool = pool_with_permissions

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", b"better-auth.session_token=tok.sig")],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    user = await get_current_user(request, None)

    assert "admin:users:read" in user.permissions
    assert "billing:manage" in user.permissions
    assert isinstance(user.permissions, frozenset)


@pytest.mark.asyncio
async def test_get_current_user_empty_permissions_when_none_assigned(pool_with_permissions):
    pool_with_permissions.fetch = AsyncMock(return_value=[])

    app = FastAPI()
    app.state.db_pool = pool_with_permissions

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", b"better-auth.session_token=tok.sig")],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    user = await get_current_user(request, None)

    assert user.permissions == frozenset()
