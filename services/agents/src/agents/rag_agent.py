import operator
from collections.abc import AsyncIterator
from typing import Annotated, Any, TypedDict

import structlog
from ai import BaseLLM, get_llm
from langchain_core.messages import AIMessage, BaseMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph
from prompts import render_template

from .base_agent import BaseAgent
from .utils import lc_to_messages

log = structlog.get_logger()


class RAGState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    session_id: str
    context_chunks: list[str]  # Retrieved document chunks injected by the router


class RAGAgent(BaseAgent):
    """A RAG-augmented conversational agent."""

    def __init__(self, llm: BaseLLM | None = None) -> None:
        self.llm = llm or get_llm()
        self._graph = self.build_graph()

    def build_graph(self) -> CompiledStateGraph:
        graph = StateGraph(RAGState)
        graph.add_node("agent", self._agent_node)
        graph.set_entry_point("agent")
        graph.add_edge("agent", END)
        return graph.compile()

    def _build_system_prompt(self, chunks: list[str]) -> str:
        context = "\n\n---\n\n".join(chunks) if chunks else ""
        return render_template("chat.j2", {"context": context})

    async def _agent_node(self, state: RAGState) -> dict[str, Any]:
        system = self._build_system_prompt(state.get("context_chunks", []))
        messages = lc_to_messages(state["messages"], system=system)
        log.info(
            "rag_agent.invoke",
            session_id=state.get("session_id"),
            chunks=len(state.get("context_chunks", [])),
        )
        response = await self.llm.chat(messages)
        return {"messages": [AIMessage(content=response.content)]}

    async def run(self, input: dict[str, Any]) -> dict[str, Any]:
        return await self._graph.ainvoke(input)

    async def stream(self, input: dict[str, Any]) -> AsyncIterator[str]:
        system = self._build_system_prompt(input.get("context_chunks", []))
        messages = lc_to_messages(input.get("messages", []), system=system)
        async for token in self.llm.stream(messages):
            yield token


def build_rag_graph(llm: BaseLLM | None = None) -> RAGAgent:
    return RAGAgent(llm=llm)
