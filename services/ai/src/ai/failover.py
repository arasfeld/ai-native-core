"""Provider failover wrapper.

Wraps a primary :class:`BaseLLM` and an ordered list of fallbacks. When the
primary raises a transient error (5xx, timeout, connection drop, rate limit)
the wrapper retries the same call against the next provider in the chain.

Streaming behaviour: failover only kicks in *before any tokens have been
yielded*. Once the user has started seeing output, switching providers would
produce duplicate content, so any later transient error bubbles up.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import structlog

from .base import BaseLLM, LLMResponse, Message, StreamEvent

log = structlog.get_logger(__name__)

_TRANSIENT_CLASS_NAMES = frozenset(
    {
        # OpenAI SDK
        "APITimeoutError",
        "APIConnectionError",
        "RateLimitError",
        "InternalServerError",
        # httpx / asyncio
        "TimeoutException",
        "ConnectError",
        "ConnectTimeout",
        "ReadTimeout",
        "WriteTimeout",
        "RemoteProtocolError",
        "TimeoutError",
    }
)


def is_transient_error(exc: BaseException) -> bool:
    """Return True if ``exc`` looks like a retryable provider error.

    Detection is by exception class name so we don't have to import every
    provider SDK. Anthropic and OpenAI both name their transient errors
    consistently (``APITimeoutError``, ``RateLimitError``, ...), and httpx
    follows the same convention.

    HTTP status-based detection: also treats any error exposing
    ``status_code >= 500`` as transient (covers OpenAI's ``APIStatusError``).
    """
    if isinstance(exc, asyncio.TimeoutError | TimeoutError):
        return True
    name = type(exc).__name__
    if name in _TRANSIENT_CLASS_NAMES:
        return True
    status = getattr(exc, "status_code", None)
    return bool(isinstance(status, int) and status >= 500)


class FailoverLLM:
    """BaseLLM-compatible wrapper that tries primary then fallbacks.

    The wrapper preserves the BaseLLM protocol — callers don't know they're
    talking to a chain. Tools bound via :meth:`bind_tools` are propagated to
    every provider that supports tool calling; providers that raise
    :class:`NotImplementedError` for ``bind_tools`` are dropped from the
    chain for the tool-bound copy only.
    """

    def __init__(self, primary: BaseLLM, fallbacks: list[BaseLLM]) -> None:
        if not fallbacks:
            raise ValueError("FailoverLLM requires at least one fallback provider")
        self._providers: list[BaseLLM] = [primary, *fallbacks]

    @property
    def providers(self) -> list[BaseLLM]:
        return list(self._providers)

    # ------------------------------------------------------------------ utils

    def _log_failover(self, method: str, idx: int, exc: BaseException) -> None:
        log.warning(
            "ai.failover.transient_error",
            method=method,
            failed_provider=type(self._providers[idx]).__name__,
            next_provider=(
                type(self._providers[idx + 1]).__name__ if idx + 1 < len(self._providers) else None
            ),
            error_class=type(exc).__name__,
            error=str(exc),
        )

    async def _call_with_failover(self, method: str, *args, **kwargs) -> Any:
        last_exc: BaseException | None = None
        for idx, provider in enumerate(self._providers):
            try:
                return await getattr(provider, method)(*args, **kwargs)
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                last_exc = exc
                self._log_failover(method, idx, exc)
                continue
        assert last_exc is not None
        raise last_exc

    # ------------------------------------------------------------------ chat

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        return await self._call_with_failover("chat", messages, **kwargs)

    # ------------------------------------------------------------------ stream

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        last_exc: BaseException | None = None
        for idx, provider in enumerate(self._providers):
            iterator = provider.stream(messages, **kwargs).__aiter__()
            try:
                first = await iterator.__anext__()
            except StopAsyncIteration:
                return
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                last_exc = exc
                self._log_failover("stream", idx, exc)
                continue
            yield first
            async for token in iterator:
                yield token
            return
        assert last_exc is not None
        raise last_exc

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        last_exc: BaseException | None = None
        for idx, provider in enumerate(self._providers):
            iterator = provider.stream_with_usage(messages, **kwargs).__aiter__()
            try:
                first = await iterator.__anext__()
            except StopAsyncIteration:
                return
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                last_exc = exc
                self._log_failover("stream_with_usage", idx, exc)
                continue
            yield first
            async for event in iterator:
                yield event
            return
        assert last_exc is not None
        raise last_exc

    # ------------------------------------------------------------------ embed / media

    async def embed(self, text: str) -> list[float]:
        return await self._call_with_failover("embed", text)

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        return await self._call_with_failover("transcribe", audio, filename=filename)

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        # synthesize is also a stream — same first-chunk failover policy as stream().
        last_exc: BaseException | None = None
        for idx, provider in enumerate(self._providers):
            iterator = provider.synthesize(text, voice=voice).__aiter__()
            try:
                first = await iterator.__anext__()
            except StopAsyncIteration:
                return
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                last_exc = exc
                self._log_failover("synthesize", idx, exc)
                continue
            yield first
            async for chunk in iterator:
                yield chunk
            return
        assert last_exc is not None
        raise last_exc

    # ------------------------------------------------------------------ tools

    def bind_tools(self, tools: list) -> BaseLLM:
        """Bind tools to every provider that supports it; drop the ones that don't.

        Returns a wrapper whose chain contains only tool-capable providers.
        If only one provider in the chain supports tool calling, returns that
        provider directly (no failover possible). Raises
        :class:`NotImplementedError` if none of them do.
        """
        bound: list[BaseLLM] = []
        for provider in self._providers:
            try:
                bound.append(provider.bind_tools(tools))
            except NotImplementedError:
                continue
        if not bound:
            raise NotImplementedError("No provider in the failover chain supports bind_tools().")
        if len(bound) == 1:
            return bound[0]
        return FailoverLLM(bound[0], bound[1:])
