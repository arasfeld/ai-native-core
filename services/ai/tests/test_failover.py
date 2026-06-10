"""Tests for FailoverLLM and is_transient_error.

These tests use lightweight fake providers — no SDK imports, no network — so
they can verify the wrapper's contract without depending on OpenAI/Anthropic
clients being importable in CI.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from ai import FailoverLLM, LLMResponse, Message, StreamEvent, Usage, is_transient_error

# --------------------------------------------------------------------- helpers


class _FakeRateLimitError(Exception):
    """Mimics openai.RateLimitError by name."""


_FakeRateLimitError.__name__ = "RateLimitError"


class _FakeAPITimeoutError(Exception):
    pass


_FakeAPITimeoutError.__name__ = "APITimeoutError"


class _FakeStatus500(Exception):
    def __init__(self) -> None:
        super().__init__("bad gateway")
        self.status_code = 502


class _FakeBadRequest(Exception):
    def __init__(self) -> None:
        super().__init__("bad request")
        self.status_code = 400


class FakeProvider:
    """Minimal BaseLLM-compatible fake."""

    def __init__(
        self,
        name: str,
        *,
        chat_response: LLMResponse | None = None,
        chat_error: Exception | None = None,
        stream_tokens: list[str] | None = None,
        stream_error: Exception | None = None,
        stream_error_after_first: bool = False,
        tool_support: bool = True,
    ) -> None:
        self.name = name
        self.chat_response = chat_response or LLMResponse(content=f"{name}-response")
        self.chat_error = chat_error
        self.stream_tokens = stream_tokens or [f"{name}-token-1", f"{name}-token-2"]
        self.stream_error = stream_error
        self.stream_error_after_first = stream_error_after_first
        self.tool_support = tool_support
        self.calls: list[str] = []
        self.bound_tools: list | None = None

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        self.calls.append("chat")
        if self.chat_error:
            raise self.chat_error
        return self.chat_response

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        self.calls.append("stream")
        if self.stream_error and not self.stream_error_after_first:
            raise self.stream_error
        for i, token in enumerate(self.stream_tokens):
            yield token
            if i == 0 and self.stream_error and self.stream_error_after_first:
                raise self.stream_error

    async def stream_with_usage(
        self, messages: list[Message], **kwargs
    ) -> AsyncIterator[StreamEvent]:
        self.calls.append("stream_with_usage")
        if self.stream_error and not self.stream_error_after_first:
            raise self.stream_error
        for i, token in enumerate(self.stream_tokens):
            yield StreamEvent(type="token", content=token)
            if i == 0 and self.stream_error and self.stream_error_after_first:
                raise self.stream_error
        yield StreamEvent(
            type="usage", usage=Usage(prompt_tokens=1, completion_tokens=2, total_tokens=3)
        )

    async def embed(self, text: str) -> list[float]:
        self.calls.append("embed")
        if self.chat_error:
            raise self.chat_error
        return [0.1, 0.2, 0.3]

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        self.calls.append("transcribe")
        if self.chat_error:
            raise self.chat_error
        return f"{self.name}-transcript"

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        self.calls.append("synthesize")
        if self.stream_error and not self.stream_error_after_first:
            raise self.stream_error
        yield b"chunk-1"
        yield b"chunk-2"

    def bind_tools(self, tools: list) -> FakeProvider:
        if not self.tool_support:
            raise NotImplementedError(f"{self.name} doesn't support tools")
        clone = FakeProvider(self.name, chat_response=self.chat_response, tool_support=True)
        clone.bound_tools = list(tools)
        return clone


# --------------------------------------------------------------------- transient detection


class TestIsTransientError:
    def test_asyncio_timeout(self) -> None:
        assert is_transient_error(TimeoutError())

    def test_named_rate_limit(self) -> None:
        assert is_transient_error(_FakeRateLimitError())

    def test_named_api_timeout(self) -> None:
        assert is_transient_error(_FakeAPITimeoutError())

    def test_5xx_status_code(self) -> None:
        assert is_transient_error(_FakeStatus500())

    def test_4xx_status_code_is_not_transient(self) -> None:
        assert is_transient_error(_FakeBadRequest()) is False

    def test_plain_value_error_is_not_transient(self) -> None:
        assert is_transient_error(ValueError("nope")) is False


# --------------------------------------------------------------------- construction


def test_requires_at_least_one_fallback() -> None:
    with pytest.raises(ValueError):
        FailoverLLM(FakeProvider("primary"), [])


# --------------------------------------------------------------------- chat


@pytest.mark.asyncio
class TestChatFailover:
    async def test_primary_succeeds_no_fallback_call(self) -> None:
        primary = FakeProvider("primary")
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        result = await llm.chat([Message(role="user", content="hi")])

        assert result.content == "primary-response"
        assert primary.calls == ["chat"]
        assert fallback.calls == []

    async def test_falls_over_on_transient_error(self) -> None:
        primary = FakeProvider("primary", chat_error=_FakeRateLimitError())
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        result = await llm.chat([Message(role="user", content="hi")])

        assert result.content == "fallback-response"
        assert primary.calls == ["chat"]
        assert fallback.calls == ["chat"]

    async def test_does_not_fall_over_on_permanent_error(self) -> None:
        primary = FakeProvider("primary", chat_error=_FakeBadRequest())
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        with pytest.raises(_FakeBadRequest):
            await llm.chat([Message(role="user", content="hi")])

        assert fallback.calls == []

    async def test_walks_multiple_fallbacks(self) -> None:
        a = FakeProvider("a", chat_error=_FakeRateLimitError())
        b = FakeProvider("b", chat_error=_FakeStatus500())
        c = FakeProvider("c")
        llm = FailoverLLM(a, [b, c])

        result = await llm.chat([Message(role="user", content="hi")])

        assert result.content == "c-response"
        assert a.calls == b.calls == c.calls == ["chat"]

    async def test_raises_last_error_when_all_fail(self) -> None:
        a = FakeProvider("a", chat_error=_FakeRateLimitError())
        last = _FakeStatus500()
        b = FakeProvider("b", chat_error=last)
        llm = FailoverLLM(a, [b])

        with pytest.raises(_FakeStatus500):
            await llm.chat([Message(role="user", content="hi")])


# --------------------------------------------------------------------- streaming


@pytest.mark.asyncio
class TestStreamFailover:
    async def test_primary_streams_no_fallback(self) -> None:
        primary = FakeProvider("primary", stream_tokens=["a", "b"])
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        tokens = [t async for t in llm.stream([Message(role="user", content="hi")])]
        assert tokens == ["a", "b"]
        assert fallback.calls == []

    async def test_falls_over_when_primary_errors_before_first_token(self) -> None:
        primary = FakeProvider("primary", stream_error=_FakeRateLimitError())
        fallback = FakeProvider("fallback", stream_tokens=["fb-1", "fb-2"])
        llm = FailoverLLM(primary, [fallback])

        tokens = [t async for t in llm.stream([Message(role="user", content="hi")])]
        assert tokens == ["fb-1", "fb-2"]

    async def test_does_not_fall_over_after_first_token(self) -> None:
        """Once any token has been yielded, an error must bubble — we cannot
        retry without re-emitting the already-streamed prefix."""
        primary = FakeProvider(
            "primary",
            stream_tokens=["partial"],
            stream_error=_FakeRateLimitError(),
            stream_error_after_first=True,
        )
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        collected: list[Any] = []
        with pytest.raises(_FakeRateLimitError):
            async for t in llm.stream([Message(role="user", content="hi")]):
                collected.append(t)

        assert collected == ["partial"]
        assert fallback.calls == []

    async def test_stream_with_usage_failover(self) -> None:
        primary = FakeProvider("primary", stream_error=_FakeStatus500())
        fallback = FakeProvider("fallback", stream_tokens=["fb"])
        llm = FailoverLLM(primary, [fallback])

        events = [e async for e in llm.stream_with_usage([Message(role="user", content="hi")])]
        token_events = [e for e in events if e.type == "token"]
        usage_events = [e for e in events if e.type == "usage"]
        assert [e.content for e in token_events] == ["fb"]
        assert len(usage_events) == 1


# --------------------------------------------------------------------- embed / media


@pytest.mark.asyncio
class TestEmbedAndMedia:
    async def test_embed_failover(self) -> None:
        primary = FakeProvider("primary", chat_error=_FakeRateLimitError())
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        vec = await llm.embed("hello")
        assert vec == [0.1, 0.2, 0.3]
        assert fallback.calls == ["embed"]

    async def test_transcribe_failover(self) -> None:
        primary = FakeProvider("primary", chat_error=_FakeAPITimeoutError())
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        text = await llm.transcribe(b"audio")
        assert text == "fallback-transcript"

    async def test_synthesize_failover(self) -> None:
        primary = FakeProvider("primary", stream_error=_FakeStatus500())
        fallback = FakeProvider("fallback")
        llm = FailoverLLM(primary, [fallback])

        chunks = [c async for c in llm.synthesize("hi")]
        assert chunks == [b"chunk-1", b"chunk-2"]


# --------------------------------------------------------------------- bind_tools


class TestBindTools:
    def test_binds_to_every_supporting_provider(self) -> None:
        a = FakeProvider("a")
        b = FakeProvider("b")
        wrapper = FailoverLLM(a, [b])

        bound = wrapper.bind_tools(["tool1"])
        assert isinstance(bound, FailoverLLM)
        for p in bound.providers:
            assert isinstance(p, FakeProvider)
            assert p.bound_tools == ["tool1"]

    def test_drops_providers_that_dont_support_tools(self) -> None:
        a = FakeProvider("a", tool_support=False)
        b = FakeProvider("b")
        c = FakeProvider("c")
        wrapper = FailoverLLM(a, [b, c])

        bound = wrapper.bind_tools(["tool1"])
        assert isinstance(bound, FailoverLLM)
        names = [p.name for p in bound.providers if isinstance(p, FakeProvider)]
        assert names == ["b", "c"]

    def test_returns_lone_provider_directly_when_only_one_supports_tools(self) -> None:
        a = FakeProvider("a", tool_support=False)
        b = FakeProvider("b")
        wrapper = FailoverLLM(a, [b])

        bound = wrapper.bind_tools(["tool1"])
        assert isinstance(bound, FakeProvider)
        assert bound.name == "b"

    def test_raises_when_no_provider_supports_tools(self) -> None:
        a = FakeProvider("a", tool_support=False)
        b = FakeProvider("b", tool_support=False)
        wrapper = FailoverLLM(a, [b])

        with pytest.raises(NotImplementedError):
            wrapper.bind_tools(["tool1"])
