"""Tests for the audit log service and router."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from api.auth.deps import AuthUser, get_current_user
from fastapi import FastAPI
from fastapi.testclient import TestClient


# ── Helpers ───────────────────────────────────────────────────────────────────


def authed_admin_client(app: FastAPI, mock_pool) -> TestClient:
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset(["admin:users:read", "admin:users:write"]),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


# ── _write unit tests ─────────────────────────────────────────────────────────


def test_write_inserts_row():
    from api.services.audit import _write

    pool = AsyncMock()
    pool.execute = AsyncMock()
    asyncio.run(_write(pool, "actor-1", "user.banned", "user", "target-1", {}, "1.2.3.4"))
    pool.execute.assert_called_once()
    sql = pool.execute.call_args[0][0]
    assert "INSERT INTO audit_logs" in sql


def test_write_swallows_db_errors():
    from api.services.audit import _write

    pool = AsyncMock()
    pool.execute = AsyncMock(side_effect=Exception("DB down"))
    # Must not raise
    asyncio.run(_write(pool, "actor-1", "user.banned", "user", "target-1", {}, None))
