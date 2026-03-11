"""Summary compressor — reduces long conversation history via LLM summarization."""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

if TYPE_CHECKING:
    from ai.base import BaseLLM, Message

log = structlog.get_logger()

_SUMMARY_PROMPT = """\
Summarize the following conversation history concisely. Preserve key facts, \
decisions, and context that would be needed to continue the conversation naturally.

Conversation:
{history}

Summary:"""


class SummaryCompressor:
    """Compresses long conversation history using LLM summarization.

    When the message count exceeds ``max_messages``, all messages except the
    most recent ``keep_recent`` are summarized into a single ``SystemMessage``
    prefix.  The full recent tail is kept verbatim so the model has precise
    short-term context.

    Usage::

        compressor = SummaryCompressor(llm, max_messages=20, keep_recent=10)
        messages = await compressor.compress(messages)
    """

    def __init__(
        self,
        llm: BaseLLM,
        max_messages: int = 20,
        keep_recent: int = 10,
    ) -> None:
        self.llm = llm
        self.max_messages = max_messages
        self.keep_recent = keep_recent

    async def compress(self, messages: list[BaseMessage]) -> list[BaseMessage]:
        """Return messages, summarizing the older portion if needed."""
        if len(messages) <= self.max_messages:
            return messages

        to_summarize = messages[: -self.keep_recent]
        recent = messages[-self.keep_recent :]

        history_text = "\n".join(
            f"{_role_label(msg)}: {msg.content}" for msg in to_summarize
        )
        prompt = _SUMMARY_PROMPT.format(history=history_text)

        summary_msgs: list[Message] = [{"role": "user", "content": prompt}]
        response = await self.llm.chat(summary_msgs)

        log.info(
            "memory.compress",
            summarized=len(to_summarize),
            kept=len(recent),
        )
        return [
            SystemMessage(content=f"Earlier conversation summary:\n{response.content}"),
            *recent,
        ]


def _role_label(msg: BaseMessage) -> str:
    if isinstance(msg, HumanMessage):
        return "User"
    if isinstance(msg, AIMessage):
        return "Assistant"
    return "System"
