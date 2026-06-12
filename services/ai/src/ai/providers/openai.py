import copy
import io
import json
import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..base import LLMResponse, Message, StreamEvent, Usage
from ..utils import messages_to_dicts, parse_openai_usage


class OpenAIProvider:
    """OpenAI LLM provider."""

    provider_name = "openai"

    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self.embed_model = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")
        self.transcribe_model = os.environ.get("OPENAI_TRANSCRIBE_MODEL", "whisper-1")
        self.tts_model = os.environ.get("OPENAI_TTS_MODEL", "tts-1")
        self.image_model = os.environ.get("OPENAI_IMAGE_MODEL", "dall-e-3")
        self._openai_tools: list[dict] | None = None

    def bind_tools(self, tools: list) -> "OpenAIProvider":
        """Return a copy of this provider with OpenAI function-calling tools bound."""
        clone = copy.copy(self)
        clone._openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": (
                        t.args_schema.model_json_schema()
                        if t.args_schema
                        else {"type": "object", "properties": {}}
                    ),
                },
            }
            for t in tools
        ]
        return clone

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        params = {**kwargs}
        if self._openai_tools:
            params["tools"] = self._openai_tools

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            **params,
        )
        msg = response.choices[0].message

        tool_calls = None
        if msg.tool_calls:
            tool_calls = [
                {
                    "name": tc.function.name,
                    "args": json.loads(tc.function.arguments),
                    "id": tc.id,
                }
                for tc in msg.tool_calls
            ]

        usage = parse_openai_usage(response)
        if usage is not None:
            usage.provider = self.provider_name
            usage.model = response.model
        return LLMResponse(
            content=msg.content or "",
            usage=usage,
            model=response.model,
            provider=self.provider_name,
            tool_calls=tool_calls,
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
        response = await self.client.embeddings.create(
            model=self.embed_model,
            input=text,
        )
        return response.data[0].embedding

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        """Transcribe audio bytes to text using Whisper."""
        audio_file = io.BytesIO(audio)
        audio_file.name = filename
        transcript = await self.client.audio.transcriptions.create(
            model=self.transcribe_model,
            file=audio_file,
        )
        return transcript.text

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        """Stream TTS audio bytes using OpenAI TTS."""
        async with self.client.audio.speech.with_streaming_response.create(
            model=self.tts_model,
            voice=voice,
            input=text,
            response_format="mp3",
        ) as response:
            async for chunk in response.iter_bytes(chunk_size=4096):
                yield chunk

    async def generate_image(self, prompt: str, size: str = "1024x1024") -> str:
        """Generate an image using DALL-E and return the URL."""
        response = await self.client.images.generate(
            model=self.image_model,
            prompt=prompt,
            size=size,
            n=1,
        )
        return response.data[0].url
