"""Tests for RetryLLM.

Verifies retry-on-transient, no-retry on permanent (4xx) errors, max-attempt
cap, exponential backoff schedule, and stream-only-before-first-chunk
semantics. Like ``test_failover.py``, these use lightweight fakes so no
provider SDK has to be importable.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from ai import LLMResponse, Message, RetryLLM, StreamEvent, Usage

# --------------------------------------------------------------------- helpers


class _RateLimitError(Exception):
    pass


_RateLimitError.__name__ = "RateLimitError"


class _APITimeoutError(Exception):
    pass


_APITimeoutError.__name__ = "APITimeoutError"


class _Status500(Exception):
    def __init__(self) -> None:
        super().__init__("bad gateway")
        self.status_code = 502


class _BadRequest(Exception):
    def __init__(self) -> None:
        super().__init__("bad request")
        self.status_code = 400


class FakeProvider:
    """Provider that fails its first ``fail_count`` calls then succeeds."""

    def __init__(
        self,
        *,
        fail_count: int = 0,
        exc_factory=_RateLimitError,
        stream_tokens: list[str] | None = None,
        stream_fail_after_first: bool = False,
        tool_support: bool = True,
    ) -> None:
        self.fail_count = fail_count
        self.exc_factory = exc_factory
        self.stream_tokens = stream_tokens or ["a", "b"]
        self.stream_fail_after_first = stream_fail_after_first
        self.tool_support = tool_support
        self.call_count = 0
        self.bound_tools: list | None = None

    def _maybe_fail(self) -> None:
        self.call_count += 1
        if self.call_count <= self.fail_count:
            raise self.exc_factory()

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        self._maybe_fail()
        return LLMResponse(content="ok")

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        self.call_count += 1
        if self.call_count <= self.fail_count and not self.stream_fail_after_first:
            raise self.exc_factory()
        for i, token in enumerate(self.stream_tokens):
            yield token
            if i == 0 and self.stream_fail_after_first and self.call_count <= self.fail_count:
                raise self.exc_factory()

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        self.call_count += 1
        if self.call_count <= self.fail_count:
            raise self.exc_factory()
        for token in self.stream_tokens:
            yield StreamEvent(type="token", content=token)
        yield StreamEvent(
            type="usage", usage=Usage(prompt_tokens=1, completion_tokens=2, total_tokens=3)
        )

    async def embed(self, text: str) -> list[float]:
        self._maybe_fail()
        return [0.1, 0.2]

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        self._maybe_fail()
        return "transcribed"

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        self.call_count += 1
        if self.call_count <= self.fail_count:
            raise self.exc_factory()
        yield b"chunk-1"
        yield b"chunk-2"

    def bind_tools(self, tools: list) -> FakeProvider:
        if not self.tool_support:
            raise NotImplementedError("no tools")
        clone = FakeProvider(fail_count=self.fail_count, exc_factory=self.exc_factory)
        clone.bound_tools = list(tools)
        return clone


class FakeSleep:
    """Records sleep durations without actually sleeping."""

    def __init__(self) -> None:
        self.calls: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


# --------------------------------------------------------------------- construction


def test_requires_positive_max_attempts() -> None:
    with pytest.raises(ValueError):
        RetryLLM(FakeProvider(), max_attempts=0)


# --------------------------------------------------------------------- chat


@pytest.mark.asyncio
class TestChatRetry:
    async def test_success_on_first_attempt(self) -> None:
        inner = FakeProvider()
        sleep = FakeSleep()
        llm = RetryLLM(inner, sleep=sleep)

        result = await llm.chat([Message(role="user", content="hi")])

        assert result.content == "ok"
        assert inner.call_count == 1
        assert sleep.calls == []

    async def test_retries_then_succeeds(self) -> None:
        inner = FakeProvider(fail_count=2)
        sleep = FakeSleep()
        llm = RetryLLM(inner, max_attempts=3, sleep=sleep)

        result = await llm.chat([Message(role="user", content="hi")])

        assert result.content == "ok"
        assert inner.call_count == 3
        assert len(sleep.calls) == 2  # two backoffs before the third try

    async def test_does_not_retry_on_permanent_error(self) -> None:
        inner = FakeProvider(fail_count=1, exc_factory=_BadRequest)
        sleep = FakeSleep()
        llm = RetryLLM(inner, max_attempts=3, sleep=sleep)

        with pytest.raises(_BadRequest):
            await llm.chat([Message(role="user", content="hi")])

        assert inner.call_count == 1
        assert sleep.calls == []

    async def test_caps_at_max_attempts(self) -> None:
        inner = FakeProvider(fail_count=10)  # always fails
        sleep = FakeSleep()
        llm = RetryLLM(inner, max_attempts=3, sleep=sleep)

        with pytest.raises(_RateLimitError):
            await llm.chat([Message(role="user", content="hi")])

        assert inner.call_count == 3
        # backoff slept twice (before attempts 2 and 3) — never after the final attempt
        assert len(sleep.calls) == 2


# --------------------------------------------------------------------- backoff schedule


@pytest.mark.asyncio
class TestBackoffSchedule:
    async def test_delays_grow_exponentially_without_jitter(self) -> None:
        inner = FakeProvider(fail_count=10)
        sleep = FakeSleep()
        llm = RetryLLM(
            inner,
            max_attempts=4,
            base_delay=0.5,
            max_delay=10.0,
            jitter=False,
            sleep=sleep,
        )

        with pytest.raises(_RateLimitError):
            await llm.chat([Message(role="user", content="hi")])

        # base * 2^attempt for attempts 0..2 (no sleep after the last failure)
        assert sleep.calls == [0.5, 1.0, 2.0]

    async def test_delays_are_capped_at_max_delay(self) -> None:
        inner = FakeProvider(fail_count=10)
        sleep = FakeSleep()
        llm = RetryLLM(
            inner,
            max_attempts=5,
            base_delay=1.0,
            max_delay=2.0,
            jitter=False,
            sleep=sleep,
        )

        with pytest.raises(_RateLimitError):
            await llm.chat([Message(role="user", content="hi")])

        # 1, 2 (capped), 2, 2
        assert sleep.calls == [1.0, 2.0, 2.0, 2.0]


# --------------------------------------------------------------------- streaming


@pytest.mark.asyncio
class TestStreamRetry:
    async def test_retries_before_first_chunk(self) -> None:
        inner = FakeProvider(fail_count=1, stream_tokens=["x", "y"])
        sleep = FakeSleep()
        llm = RetryLLM(inner, sleep=sleep)

        tokens = [t async for t in llm.stream([Message(role="user", content="hi")])]

        assert tokens == ["x", "y"]
        assert inner.call_count == 2

    async def test_does_not_retry_after_first_chunk(self) -> None:
        inner = FakeProvider(
            fail_count=1,
            stream_tokens=["partial"],
            stream_fail_after_first=True,
        )
        sleep = FakeSleep()
        llm = RetryLLM(inner, sleep=sleep)

        collected: list[Any] = []
        with pytest.raises(_RateLimitError):
            async for t in llm.stream([Message(role="user", content="hi")]):
                collected.append(t)

        assert collected == ["partial"]
        assert inner.call_count == 1  # no retry — first chunk already emitted

    async def test_stream_with_usage_retries(self) -> None:
        inner = FakeProvider(fail_count=1, stream_tokens=["x"])
        sleep = FakeSleep()
        llm = RetryLLM(inner, sleep=sleep)

        events = [e async for e in llm.stream_with_usage([Message(role="user", content="hi")])]
        token_contents = [e.content for e in events if e.type == "token"]
        usage_events = [e for e in events if e.type == "usage"]

        assert token_contents == ["x"]
        assert len(usage_events) == 1


# --------------------------------------------------------------------- embed / media


@pytest.mark.asyncio
class TestEmbedAndMedia:
    async def test_embed_retries(self) -> None:
        inner = FakeProvider(fail_count=1, exc_factory=_Status500)
        sleep = FakeSleep()
        llm = RetryLLM(inner, sleep=sleep)

        assert await llm.embed("hi") == [0.1, 0.2]
        assert inner.call_count == 2

    async def test_transcribe_retries(self) -> None:
        inner = FakeProvider(fail_count=2, exc_factory=_APITimeoutError)
        sleep = FakeSleep()
        llm = RetryLLM(inner, max_attempts=3, sleep=sleep)

        assert await llm.transcribe(b"audio") == "transcribed"
        assert inner.call_count == 3

    async def test_synthesize_retries_before_first_chunk(self) -> None:
        inner = FakeProvider(fail_count=1, exc_factory=_Status500)
        sleep = FakeSleep()
        llm = RetryLLM(inner, sleep=sleep)

        chunks = [c async for c in llm.synthesize("hi")]
        assert chunks == [b"chunk-1", b"chunk-2"]


# --------------------------------------------------------------------- bind_tools


class TestBindTools:
    def test_preserves_retry_wrapper(self) -> None:
        inner = FakeProvider()
        llm = RetryLLM(inner, max_attempts=5, base_delay=0.25, jitter=False)

        bound = llm.bind_tools(["t1"])

        assert isinstance(bound, RetryLLM)
        assert isinstance(bound.inner, FakeProvider)
        assert bound.inner.bound_tools == ["t1"]
        assert bound._max_attempts == 5
        assert bound._base_delay == 0.25

    def test_propagates_not_implemented(self) -> None:
        inner = FakeProvider(tool_support=False)
        llm = RetryLLM(inner)

        with pytest.raises(NotImplementedError):
            llm.bind_tools(["t1"])
