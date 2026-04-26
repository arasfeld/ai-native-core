"""Agent Factory — builds the appropriate LangGraph agent for each request."""
from __future__ import annotations

from agents import build_chat_graph, build_rag_graph
from ai import get_llm
from rag import PgVectorRetriever
from tools import registry


class AgentFactory:
    """Builds the right agent for the request type.

    Centralises agent construction so the chat service doesn't need to know
    which agent class or provider to use.
    """

    def __init__(self, retriever: PgVectorRetriever) -> None:
        self._retriever = retriever

    def build(self, use_rag: bool = False, system_prompt: str = ""):
        """Return a ready-to-stream agent."""
        if use_rag:
            return build_rag_graph(llm=get_llm())
        tools = registry.get_all()
        return build_chat_graph(llm=get_llm(), system_prompt=system_prompt, tools=tools)
