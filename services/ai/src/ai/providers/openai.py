import io
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
        self.transcribe_model = os.environ.get("OPENAI_TRANSCRIBE_MODEL", "whisper-1")
        self.tts_model = os.environ.get("OPENAI_TTS_MODEL", "tts-1")
        self.image_model = os.environ.get("OPENAI_IMAGE_MODEL", "dall-e-3")

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
