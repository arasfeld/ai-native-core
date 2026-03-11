import os
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from ..base import LLMResponse, Message, Usage


class AnthropicProvider:
    """Anthropic Claude LLM provider."""

    def __init__(self) -> None:
        self.client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self.model = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
        self.max_tokens = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "4096"))

    def _split_messages(self, messages: list[Message]) -> tuple[str | None, list[dict]]:
        """Anthropic separates system prompt from user/assistant turns."""
        system = None
        turns = []
        for m in messages:
            if m.role == "system":
                system = m.content
            else:
                turns.append({"role": m.role, "content": m.content})
        return system, turns

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        system, turns = self._split_messages(messages)
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system or "",
            messages=turns,
            **kwargs,
        )
        content = response.content[0].text if response.content else ""
        usage = Usage(
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            total_tokens=response.usage.input_tokens + response.usage.output_tokens,
        )
        return LLMResponse(content=content, usage=usage, model=response.model)

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        system, turns = self._split_messages(messages)
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system or "",
            messages=turns,
            **kwargs,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError(
            "Anthropic does not provide an embedding API. "
            "Use LLM_PROVIDER=openai or LLM_PROVIDER=ollama for embeddings."
        )
