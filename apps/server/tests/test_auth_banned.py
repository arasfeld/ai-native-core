"""Tests for banned-user enforcement in get_current_user."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import get_current_user
from fastapi import FastAPI, HTTPException, Request


@pytest.mark.asyncio
async def test_banned_user_raises_401():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "banned@example.com",
            "name": "Banned",
            "image": None,
            "emailVerified": True,
            "banned": True,
        }
    )
    pool.fetch = AsyncMock(return_value=[])

    app = FastAPI()
    app.state.db_pool = pool

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", b"better-auth.session_token=tok.sig")],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(request, None)

    assert exc_info.value.status_code == 401
    assert "suspended" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_active_user_passes_banned_check():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-2",
            "email": "active@example.com",
            "name": "Active",
            "image": None,
            "emailVerified": True,
            "banned": False,
        }
    )
    pool.fetch = AsyncMock(return_value=[])

    app = FastAPI()
    app.state.db_pool = pool

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
    assert user.id == "user-2"
