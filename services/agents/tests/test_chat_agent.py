"""Unit tests for ChatAgent."""

import pytest
from agents import ChatState, build_chat_graph
from langchain_core.messages import AIMessage, HumanMessage


@pytest.fixture
def agent(mock_llm):
    return build_chat_graph(llm=mock_llm)


async def test_run_returns_ai_message(agent, mock_llm):
    state = ChatState(
        messages=[HumanMessage(content="Hello")],
        session_id="test",
        system_prompt="",
    )
    result = await agent.run(state)
    assert "messages" in result
    last = result["messages"][-1]
    assert isinstance(last, AIMessage)
    assert last.content == "Mock response."


async def test_run_calls_llm_chat(agent, mock_llm):
    state = ChatState(
        messages=[HumanMessage(content="Hello")],
        session_id="test",
        system_prompt="",
    )
    await agent.run(state)
    mock_llm.chat.assert_called_once()


async def test_system_prompt_forwarded_to_llm(agent, mock_llm):
    state = ChatState(
        messages=[HumanMessage(content="Hello")],
        session_id="test",
        system_prompt="You are a pirate.",
    )
    await agent.run(state)
    call_messages = mock_llm.chat.call_args[0][0]
    system_msg = next((m for m in call_messages if m.role == "system"), None)
    assert system_msg is not None
    assert "pirate" in system_msg.content


async def test_stream_yields_tokens(agent, mock_llm):
    state = {
        "messages": [HumanMessage(content="Hi")],
        "session_id": "test",
        "system_prompt": "",
    }
    tokens = [token async for token in agent.stream(state)]
    assert tokens == ["Mock", " response", "."]


async def test_stream_uses_system_prompt(mock_llm):
    from ai import StreamEvent

    captured: list = []

    async def _stream_with_usage(messages, **kwargs):
        captured.extend(messages)
        yield StreamEvent(type="token", content="ok")

    mock_llm.stream_with_usage = _stream_with_usage
    agent = build_chat_graph(llm=mock_llm)
    state = {
        "messages": [HumanMessage(content="Hi")],
        "session_id": "test",
        "system_prompt": "Be brief.",
    }
    [token async for token in agent.stream(state)]
    system_msg = next((m for m in captured if m.role == "system"), None)
    assert system_msg is not None
    assert "Be brief." in system_msg.content


async def test_multi_turn_history_preserved(agent, mock_llm):
    """All prior messages must be forwarded to the LLM on each turn."""
    state = ChatState(
        messages=[
            HumanMessage(content="Hi"),
            AIMessage(content="Hello!"),
            HumanMessage(content="How are you?"),
        ],
        session_id="test",
        system_prompt="",
    )
    await agent.run(state)
    call_messages = mock_llm.chat.call_args[0][0]
    roles = [m.role for m in call_messages]
    assert roles.count("user") == 2
    assert roles.count("assistant") == 1


async def test_stream_with_usage_forwards_usage_event(mock_llm):
    """stream_with_usage emits tokens then a final aggregated usage event."""
    from ai import StreamEvent, Usage

    async def _stream_with_usage(*args, **kwargs):
        yield StreamEvent(type="token", content="hi")
        yield StreamEvent(
            type="usage",
            usage=Usage(prompt_tokens=10, completion_tokens=3, total_tokens=13),
        )

    mock_llm.stream_with_usage = _stream_with_usage
    agent = build_chat_graph(llm=mock_llm)

    state = {
        "messages": [HumanMessage(content="hi")],
        "session_id": "test",
        "system_prompt": "",
    }
    events = [e async for e in agent.stream_with_usage(state)]
    assert any(e.type == "token" and e.content == "hi" for e in events)
    usage_event = next(e for e in events if e.type == "usage")
    assert usage_event.usage.total_tokens == 13
