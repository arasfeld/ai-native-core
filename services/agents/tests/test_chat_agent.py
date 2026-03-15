"""Unit tests for ChatAgent."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from agents import ChatState, build_chat_graph
from ai import LLMResponse


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
    captured: list = []

    async def _stream(messages, **kwargs):
        captured.extend(messages)
        yield "ok"

    mock_llm.stream = _stream
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
