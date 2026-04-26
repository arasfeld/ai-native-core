"""Agent Factory — builds the appropriate LangGraph agent for each request."""
from __future__ import annotations

from agents import build_chat_graph, build_rag_graph
from ai import create_llm, get_llm
from rag import PgVectorRetriever
from tools import registry


class AgentFactory:
    """Builds the right agent for the request type.

    Centralises agent construction so the chat service doesn't need to know
    which agent class or provider to use.
    """

    def __init__(
        self,
        retriever: PgVectorRetriever,
        ai_config: dict | None = None,
    ) -> None:
        self._retriever = retriever
        self._ai_config = ai_config or {}

    def _get_llm(self, feature: str):
        cfg = self._ai_config.get(feature)
        if cfg and cfg.get("enabled", True):
            return create_llm(provider=cfg.get("provider"), model=cfg.get("model"))
        return get_llm()  # fallback to singleton

    def build(self, use_rag: bool = False, system_prompt: str = ""):
        """Return a ready-to-stream agent."""
        if use_rag:
            return build_rag_graph(llm=self._get_llm("rag"))
        tools = registry.get_all()
        return build_chat_graph(
            llm=self._get_llm("chat"), system_prompt=system_prompt, tools=tools
        )
