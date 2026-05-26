from unittest.mock import AsyncMock

import pytest
from memory import BudgetExceeded


@pytest.mark.asyncio
async def test_scope_session_id():
    from api.repositories.session_repository import SessionRepository

    assert SessionRepository.scope("user-1", "chat") == "user-1:chat"


@pytest.mark.asyncio
async def test_get_messages_delegates_to_store(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    msgs = await repo.get_messages("user-1:default")
    mock_store.get_messages.assert_called_once_with("user-1:default")
    assert len(msgs) == 2


@pytest.mark.asyncio
async def test_get_token_limit_returns_tenant_value(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    limit = await repo.get_token_limit("user-1")
    assert limit == 50_000


@pytest.mark.asyncio
async def test_get_token_limit_fallback_when_no_tenant(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository

    mock_pool.fetchrow = AsyncMock(return_value=None)
    repo = SessionRepository(store=mock_store, pool=mock_pool, default_limit=100_000)
    limit = await repo.get_token_limit("unknown-user")
    assert limit == 100_000


@pytest.mark.asyncio
async def test_check_budget_raises_when_exceeded(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository

    mock_store.get_monthly_tenant_usage = AsyncMock(return_value=60_000)  # Over 50k limit
    repo = SessionRepository(store=mock_store, pool=mock_pool)
    with pytest.raises(BudgetExceeded):
        await repo.check_budget("user-1:default", "user-1")
