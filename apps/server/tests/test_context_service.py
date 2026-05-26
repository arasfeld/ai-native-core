from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import SystemMessage


@dataclass
class FakeFact:
    content: str
    session_id: str | None = None
    score: float = 0.9


@pytest.fixture
def mock_episodic():
    e = AsyncMock()
    e.search = AsyncMock(return_value=[FakeFact("User likes brevity.")])
    return e


@pytest.fixture
def mock_compressor():
    c = AsyncMock()
    c.compress = AsyncMock(side_effect=lambda msgs: msgs)  # pass-through
    return c


@pytest.mark.asyncio
async def test_build_returns_history_with_user_message(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    messages, place = await svc.build(message="hello", session_id="user-1:default")

    # History (2 msgs) + episodic system message
    assert any(isinstance(m, SystemMessage) for m in messages)


@pytest.mark.asyncio
async def test_build_injects_location_system_message(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    with patch(
        "api.services.context_service.get_location_context",
        new=AsyncMock(return_value="User is in Brooklyn, NY.\nWeather: 65°F, clear."),
    ):
        messages, _ = await svc.build(
            message="what's the weather?",
            session_id="user-1:default",
            lat=40.6782,
            lng=-73.9442,
        )

    system_messages = [m for m in messages if isinstance(m, SystemMessage)]
    location_msgs = [m for m in system_messages if "location" in m.content.lower()]
    assert len(location_msgs) == 1


@pytest.mark.asyncio
async def test_build_returns_location_place(mock_store, mock_pool, mock_episodic, mock_compressor):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    with patch(
        "api.services.context_service.get_location_context",
        new=AsyncMock(return_value="User is in Brooklyn, NY.\nWeather: 65°F, clear."),
    ):
        result = await svc.build(
            message="hello",
            session_id="user-1:default",
            lat=40.6782,
            lng=-73.9442,
        )

    # build() returns (messages, place) tuple
    messages, place = result
    assert place == "Brooklyn, NY"


@pytest.mark.asyncio
async def test_build_without_location_returns_none_place(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    result = await svc.build(message="hello", session_id="user-1:default")
    _, place = result
    assert place is None
