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
    svc.build = AsyncMock(
        return_value=(
            [HumanMessage(content="hello")],  # context messages
            None,  # no location place
        )
    )
    return svc


@pytest.fixture
def mock_session_repo(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository

    return SessionRepository(store=mock_store, pool=mock_pool)


@pytest.fixture
def mock_agent():
    from ai import StreamEvent

    agent = MagicMock()

    async def fake_stream(state):
        yield "hello"
        yield " world"

    async def fake_stream_with_usage(state):
        yield StreamEvent(type="token", content="hello")
        yield StreamEvent(type="token", content=" world")

    agent.stream = fake_stream
    agent.stream_with_usage = fake_stream_with_usage
    return agent


@pytest.fixture
def mock_agent_factory(mock_agent):
    factory = MagicMock()
    factory.build = MagicMock(return_value=mock_agent)
    return factory


@pytest.mark.asyncio
async def test_stream_yields_tokens(mock_context_service, mock_session_repo, mock_agent_factory):
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


@pytest.mark.asyncio
async def test_stream_records_real_usage_when_provider_emits_it(
    mock_context_service, mock_session_repo, mock_store
):
    """When the agent emits a usage StreamEvent, ChatService records that
    total instead of the heuristic estimate."""
    from ai import StreamEvent, Usage
    from api.services.chat_service import ChatService

    agent = MagicMock()

    async def fake_stream_with_usage(state):
        yield StreamEvent(type="token", content="hello")
        yield StreamEvent(type="token", content=" world")
        yield StreamEvent(
            type="usage",
            usage=Usage(prompt_tokens=20, completion_tokens=5, total_tokens=25),
        )

    agent.stream_with_usage = fake_stream_with_usage

    factory = MagicMock()
    factory.build = MagicMock(return_value=agent)

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=factory,
        session_repo=mock_session_repo,
    )

    async for _ in svc.stream(FakeRequest(), FakeUser()):
        pass

    # Real usage (25) was recorded, not the estimate.
    mock_store.add_token_usage.assert_awaited_once()
    recorded_tokens = mock_store.add_token_usage.await_args.args[1]
    assert recorded_tokens == 25


@pytest.mark.asyncio
async def test_stream_falls_back_to_estimate_when_provider_omits_usage(
    mock_context_service, mock_session_repo, mock_store
):
    """When no usage event is emitted (Ollama), ChatService falls back to
    estimate_tokens — non-zero count keeps budget enforcement working."""
    from ai import StreamEvent
    from api.services.chat_service import ChatService

    agent = MagicMock()

    async def fake_stream_with_usage(state):
        yield StreamEvent(type="token", content="hello")
        yield StreamEvent(type="token", content=" world")
        # No usage event — Ollama path

    agent.stream_with_usage = fake_stream_with_usage

    factory = MagicMock()
    factory.build = MagicMock(return_value=agent)

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=factory,
        session_repo=mock_session_repo,
    )

    async for _ in svc.stream(FakeRequest(), FakeUser()):
        pass

    mock_store.add_token_usage.assert_awaited_once()
    recorded_tokens = mock_store.add_token_usage.await_args.args[1]
    assert recorded_tokens > 0  # estimate fired


@pytest.mark.asyncio
async def test_stream_emits_run_id_meta_event(
    mock_context_service, mock_session_repo, mock_agent_factory
):
    """The very first SSE event must carry the run_id so clients can submit
    feedback against the trace later."""
    import json
    import uuid

    from api.services.chat_service import ChatService

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=mock_agent_factory,
        session_repo=mock_session_repo,
    )

    fixed_run_id = uuid.uuid4()
    events = []
    async for chunk in svc.stream(FakeRequest(), FakeUser(), run_id=fixed_run_id):
        events.append(chunk)

    first_data = events[0]
    assert first_data.startswith("data: ")
    payload = json.loads(first_data[len("data: ") :].strip())
    assert payload == {"type": "meta", "run_id": str(fixed_run_id)}


@pytest.mark.asyncio
async def test_stream_invokes_trace_chat_with_metadata(
    mock_context_service, mock_session_repo, mock_agent_factory, monkeypatch
):
    """ChatService should hand a populated metadata dict to trace_chat."""
    import uuid

    from api.services import chat_service as chat_service_module

    captured: dict = {}

    class _FakeRunTree:
        def add_outputs(self, _):
            pass

        def add_metadata(self, _):
            pass

    from contextlib import contextmanager

    @contextmanager
    def fake_trace_chat(**kwargs):
        captured.update(kwargs)
        yield _FakeRunTree()

    monkeypatch.setattr(chat_service_module, "trace_chat", fake_trace_chat)

    svc = chat_service_module.ChatService(
        context_service=mock_context_service,
        agent_factory=mock_agent_factory,
        session_repo=mock_session_repo,
    )

    run_id = uuid.uuid4()
    async for _ in svc.stream(FakeRequest(), FakeUser(), run_id=run_id):
        pass

    assert captured["run_id"] == run_id
    assert captured["name"] == "chat.stream"
    assert captured["metadata"]["user_id"] == "user-1"
    assert captured["metadata"]["is_guest"] is False
    assert "chat" in captured["tags"]


@pytest.mark.asyncio
async def test_stream_is_no_op_trace_when_langsmith_disabled(
    mock_context_service, mock_session_repo, mock_agent_factory, monkeypatch
):
    """With env vars unset, trace_chat must not hit langsmith — exercised by
    asserting is_tracing_enabled() returns False under those conditions."""
    from agents import tracing

    monkeypatch.delenv("LANGCHAIN_TRACING_V2", raising=False)
    monkeypatch.delenv("LANGCHAIN_API_KEY", raising=False)
    assert tracing.is_tracing_enabled() is False

    # And the no-op context manager yields None.
    with tracing.trace_chat(run_id=__import__("uuid").uuid4()) as rt:
        assert rt is None
