import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..base import LLMResponse, Message
from ..utils import messages_to_dicts, parse_openai_usage


class OpenAIProvider:
    """OpenAI LLM provider."""

    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self.embed_model = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")

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
        response = await self.client.embeddings.create(
            model=self.embed_model,
            input=text,
        )
        return response.data[0].embedding
