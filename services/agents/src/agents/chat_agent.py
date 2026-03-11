import operator
from collections.abc import AsyncIterator
from typing import Annotated, Any, TypedDict

import structlog
from ai import BaseLLM, get_llm
from langchain_core.messages import AIMessage, BaseMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .base_agent import BaseAgent
from .utils import lc_to_messages

log = structlog.get_logger()


class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    session_id: str
    system_prompt: str


class ChatAgent(BaseAgent):
    """A simple conversational agent using LangGraph."""

    def __init__(self, llm: BaseLLM | None = None, system_prompt: str = "") -> None:
        self.llm = llm or get_llm()
        self.system_prompt = system_prompt
        self._graph = self.build_graph()

    def build_graph(self) -> CompiledStateGraph:
        graph = StateGraph(ChatState)
        graph.add_node("agent", self._agent_node)
        graph.set_entry_point("agent")
        graph.add_edge("agent", END)
        return graph.compile()

    async def _agent_node(self, state: ChatState) -> dict[str, Any]:
        system = state.get("system_prompt") or self.system_prompt
        messages = lc_to_messages(state["messages"], system=system or None)
        log.info(
            "chat_agent.invoke", session_id=state.get("session_id"), message_count=len(messages)
        )
        response = await self.llm.chat(messages)
        return {"messages": [AIMessage(content=response.content)]}

    async def run(self, input: dict[str, Any]) -> dict[str, Any]:
        return await self._graph.ainvoke(input)

    async def stream(self, input: dict[str, Any]) -> AsyncIterator[str]:
        system = input.get("system_prompt") or self.system_prompt
        messages = lc_to_messages(input.get("messages", []), system=system or None)
        async for token in self.llm.stream(messages):
            yield token


def build_chat_graph(llm: BaseLLM | None = None, system_prompt: str = "") -> ChatAgent:
    return ChatAgent(llm=llm, system_prompt=system_prompt)
