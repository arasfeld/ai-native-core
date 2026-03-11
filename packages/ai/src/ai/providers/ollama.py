import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..base import LLMResponse, Message
from ..utils import messages_to_dicts, parse_openai_usage


class OllamaProvider:
    """Ollama provider — local inference via OpenAI-compatible API."""

    def __init__(self) -> None:
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.client = AsyncOpenAI(
            api_key="ollama",  # Ollama doesn't require a real key
            base_url=f"{base_url}/v1",
        )
        self.model = os.environ.get("OLLAMA_MODEL", "llama3.2")
        self.embed_model = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            **kwargs,
        )
        return LLMResponse(
            content=response.choices[0].message.content or "",
            usage=parse_openai_usage(response),
            model=self.model,
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
