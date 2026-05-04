from unittest.mock import AsyncMock, MagicMock

import pytest


class FakeUser:
    id = "user-1"
    email = "test@example.com"
    org_id = "user-1"


class FakeRequest:
    message = "hello"
    session_id = "default"
    use_rag = False
    system_prompt = ""
    lat = None
    lng = None


@pytest.fixture
def mock_context_service():
    from langchain_core.messages import HumanMessage
    svc = AsyncMock()
    svc.build = AsyncMock(return_value=(
        [HumanMessage(content="hello")],  # context messages
        None,  # no location place
    ))
    return svc


@pytest.fixture
def mock_session_repo(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository
    return SessionRepository(store=mock_store, pool=mock_pool)


@pytest.fixture
def mock_agent():
    agent = MagicMock()

    async def fake_stream(state):
        yield "hello"
        yield " world"

    agent.stream = fake_stream
    return agent


@pytest.fixture
def mock_agent_factory(mock_agent):
    factory = MagicMock()
    factory.build = MagicMock(return_value=mock_agent)
    return factory


@pytest.mark.asyncio
async def test_stream_yields_tokens(
    mock_context_service, mock_session_repo, mock_agent_factory
):
    from api.services.chat_service import ChatService

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=mock_agent_factory,
        session_repo=mock_session_repo,
    )

    tokens = []
    async for token in svc.stream(FakeRequest(), FakeUser()):
        if not token.startswith("data:"):
            continue
        tokens.append(token)

    assert any("hello" in t for t in tokens)
    assert any("world" in t for t in tokens)


@pytest.mark.asyncio
async def test_stream_saves_message_after_done(
    mock_context_service, mock_session_repo, mock_agent_factory, mock_store
):
    from api.services.chat_service import ChatService

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=mock_agent_factory,
        session_repo=mock_session_repo,
    )

    async for _ in svc.stream(FakeRequest(), FakeUser()):
        pass

    # Saves user message + assistant reply
    assert mock_store.add_message.call_count == 2
