"""Shared utilities for LangGraph agent implementations."""

from ai import Message
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage


def lc_to_messages(
    lc_messages: list[BaseMessage],
    system: str | None = None,
) -> list[Message]:
    """Convert LangChain BaseMessages to internal Message format.

    Optionally prepend a system message.
    """
    messages: list[Message] = []
    if system:
        messages.append(Message(role="system", content=system))
    for msg in lc_messages:
        if isinstance(msg, HumanMessage):
            messages.append(Message(role="user", content=str(msg.content)))
        elif isinstance(msg, AIMessage):
            messages.append(Message(role="assistant", content=str(msg.content)))
    return messages
