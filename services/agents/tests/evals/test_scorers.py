"""Unit tests for eval scorers — pure functions, no LLM calls."""

from __future__ import annotations

from .scorers import score_citations, score_keywords, score_tool_use
from .scorers.rag_citation_scorer import extract_citations

# ---------------------------------------------------------------------------
# keyword_scorer
# ---------------------------------------------------------------------------


def test_keyword_full_match():
    assert score_keywords("Paris is the capital", ["Paris"]) == 1.0


def test_keyword_partial_match():
    assert score_keywords("Paris is great", ["Paris", "France"]) == 0.5


def test_keyword_case_insensitive():
    assert score_keywords("paris is the capital", ["Paris"]) == 1.0


def test_keyword_empty_expected_is_perfect():
    assert score_keywords("anything", []) == 1.0


# ---------------------------------------------------------------------------
# tool_use_scorer
# ---------------------------------------------------------------------------


def test_tool_use_exact_match():
    assert score_tool_use(["get_weather"], ["get_weather"]) == 1.0


def test_tool_use_both_empty_is_perfect():
    """Agent correctly skipped a tool call when none was needed."""
    assert score_tool_use([], []) == 1.0


def test_tool_use_unexpected_invocation_scores_zero():
    """Agent invoked a tool when none was needed → false positive."""
    assert score_tool_use(["get_weather"], []) == 0.0


def test_tool_use_missing_invocation_scores_zero():
    assert score_tool_use([], ["get_weather"]) == 0.0


def test_tool_use_partial_overlap():
    """Jaccard: |{a}| / |{a,b}| = 0.5"""
    score = score_tool_use(["get_weather"], ["get_weather", "web_search"])
    assert score == 0.5


# ---------------------------------------------------------------------------
# rag_citation_scorer
# ---------------------------------------------------------------------------


def test_extract_citations_finds_markers():
    text = "Per the docs [source:doc-a], the sky is blue [source:doc-b]."
    assert extract_citations(text) == ["doc-a", "doc-b"]


def test_extract_citations_empty():
    assert extract_citations("no citations here") == []


def test_citation_full_match():
    text = "Answer drawn from [source:doc-1] and [source:doc-2]."
    assert score_citations(text, ["doc-1", "doc-2"]) == 1.0


def test_citation_partial_match():
    text = "Drawn from [source:doc-1] only."
    assert score_citations(text, ["doc-1", "doc-2"]) == 0.5


def test_citation_empty_expected_is_perfect():
    assert score_citations("anything", []) == 1.0


def test_citation_ignores_extra_citations():
    """Unexpected citations don't penalize — only missing ones do."""
    text = "[source:doc-1][source:doc-2][source:doc-3]"
    assert score_citations(text, ["doc-1"]) == 1.0
