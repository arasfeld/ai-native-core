"""Fixtures for eval tests — requires real LLM access."""

import pytest

from ai import get_llm


@pytest.fixture(scope="session")
def real_llm():
    """Real LLM instance for eval tests. Requires API keys in environment."""
    return get_llm()
