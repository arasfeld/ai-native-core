import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..base import LLMResponse, Message
from ..utils import messages_to_dicts, parse_openai_usage


class OpenRouterProvider:
    """OpenRouter provider — OpenAI-compatible API with access to many models."""

    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url="https://openrouter.ai/api/v1",
        )
        self.model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            **kwargs,
        )
        return LLMResponse(
            content=response.choices[0].message.content or "",
            usage=parse_openai_usage(response),
            model=response.model,
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

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError("Use LLM_PROVIDER=openai or LLM_PROVIDER=ollama for embeddings.")
