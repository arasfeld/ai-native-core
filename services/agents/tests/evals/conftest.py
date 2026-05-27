"""Fixtures for eval tests — requires real LLM access."""

import pytest
from ai import get_llm


@pytest.fixture(scope="session")
def real_llm():
    """Real LLM instance for eval tests. Requires API keys in environment."""
    return get_llm()


@pytest.fixture
def eval_tools():
    """The tool set the chat agent is given during tool_use evals.

    Kept in sync with ``apps/server/src/api/agent_factory.py``. Note: tools
    are instantiated fresh per test so the ``_ToolRecorder`` arun-mutation in
    ``test_golden.py`` doesn't leak between cases.
    """
    from tools import (
        GenerateImageTool,
        NearbyPOITool,
        ReverseGeocodeTool,
        WeatherTool,
        WebSearchTool,
    )

    return [
        WeatherTool(),
        WebSearchTool(),
        GenerateImageTool(),
        NearbyPOITool(),
        ReverseGeocodeTool(),
    ]
