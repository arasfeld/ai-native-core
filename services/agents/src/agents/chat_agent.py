import operator
from collections.abc import AsyncIterator
from typing import Annotated, Any, TypedDict

import structlog
from ai import BaseLLM, get_llm
from ai.base import Message
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
    """Conversational agent with optional tool-calling support."""

    def __init__(
        self,
        llm: BaseLLM | None = None,
        system_prompt: str = "",
        tools: list | None = None,
    ) -> None:
        self.llm = llm or get_llm()
        self.system_prompt = system_prompt
        self._tools = tools or []
        self._tool_map = {t.name: t for t in self._tools}

        # Bind tools to the LLM if tools are provided and provider supports it
        if self._tools:
            try:
                self._llm_with_tools = self.llm.bind_tools(self._tools)
            except NotImplementedError:
                log.warning(
                    "chat_agent.bind_tools_unsupported",
                    provider=type(self.llm).__name__,
                )
                self._llm_with_tools = self.llm
                self._tools = []  # disable tool loop
                self._tool_map = {}
        else:
            self._llm_with_tools = self.llm

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
        response = await self._llm_with_tools.chat(messages)
        return {"messages": [AIMessage(content=response.content)]}

    async def run(self, input: dict[str, Any]) -> dict[str, Any]:
        return await self._graph.ainvoke(input)

    async def stream(self, input: dict[str, Any]) -> AsyncIterator[str]:
        system = input.get("system_prompt") or self.system_prompt
        messages = lc_to_messages(input.get("messages", []), system=system or None)

        if not self._tools:
            # Simple path: stream directly without tool loop
            async for token in self.llm.stream(messages):
                yield token
            return

        # Tool-calling path: loop until no more tool calls, then yield final answer
        while True:
            response = await self._llm_with_tools.chat(messages)

            if not response.tool_calls:
                # Final answer — yield content
                if response.content:
                    yield response.content
                break

            log.info(
                "chat_agent.tool_calls",
                tools=[tc["name"] for tc in response.tool_calls],
            )

            # Add assistant's tool-call message to history
            messages.append(
                Message(
                    role="assistant",
                    content=response.content or "",
                    tool_calls=response.tool_calls,
                )
            )

            # Execute each tool and add results
            for tc in response.tool_calls:
                tool_fn = self._tool_map.get(tc["name"])
                if tool_fn is not None:
                    try:
                        result = str(await tool_fn.arun(tc["args"]))
                    except Exception as exc:
                        result = f"Error executing {tc['name']}: {exc}"
                        log.warning("chat_agent.tool_error", tool=tc["name"], error=str(exc))
                else:
                    result = f"Error: unknown tool '{tc['name']}'"

                messages.append(
                    Message(
                        role="tool",
                        content=result,
                        tool_call_id=tc["id"],
                        name=tc["name"],
                    )
                )


def build_chat_graph(
    llm: BaseLLM | None = None,
    system_prompt: str = "",
    tools: list | None = None,
) -> ChatAgent:
    return ChatAgent(llm=llm, system_prompt=system_prompt, tools=tools)
