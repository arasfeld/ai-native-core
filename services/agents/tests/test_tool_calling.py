"""Tests for tool-calling infrastructure in BaseLLM providers."""

from unittest.mock import AsyncMock

import pytest
from langchain_core.tools import tool


@tool
def get_weather(location: str) -> str:
    """Get the weather for a location."""
    return f"72°F and sunny in {location}"


def test_llmresponse_has_tool_calls_field():
    from ai import LLMResponse

    r = LLMResponse(
        content="",
        tool_calls=[{"name": "get_weather", "args": {"location": "NYC"}, "id": "call_1"}],
    )
    assert r.tool_calls is not None
    assert r.tool_calls[0]["name"] == "get_weather"


def test_message_has_tool_calls_field():
    from ai.base import Message

    m = Message(
        role="assistant",
        content="",
        tool_calls=[{"name": "get_weather", "args": {"location": "NYC"}, "id": "call_1"}],
    )
    assert m.tool_calls[0]["name"] == "get_weather"


def test_messages_to_dicts_serialises_tool_calls():
    from ai.base import Message
    from ai.utils import messages_to_dicts

    msg = Message(
        role="assistant",
        content="",
        tool_calls=[{"name": "get_weather", "args": {"location": "NYC"}, "id": "call_1"}],
    )
    dicts = messages_to_dicts([msg])
    assert dicts[0]["role"] == "assistant"
    assert "tool_calls" in dicts[0]
    # OpenAI wire format
    assert dicts[0]["tool_calls"][0]["function"]["name"] == "get_weather"


def test_messages_to_dicts_serialises_tool_result():
    from ai.base import Message
    from ai.utils import messages_to_dicts

    msg = Message(role="tool", content="72°F", tool_call_id="call_1", name="get_weather")
    dicts = messages_to_dicts([msg])
    assert dicts[0]["role"] == "tool"
    assert dicts[0]["tool_call_id"] == "call_1"


@pytest.mark.asyncio
async def test_chat_agent_executes_tool_and_returns_result():
    """Agent calls a tool and incorporates the result into its final answer."""
    from agents import build_chat_graph
    from ai import LLMResponse
    from langchain_core.tools import tool

    call_count = 0

    @tool
    def lookup_city_pop(city: str) -> str:
        """Look up the population of a city."""
        return f"{city} has 8.3 million people."

    # LLM first returns a tool call, then returns the final answer
    mock_llm = AsyncMock()
    mock_llm.bind_tools = lambda tools: mock_llm  # bind_tools returns same mock

    responses = [
        LLMResponse(
            content="",
            tool_calls=[{"name": "lookup_city_pop", "args": {"city": "NYC"}, "id": "call_1"}],
        ),
        LLMResponse(content="NYC has 8.3 million people.", tool_calls=None),
    ]

    async def chat_side_effect(messages, **kwargs):
        nonlocal call_count
        resp = responses[min(call_count, len(responses) - 1)]
        call_count += 1
        return resp

    mock_llm.chat = chat_side_effect

    agent = build_chat_graph(llm=mock_llm, tools=[lookup_city_pop])
    tokens = []
    async for token in agent.stream(
        {
            "messages": [],
            "session_id": "test",
            "system_prompt": "",
        }
    ):
        tokens.append(token)

    full = "".join(tokens)
    assert "8.3 million" in full
    assert call_count == 2  # LLM called twice: once for tool call, once for final answer


@pytest.mark.asyncio
async def test_chat_agent_without_tools_streams_directly():
    """Without tools, agent streams tokens directly."""
    from agents import build_chat_graph
    from ai import StreamEvent

    mock_llm = AsyncMock()

    async def fake_stream(messages, **kwargs):
        for token in ["Mock", " response", "."]:
            yield token

    async def fake_stream_with_usage(messages, **kwargs):
        for token in ["Mock", " response", "."]:
            yield StreamEvent(type="token", content=token)

    mock_llm.stream = fake_stream
    mock_llm.stream_with_usage = fake_stream_with_usage

    agent = build_chat_graph(llm=mock_llm)
    tokens = []
    async for token in agent.stream(
        {
            "messages": [],
            "session_id": "test",
            "system_prompt": "",
        }
    ):
        tokens.append(token)

    assert "".join(tokens) == "Mock response."
