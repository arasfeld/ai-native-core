"""Shared utilities for LangGraph agent implementations."""

from ai import Message
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage


def lc_to_messages(
    lc_messages: list[BaseMessage],
    system: str | None = None,
) -> list[Message]:
    """Convert LangChain BaseMessages to internal Message format.

    Optionally prepend a system message. SystemMessage objects in the list
    (e.g. injected location context or episodic memory facts) are preserved.
    """
    messages: list[Message] = []
    if system:
        messages.append(Message(role="system", content=system))
    for msg in lc_messages:
        if isinstance(msg, SystemMessage):
            messages.append(Message(role="system", content=msg.content))
        elif isinstance(msg, HumanMessage):
            # HumanMessage content can be a string or a list of dicts (for images)
            messages.append(Message(role="user", content=msg.content))
        elif isinstance(msg, AIMessage):
            messages.append(Message(role="assistant", content=msg.content))
    return messages
