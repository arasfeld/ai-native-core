from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class Message(BaseModel):
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str
    tool_call_id: str | None = None
    name: str | None = None


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    content: str
    usage: Usage | None = None
    model: str | None = None


@runtime_checkable
class BaseLLM(Protocol):
    """Protocol defining the interface for all LLM providers."""

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        """Send messages and return a complete response."""
        ...

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        """Send messages and stream response tokens."""
        ...

    async def embed(self, text: str) -> list[float]:
        """Embed text and return a vector."""
        ...
