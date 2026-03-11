from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from langgraph.graph.state import CompiledStateGraph


class BaseAgent(ABC):
    """Abstract base for all LangGraph agents."""

    @abstractmethod
    def build_graph(self) -> CompiledStateGraph:
        """Build and compile the LangGraph StateGraph."""
        ...

    @abstractmethod
    async def run(self, input: dict[str, Any]) -> dict[str, Any]:
        """Run the agent to completion and return final state."""
        ...

    @abstractmethod
    async def stream(self, input: dict[str, Any]) -> AsyncIterator[str]:
        """Stream agent response tokens."""
        ...
