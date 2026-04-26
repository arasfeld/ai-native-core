from collections.abc import AsyncIterator
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel


class Message(BaseModel):
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str | list[dict[str, Any]]
    tool_call_id: str | None = None  # for role="tool" messages
    name: str | None = None           # tool name for role="tool" messages
    tool_calls: list[dict[str, Any]] | None = None  # for role="assistant" with tool calls


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    content: str
    usage: Usage | None = None
    model: str | None = None
    tool_calls: list[dict[str, Any]] | None = None  # populated when LLM requests tool calls


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

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        """Transcribe audio bytes to text. Raises NotImplementedError if unsupported."""
        ...

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        """Stream TTS audio bytes. Raises NotImplementedError if unsupported."""
        ...

    def bind_tools(self, tools: list) -> "BaseLLM":
        """Return a copy of this provider with tools bound for function calling.

        Raises NotImplementedError for providers that don't support tool calling.
        Each tool in the list must be a langchain_core.tools.BaseTool instance.
        """
        ...
