import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..base import LLMResponse, Message, StreamEvent, Usage
from ..utils import messages_to_dicts, parse_openai_usage


class OpenRouterProvider:
    """OpenRouter provider — OpenAI-compatible API with access to many models."""

    provider_name = "openrouter"

    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url="https://openrouter.ai/api/v1",
        )
        self.model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")

    def bind_tools(self, tools: list) -> "OpenRouterProvider":
        raise NotImplementedError(
            "OpenRouterProvider does not support bind_tools. "
            "Use the OpenAI or Anthropic provider directly for tool calling."
        )

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            **kwargs,
        )
        usage = parse_openai_usage(response)
        if usage is not None:
            usage.provider = self.provider_name
            usage.model = response.model
        return LLMResponse(
            content=response.choices[0].message.content or "",
            usage=usage,
            model=response.model,
            provider=self.provider_name,
        )

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            stream=True,
            **kwargs,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        params = {**kwargs}
        stream_options = params.pop("stream_options", {}) or {}
        stream_options["include_usage"] = True

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            stream=True,
            stream_options=stream_options,
            **params,
        )
        async for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield StreamEvent(type="token", content=delta)
            if getattr(chunk, "usage", None):
                yield StreamEvent(
                    type="usage",
                    usage=Usage(
                        prompt_tokens=chunk.usage.prompt_tokens,
                        completion_tokens=chunk.usage.completion_tokens,
                        total_tokens=chunk.usage.total_tokens,
                        provider=self.provider_name,
                        model=getattr(chunk, "model", None) or self.model,
                    ),
                )

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError("Use LLM_PROVIDER=openai or LLM_PROVIDER=ollama for embeddings.")

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        raise NotImplementedError(
            "OpenRouter does not provide a transcription API. "
            "Use LLM_PROVIDER=openai for audio transcription."
        )

    async def synthesize(self, text: str, voice: str = "alloy") -> bytes:
        raise NotImplementedError(
            "OpenRouter does not provide a TTS API. Use LLM_PROVIDER=openai for text-to-speech."
        )
