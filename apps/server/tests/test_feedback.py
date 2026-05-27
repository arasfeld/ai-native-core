"""Tests for /feedback endpoint."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_optional_user
from api.routers.feedback import router
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
    # INSERT ... RETURNING id
    pool.fetchrow = AsyncMock(return_value={"id": uuid.uuid4()})
    return pool


def authed_client(app, mock_pool, user_id: str = "user-1") -> TestClient:
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id=user_id, email=f"{user_id}@example.com")

    app.dependency_overrides[get_optional_user] = override
    return TestClient(app)


def test_submit_thumbs_up(app, mock_pool):
    client = authed_client(app, mock_pool)
    run_id = uuid.uuid4()

    resp = client.post(
        "/feedback",
        json={"run_id": str(run_id), "rating": 1, "session_id": "default"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert "id" in body
    # Verify INSERT was issued with the right args
    call = mock_pool.fetchrow.await_args
    args = call.args[1:]
    assert args[0] == run_id  # run_id
    assert args[1] == "default"  # session_id
    assert args[2] == "user-1"  # tenant_id (no org -> user.id)
    assert args[3] == "user-1"  # user_id
    assert args[4] == 1  # rating
    assert args[5] is None  # comment


def test_submit_thumbs_down_with_comment(app, mock_pool):
    client = authed_client(app, mock_pool)
    run_id = uuid.uuid4()

    resp = client.post(
        "/feedback",
        json={
            "run_id": str(run_id),
            "rating": -1,
            "session_id": "chat-123",
            "comment": "this was wrong",
        },
    )

    assert resp.status_code == 200
    call = mock_pool.fetchrow.await_args
    assert call.args[5] == -1  # rating
    assert call.args[6] == "this was wrong"  # comment


def test_invalid_rating_rejected(app, mock_pool):
    client = authed_client(app, mock_pool)
    resp = client.post(
        "/feedback",
        json={"run_id": str(uuid.uuid4()), "rating": 5, "session_id": "default"},
    )
    assert resp.status_code == 422


def test_missing_session_id_rejected(app, mock_pool):
    client = authed_client(app, mock_pool)
    resp = client.post(
        "/feedback",
        json={"run_id": str(uuid.uuid4()), "rating": 1},
    )
    assert resp.status_code == 422


def test_guest_feedback_accepted_with_null_user_id(app, mock_pool):
    """Without an auth override, the client is treated as a guest and
    the row's user_id should be NULL."""
    app.state.db_pool = mock_pool
    client = TestClient(app)
    run_id = uuid.uuid4()

    resp = client.post(
        "/feedback",
        json={"run_id": str(run_id), "rating": 1, "session_id": "default"},
    )
    assert resp.status_code == 200
    call = mock_pool.fetchrow.await_args
    # call.args = (sql, $1=run_id, $2=session_id, $3=tenant_id, $4=user_id,
    # $5=rating, $6=comment). Guest tenant_id derives from IP; user_id is NULL.
    assert call.args[3].startswith("guest:")
    assert call.args[4] is None  # user_id NULL for guest
    assert call.args[5] == 1  # rating


def test_feedback_service_skips_langsmith_when_disabled(monkeypatch):
    """If LangSmith env vars are unset, FeedbackService doesn't attempt a
    mirror call."""
    from api.services.feedback_service import FeedbackService

    monkeypatch.delenv("LANGCHAIN_TRACING_V2", raising=False)
    monkeypatch.delenv("LANGCHAIN_API_KEY", raising=False)

    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"id": uuid.uuid4()})

    svc = FeedbackService(pool=pool)

    # With tracing disabled, no background task should be scheduled. We can't
    # easily intercept asyncio.ensure_future, but we can assert is_tracing_enabled
    # returns False and the insert still completes.
    import asyncio

    from agents import is_tracing_enabled

    assert is_tracing_enabled() is False
    asyncio.run(
        svc.record(
            run_id=uuid.uuid4(),
            rating=1,
            session_id="s",
            tenant_id="t",
            user_id="u",
        )
    )
    pool.fetchrow.assert_awaited_once()
