from collections.abc import AsyncIterator
from typing import Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel


class Message(BaseModel):
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str | list[dict[str, Any]]
    tool_call_id: str | None = None  # for role="tool" messages
    name: str | None = None  # tool name for role="tool" messages
    tool_calls: list[dict[str, Any]] | None = None  # for role="assistant" with tool calls


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    # Provider that produced this usage (e.g. "openai", "anthropic"). Set by
    # the provider implementation so cost can be computed from session_token_usage
    # without re-deriving which backend actually answered.
    provider: str | None = None
    # Model identifier as returned by the provider (e.g. "gpt-4o-mini",
    # "claude-haiku-4-5-20251001"). Joined with ``provider`` against the
    # ``model_pricing`` table at recording time.
    model: str | None = None


class LLMResponse(BaseModel):
    content: str
    usage: Usage | None = None
    model: str | None = None
    provider: str | None = None
    tool_calls: list[dict[str, Any]] | None = None  # populated when LLM requests tool calls


class StreamEvent(BaseModel):
    """A single event emitted from stream_with_usage().

    Most events are ``type="token"`` carrying a content delta. A final
    ``type="usage"`` event carries the total token usage for the call, when
    the provider exposes it (OpenAI/OpenRouter via ``stream_options.include_usage``,
    Anthropic via ``message_delta``). Providers that don't expose usage
    (Ollama) simply don't emit a usage event — callers should fall back to
    a token estimate in that case.
    """

    type: Literal["token", "usage"]
    content: str | None = None
    usage: Usage | None = None


@runtime_checkable
class BaseLLM(Protocol):
    """Protocol defining the interface for all LLM providers."""

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        """Send messages and return a complete response."""
        ...

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        """Send messages and stream response tokens."""
        ...

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        """Stream tokens and emit a final usage event.

        Yields ``StreamEvent(type="token", content=...)`` for each token, then
        optionally a final ``StreamEvent(type="usage", usage=...)`` if the
        provider exposes streamed usage.
        """
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
