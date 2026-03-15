"""Unit tests for the prompt registry and template rendering."""

import pytest

from prompts import registry, render_prompt


def test_registry_lists_chat_prompt():
    assert "chat" in registry.list()


def test_registry_has_version_one():
    assert 1 in registry.versions("chat")


def test_latest_version_is_int():
    v = registry.latest_version("chat")
    assert isinstance(v, int)
    assert v >= 1


def test_render_basic_prompt():
    text = render_prompt("chat")
    assert len(text) > 0
    assert "assistant" in text.lower()


def test_render_with_user_name():
    text = render_prompt("chat", context={"user_name": "Alice"})
    assert "Alice" in text


def test_render_without_user_name_omits_greeting():
    text = render_prompt("chat")
    assert "You are speaking with" not in text


def test_render_with_rag_context():
    text = render_prompt("chat", context={"context": "The sky is blue."})
    assert "sky is blue" in text


def test_render_without_context_omits_context_block():
    text = render_prompt("chat")
    assert "<context>" not in text


def test_unknown_prompt_raises():
    with pytest.raises(Exception):
        render_prompt("nonexistent_prompt_xyz")


def test_render_latest_by_default():
    """Calling without version should render the latest version."""
    latest = registry.latest_version("chat")
    text_default = render_prompt("chat")
    text_explicit = render_prompt("chat", version=latest)
    assert text_default == text_explicit
