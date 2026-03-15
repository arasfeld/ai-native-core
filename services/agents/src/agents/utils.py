"""Shared utilities for LangGraph agent implementations."""

from ai import Message
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage


def lc_to_messages(
    lc_messages: list[BaseMessage],
    system: str | None = None,
) -> list[Message]:
    """Convert LangChain BaseMessages to internal Message format.

    Optionally prepend a system message. All system messages (injected location
    context, episodic facts, base prompt) are merged into a single system
    message for maximum compatibility across LLM providers.
    """
    system_parts: list[str] = []
    if system:
        system_parts.append(system)

    other_messages: list[Message] = []
    for msg in lc_messages:
        if isinstance(msg, SystemMessage):
            system_parts.append(msg.content)
        elif isinstance(msg, HumanMessage):
            other_messages.append(Message(role="user", content=msg.content))
        elif isinstance(msg, AIMessage):
            other_messages.append(Message(role="assistant", content=msg.content))

    messages: list[Message] = []
    if system_parts:
        messages.append(Message(role="system", content="\n\n".join(system_parts)))
    messages.extend(other_messages)
    return messages
