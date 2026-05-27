from unittest.mock import AsyncMock, MagicMock

import pytest
from ai import LLMResponse, StreamEvent
from langchain_core.messages import AIMessage, HumanMessage


@pytest.fixture
def mock_store():
    store = AsyncMock()
    store.get_messages = AsyncMock(
        return_value=[
            HumanMessage(content="hello"),
            AIMessage(content="hi there"),
        ]
    )
    store.add_message = AsyncMock()
    store.add_token_usage = AsyncMock()
    store.get_token_usage = AsyncMock(return_value=0)
    store.get_monthly_tenant_usage = AsyncMock(return_value=0)
    return store


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    # `get_token_limit` SQL aliases `token_limit + referral_bonus_tokens` AS `total`.
    pool.fetchrow = AsyncMock(return_value={"total": 50_000})
    pool.execute = AsyncMock()
    return pool


@pytest.fixture
def mock_llm():
    llm = AsyncMock()
    llm.chat = AsyncMock(return_value=LLMResponse(content="Mock response."))
    llm.bind_tools = MagicMock(return_value=None)

    async def _stream(*args, **kwargs):
        for token in ["Mock", " response", "."]:
            yield token

    async def _stream_with_usage(*args, **kwargs):
        for token in ["Mock", " response", "."]:
            yield StreamEvent(type="token", content=token)

    llm.stream = _stream
    llm.stream_with_usage = _stream_with_usage
    return llm
