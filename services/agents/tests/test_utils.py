"""Unit tests for lc_to_messages conversion utility."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from agents.utils import lc_to_messages
from ai import Message


def test_converts_human_message():
    msgs = lc_to_messages([HumanMessage(content="Hello")])
    assert len(msgs) == 1
    assert msgs[0].role == "user"
    assert msgs[0].content == "Hello"


def test_converts_ai_message():
    msgs = lc_to_messages([AIMessage(content="Hi there")])
    assert len(msgs) == 1
    assert msgs[0].role == "assistant"
    assert msgs[0].content == "Hi there"


def test_converts_system_message():
    msgs = lc_to_messages([SystemMessage(content="Be concise.")])
    assert len(msgs) == 1
    assert msgs[0].role == "system"
    assert "Be concise." in msgs[0].content


def test_merges_multiple_system_messages():
    msgs = lc_to_messages(
        [SystemMessage(content="Context A"), HumanMessage(content="Q")],
        system="Base prompt",
    )
    assert msgs[0].role == "system"
    assert "Base prompt" in msgs[0].content
    assert "Context A" in msgs[0].content
    assert msgs[1].role == "user"
    assert len(msgs) == 2


def test_system_kwarg_prepended():
    msgs = lc_to_messages([HumanMessage(content="Q")], system="You are helpful.")
    assert msgs[0].role == "system"
    assert "You are helpful." in msgs[0].content
    assert msgs[1].role == "user"


def test_preserves_conversation_order():
    msgs = lc_to_messages(
        [
            HumanMessage(content="Hello"),
            AIMessage(content="Hi"),
            HumanMessage(content="How are you?"),
        ]
    )
    assert [m.role for m in msgs] == ["user", "assistant", "user"]


def test_unknown_message_types_skipped():
    # Only HumanMessage, AIMessage, SystemMessage should be included
    msgs = lc_to_messages([HumanMessage(content="Q"), AIMessage(content="A")])
    assert len(msgs) == 2


def test_empty_input():
    assert lc_to_messages([]) == []


def test_system_only():
    msgs = lc_to_messages([], system="System prompt")
    assert len(msgs) == 1
    assert msgs[0].role == "system"


def test_returns_message_objects():
    msgs = lc_to_messages([HumanMessage(content="Hi")])
    assert all(isinstance(m, Message) for m in msgs)
