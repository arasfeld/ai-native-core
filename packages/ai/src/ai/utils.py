"""Shared utilities for OpenAI-compatible providers."""

from .base import Message, Usage


def messages_to_dicts(messages: list[Message]) -> list[dict]:
    """Convert Message objects to OpenAI-compatible dict format."""
    return [{"role": m.role, "content": m.content} for m in messages]


def parse_openai_usage(response) -> Usage | None:
    """Parse usage metrics from an OpenAI-compatible chat completion response."""
    if not response.usage:
        return None
    return Usage(
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        total_tokens=response.usage.total_tokens,
    )
