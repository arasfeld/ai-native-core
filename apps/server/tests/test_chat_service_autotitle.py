"""Tests for ChatService auto-title and updated_at bump logic."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from api.auth.deps import AuthUser
from api.repositories.session_repository import SessionRepository
from api.services.chat_service import ChatService
from api.services.context_service import ContextService


async def _async_gen(items):
    for item in items:
        yield item


def make_service(pool: AsyncMock) -> ChatService:
    store = MagicMock()
    store.get_messages = AsyncMock(return_value=[])
    store.add_message = AsyncMock()
    store.add_token_usage = AsyncMock()
    store.ensure_table = AsyncMock()
    store.get_monthly_tenant_usage = AsyncMock(return_value=0)

    session_repo = SessionRepository(store=store, pool=pool)

    context_service = MagicMock(spec=ContextService)
    context_service.build = AsyncMock(return_value=([], None))

    agent = MagicMock()
    agent.stream = MagicMock(return_value=_async_gen(["Hello", "!"]))

    agent_factory = MagicMock()
    agent_factory.build = MagicMock(return_value=agent)

    return ChatService(
        context_service=context_service,
        agent_factory=agent_factory,
        session_repo=session_repo,
    )


@pytest.mark.asyncio
async def test_auto_title_fires_on_first_message():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"total": 100000})
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    service = make_service(pool)

    request = MagicMock()
    request.message = "Tell me a joke"
    request.session_id = "conv-123"
    request.use_rag = False
    request.system_prompt = ""
    request.lat = None
    request.lng = None

    user = AuthUser(id="user-1", email="u@example.com")
    [t async for t in service.stream(request, user, is_guest=False)]

    calls = [str(c) for c in pool.execute.call_args_list]
    title_calls = [c for c in calls if "title = $1" in c and "New chat" in c]
    assert len(title_calls) == 1


@pytest.mark.asyncio
async def test_updated_at_bump_fires_every_turn():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"total": 100000})
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    service = make_service(pool)

    request = MagicMock()
    request.message = "Hello"
    request.session_id = "conv-456"
    request.use_rag = False
    request.system_prompt = ""
    request.lat = None
    request.lng = None

    user = AuthUser(id="user-1", email="u@example.com")
    [t async for t in service.stream(request, user, is_guest=False)]

    calls = [str(c) for c in pool.execute.call_args_list]
    bump_calls = [c for c in calls if "updated_at = NOW()" in c and "title" not in c]
    assert len(bump_calls) >= 1


@pytest.mark.asyncio
async def test_auto_title_skipped_for_guests():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"token_limit": 10000})
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    service = make_service(pool)

    request = MagicMock()
    request.message = "Guest message"
    request.session_id = "default"
    request.use_rag = False
    request.system_prompt = ""
    request.lat = None
    request.lng = None

    user = AuthUser(id="guest:1.2.3.4", email="guest@anonymous")
    [t async for t in service.stream(request, user, is_guest=True)]

    calls = [str(c) for c in pool.execute.call_args_list]
    title_calls = [c for c in calls if "title = $1" in c and "New chat" in c]
    assert len(title_calls) == 0
