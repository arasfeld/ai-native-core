"""Per-provider retry wrapper.

Wraps a single :class:`BaseLLM` and retries transient errors (5xx, timeout,
connection drop, rate limit — see :func:`is_transient_error`) with bounded
exponential backoff and optional jitter. Non-transient errors (4xx, content
policy, validation) bubble immediately so callers can surface them.

Composition with :class:`FailoverLLM`: ``RetryLLM`` is the inner wrapper. The
:class:`AgentFactory` wraps each provider in ``RetryLLM`` first, then assembles
the chain into ``FailoverLLM``. That way every provider exhausts its own retry
budget before failover hops to the next one, instead of one shared budget
spanning the whole chain.

Streaming behaviour: retry only kicks in *before any chunk has been yielded*.
Once output has started, a transient error has to bubble — re-running the call
would duplicate the already-streamed prefix.
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import AsyncIterator
from typing import Any

import structlog

from .base import BaseLLM, LLMResponse, Message, StreamEvent
from .failover import is_transient_error

log = structlog.get_logger(__name__)


_DEFAULT_MAX_ATTEMPTS = 3
_DEFAULT_BASE_DELAY = 0.5
_DEFAULT_MAX_DELAY = 8.0


class RetryLLM:
    """BaseLLM-compatible wrapper that retries the same provider on transient errors.

    Args:
        inner: The provider to wrap.
        max_attempts: Total attempts including the first. Must be >= 1.
        base_delay: Seconds to wait before the second attempt; doubles each retry.
        max_delay: Cap on backoff delay between attempts.
        jitter: When True, multiplies each delay by a random factor in [0.5, 1.5)
            to avoid retry storms when many callers hit the same upstream outage.
        sleep: Override for ``asyncio.sleep`` — tests inject a no-op so the suite
            doesn't actually wait through backoff windows.
    """

    def __init__(
        self,
        inner: BaseLLM,
        *,
        max_attempts: int = _DEFAULT_MAX_ATTEMPTS,
        base_delay: float = _DEFAULT_BASE_DELAY,
        max_delay: float = _DEFAULT_MAX_DELAY,
        jitter: bool = True,
        sleep=asyncio.sleep,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")
        self._inner = inner
        self._max_attempts = max_attempts
        self._base_delay = base_delay
        self._max_delay = max_delay
        self._jitter = jitter
        self._sleep = sleep

    @property
    def inner(self) -> BaseLLM:
        return self._inner

    # ------------------------------------------------------------------ utils

    def _delay_for(self, attempt: int) -> float:
        """Backoff delay before the (attempt+1)-th try. ``attempt`` is 0-indexed."""
        delay = min(self._base_delay * (2**attempt), self._max_delay)
        if self._jitter:
            delay *= 0.5 + random.random()
        return delay

    def _log_retry(self, method: str, attempt: int, exc: BaseException, delay: float) -> None:
        log.warning(
            "ai.retry.transient_error",
            method=method,
            provider=type(self._inner).__name__,
            attempt=attempt + 1,
            max_attempts=self._max_attempts,
            error_class=type(exc).__name__,
            error=str(exc),
            sleep_seconds=round(delay, 3),
        )

    async def _call_with_retry(self, method: str, *args, **kwargs) -> Any:
        last_exc: BaseException | None = None
        for attempt in range(self._max_attempts):
            try:
                return await getattr(self._inner, method)(*args, **kwargs)
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                last_exc = exc
                if attempt + 1 >= self._max_attempts:
                    break
                delay = self._delay_for(attempt)
                self._log_retry(method, attempt, exc, delay)
                await self._sleep(delay)
        assert last_exc is not None
        raise last_exc

    async def _stream_with_retry(self, method: str, *args, **kwargs) -> AsyncIterator[Any]:
        """Shared retry loop for ``stream``/``stream_with_usage``/``synthesize``.

        Only retries before the first chunk. Once the first item has been
        yielded downstream, any later error must bubble.
        """
        last_exc: BaseException | None = None
        for attempt in range(self._max_attempts):
            iterator = getattr(self._inner, method)(*args, **kwargs).__aiter__()
            try:
                first = await iterator.__anext__()
            except StopAsyncIteration:
                return
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                last_exc = exc
                if attempt + 1 >= self._max_attempts:
                    break
                delay = self._delay_for(attempt)
                self._log_retry(method, attempt, exc, delay)
                await self._sleep(delay)
                continue
            yield first
            async for item in iterator:
                yield item
            return
        assert last_exc is not None
        raise last_exc

    # ------------------------------------------------------------------ chat / embed / media

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        return await self._call_with_retry("chat", messages, **kwargs)

    async def embed(self, text: str) -> list[float]:
        return await self._call_with_retry("embed", text)

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        return await self._call_with_retry("transcribe", audio, filename=filename)

    # ------------------------------------------------------------------ streams

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        async for token in self._stream_with_retry("stream", messages, **kwargs):
            yield token

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        async for event in self._stream_with_retry("stream_with_usage", messages, **kwargs):
            yield event

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        async for chunk in self._stream_with_retry("synthesize", text, voice=voice):
            yield chunk

    # ------------------------------------------------------------------ tools

    def bind_tools(self, tools: list) -> BaseLLM:
        """Bind tools on the wrapped provider, preserving retry behaviour."""
        bound = self._inner.bind_tools(tools)
        return RetryLLM(
            bound,
            max_attempts=self._max_attempts,
            base_delay=self._base_delay,
            max_delay=self._max_delay,
            jitter=self._jitter,
            sleep=self._sleep,
        )
