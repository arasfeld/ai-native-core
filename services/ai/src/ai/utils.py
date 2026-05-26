"""Shared utilities for OpenAI-compatible providers."""

import json

from .base import Message, Usage


def messages_to_dicts(messages: list[Message] | list[dict]) -> list[dict]:
    """Convert Message objects to OpenAI-compatible dict format.

    Handles tool call messages (assistant with tool_calls) and tool result
    messages (role="tool") in OpenAI wire format.
    """
    result = []
    for m in messages:
        if isinstance(m, dict):
            result.append(m)
            continue

        d: dict = {"role": m.role}

        # Content: can be None for pure tool-call messages from assistant
        if m.content or not m.tool_calls:
            d["content"] = m.content
        else:
            d["content"] = None

        # Assistant tool calls → OpenAI function format
        if m.tool_calls:
            d["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["args"]),
                    },
                }
                for tc in m.tool_calls
            ]

        # Tool result message fields
        if m.tool_call_id:
            d["tool_call_id"] = m.tool_call_id
        if m.name:
            d["name"] = m.name

        result.append(d)
    return result


def parse_openai_usage(response) -> Usage | None:
    """Parse usage metrics from an OpenAI-compatible chat completion response."""
    if not response.usage:
        return None
    return Usage(
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        total_tokens=response.usage.total_tokens,
    )
