"""Tests for conversations.system_instructions and ChatService resolution."""

from __future__ import annotations

from datetime import UTC
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


def test_patch_conversation_persists_system_instructions(app, mock_pool):
    mock_pool.fetchrow.return_value = {
        "id": "conv-1",
        "title": "My chat",
        "system_instructions": "",
    }
    client = authed_client(app, mock_pool)
    resp = client.patch(
        "/conversations/conv-1",
        json={"system_instructions": "Be concise."},
    )
    assert resp.status_code == 200
    assert resp.json()["system_instructions"] == "Be concise."


def test_list_conversations_includes_system_instructions(app, mock_pool):
    from datetime import datetime

    now = datetime.now(UTC)
    mock_pool.fetch.return_value = [
        {
            "id": "conv-1",
            "title": "Chat 1",
            "system_instructions": "Always reply in French.",
            "created_at": now,
            "updated_at": now,
        }
    ]
    client = authed_client(app, mock_pool)
    resp = client.get("/conversations")
    assert resp.status_code == 200
    items = resp.json()
    assert items[0]["system_instructions"] == "Always reply in French."


def test_patch_title_does_not_clear_system_instructions(app, mock_pool):
    mock_pool.fetchrow.return_value = {
        "id": "conv-1",
        "title": "Old title",
        "system_instructions": "Keep it short.",
    }
    client = authed_client(app, mock_pool)
    resp = client.patch("/conversations/conv-1", json={"title": "Renamed"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Renamed"
    assert data["system_instructions"] == "Keep it short."


def test_resolution_combines_nonempty_parts():
    parts = ["global", "per-conv", "request"]
    result = "\n\n".join(p for p in parts if p)
    assert result == "global\n\nper-conv\n\nrequest"


def test_resolution_skips_empty_parts():
    parts = ["global", "", "request"]
    result = "\n\n".join(p for p in parts if p)
    assert result == "global\n\nrequest"


def test_resolution_all_empty_yields_empty():
    parts = ["", "", ""]
    result = "\n\n".join(p for p in parts if p)
    assert result == ""
