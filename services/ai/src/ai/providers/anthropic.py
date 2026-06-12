import copy
import os
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from ..base import LLMResponse, Message, StreamEvent, Usage


class AnthropicProvider:
    """Anthropic Claude LLM provider."""

    provider_name = "anthropic"

    def __init__(self) -> None:
        self.client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self.model = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
        self.max_tokens = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "4096"))
        self._anthropic_tools: list[dict] | None = None

    def bind_tools(self, tools: list) -> "AnthropicProvider":
        """Return a copy with Anthropic tool_use schema bound."""
        clone = copy.copy(self)
        clone._anthropic_tools = [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": (
                    t.args_schema.model_json_schema() if t.args_schema else {"type": "object"}
                ),
            }
            for t in tools
        ]
        return clone

    def _split_messages(self, messages: list[Message]) -> tuple[str | None, list[dict]]:
        """Anthropic separates system prompt from user/assistant turns.

        Also converts tool call / tool result messages to Anthropic format.
        """
        system_parts = []
        turns = []
        pending_tool_results: list[dict] = []

        for m in messages:
            if m.role == "system":
                system_parts.append(m.content)
                continue

            if m.role == "tool":
                # Accumulate tool results to batch into a user message
                pending_tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": m.tool_call_id,
                        "content": m.content,
                    }
                )
                continue

            # Flush pending tool results as a user message before next assistant turn
            if pending_tool_results:
                turns.append({"role": "user", "content": pending_tool_results})
                pending_tool_results = []

            if m.tool_calls:
                # Assistant message with tool use blocks
                blocks: list[dict] = []
                if m.content:
                    blocks.append({"type": "text", "text": m.content})
                for tc in m.tool_calls:
                    blocks.append(
                        {
                            "type": "tool_use",
                            "id": tc["id"],
                            "name": tc["name"],
                            "input": tc["args"],
                        }
                    )
                turns.append({"role": m.role, "content": blocks})
            elif isinstance(m.content, list):
                turns.append(
                    {"role": m.role, "content": [self._convert_part(p) for p in m.content]}
                )
            else:
                turns.append({"role": m.role, "content": m.content})

        if pending_tool_results:
            turns.append({"role": "user", "content": pending_tool_results})

        system = "\n\n".join(system_parts) if system_parts else None
        return system, turns

    def _convert_part(self, part: dict) -> dict:
        """Convert OpenAI content part format to Anthropic format."""
        if part.get("type") == "image_url":
            url = part["image_url"]["url"]
            if url.startswith("data:"):
                try:
                    media_type, data = url.split(";base64,")
                    media_type = media_type.replace("data:", "")
                    return {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        },
                    }
                except Exception:
                    pass
            elif url.startswith("http://") or url.startswith("https://"):
                return {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": url,
                    },
                }
        return part

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        system, turns = self._split_messages(messages)
        params = {**kwargs}
        if self._anthropic_tools:
            params["tools"] = self._anthropic_tools

        create_kwargs = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": turns,
            **params,
        }
        if system:
            create_kwargs["system"] = system

        response = await self.client.messages.create(**create_kwargs)

        text_content = ""
        tool_calls = None
        for block in response.content:
            if block.type == "text":
                text_content += block.text
            elif block.type == "tool_use":
                if tool_calls is None:
                    tool_calls = []
                tool_calls.append(
                    {
                        "name": block.name,
                        "args": block.input,
                        "id": block.id,
                    }
                )

        usage = None
        if response.usage:
            usage = Usage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
                provider=self.provider_name,
                model=response.model,
            )

        return LLMResponse(
            content=text_content,
            usage=usage,
            model=response.model,
            provider=self.provider_name,
            tool_calls=tool_calls,
        )

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        system, turns = self._split_messages(messages)
        stream_kwargs: dict = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": turns,
            **kwargs,
        }
        if system:
            stream_kwargs["system"] = system

        async with self.client.messages.stream(**stream_kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        system, turns = self._split_messages(messages)
        stream_kwargs: dict = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": turns,
            **kwargs,
        }
        if system:
            stream_kwargs["system"] = system

        async with self.client.messages.stream(**stream_kwargs) as stream:
            async for text in stream.text_stream:
                yield StreamEvent(type="token", content=text)
            final = await stream.get_final_message()
            if final.usage:
                yield StreamEvent(
                    type="usage",
                    usage=Usage(
                        prompt_tokens=final.usage.input_tokens,
                        completion_tokens=final.usage.output_tokens,
                        total_tokens=final.usage.input_tokens + final.usage.output_tokens,
                        provider=self.provider_name,
                        model=getattr(final, "model", None) or self.model,
                    ),
                )

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError(
            "Anthropic does not provide an embedding API. "
            "Use LLM_PROVIDER=openai or LLM_PROVIDER=ollama for embeddings."
        )

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        raise NotImplementedError(
            "Anthropic does not provide a transcription API. "
            "Use LLM_PROVIDER=openai for audio transcription."
        )

    async def synthesize(self, text: str, voice: str = "alloy") -> bytes:
        raise NotImplementedError(
            "Anthropic does not provide a TTS API. Use LLM_PROVIDER=openai for text-to-speech."
        )
