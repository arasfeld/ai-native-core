"""Shared fixtures for agent unit tests."""

from unittest.mock import AsyncMock

import pytest
from ai import LLMResponse


@pytest.fixture
def mock_llm():
    """Mock LLM that returns a canned response — no real API calls."""
    llm = AsyncMock()
    llm.chat.return_value = LLMResponse(content="Mock response.")

    async def _stream(*args, **kwargs):
        for token in ["Mock", " response", "."]:
            yield token

    llm.stream = _stream
    return llm
