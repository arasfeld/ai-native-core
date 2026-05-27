"""Golden-answer eval suite.

Runs each fixture case through the real agent and scores with the
category-appropriate scorer. Skipped unless ``RUN_EVALS=1`` is set so the
unit-test CI stays cheap. Set ``OPENAI_API_KEY`` (or another provider's
key) before running.

    RUN_EVALS=1 uv run pytest services/agents/tests/evals/ -v
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from agents import ChatState, RAGState, build_chat_graph, build_rag_graph
from langchain_core.messages import AIMessage, HumanMessage

from ._report import record_eval_run
from .scorers import score_citations, score_keywords, score_tool_use
from .scorers.judge_scorer import score_with_judge

FIXTURES = Path(__file__).parent / "fixtures" / "chat_qa.json"
RAG_CORPUS_FIXTURE = Path(__file__).parent / "fixtures" / "rag_corpus.json"

# Per-category pass thresholds. Tool-use is held to a higher bar because a
# wrong tool call is more visible to users than a slightly-off answer.
CATEGORY_THRESHOLDS: dict[str, float] = {
    "factual": 0.80,
    "honesty": 0.70,
    "multi_turn": 0.75,
    "tool_use": 0.90,
    "rag": 0.75,
    "judge": 0.75,
}

run_evals = pytest.mark.skipif(
    not os.environ.get("RUN_EVALS"),
    reason="Set RUN_EVALS=1 to run golden-answer eval tests (requires LLM API access)",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_qa() -> list[dict]:
    with open(FIXTURES) as f:
        return json.load(f)


def _load_rag_corpus() -> dict[str, str]:
    with open(RAG_CORPUS_FIXTURE) as f:
        return json.load(f)


def _to_lc_messages(messages: list[dict[str, str]]):
    """Convert fixture messages to LangChain BaseMessage instances."""
    out = []
    for m in messages:
        if m["role"] == "user":
            out.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            out.append(AIMessage(content=m["content"]))
    return out


class _ToolRecorder:
    """Wraps the tools the agent will see so we can observe which ones are
    invoked end-to-end. Each invocation is appended to ``called``."""

    def __init__(self, tools: list[Any]) -> None:
        self.called: list[str] = []
        self.wrapped = [self._wrap(t) for t in tools]

    def _wrap(self, tool):
        recorder = self
        original_arun = tool.arun

        async def arun(args, **kwargs):
            recorder.called.append(tool.name)
            return await original_arun(args, **kwargs)

        tool.arun = arun  # mutates the BaseTool instance for this run only
        return tool


async def _run_chat(case: dict, llm, tools=None) -> tuple[str, list[str]]:
    """Run ChatAgent for a case and return (response, tool_calls_observed)."""
    recorder = _ToolRecorder(tools or [])
    agent = build_chat_graph(llm=llm, tools=recorder.wrapped if tools else None)
    state = ChatState(
        messages=_to_lc_messages(case["messages"]),
        session_id=f"eval-{case['id']}",
        system_prompt="",
    )
    result = await agent.run(state)
    response = result["messages"][-1].content
    return response, recorder.called


async def _run_rag(case: dict, llm) -> str:
    """Run RAGAgent for a case with the fixture's chunks injected."""
    corpus = _load_rag_corpus()
    chunks = [f"[{cid}] {corpus.get(cid, '')}" for cid in case.get("context_chunks", [])]
    agent = build_rag_graph(llm=llm)
    state = RAGState(
        messages=_to_lc_messages(case["messages"]),
        session_id=f"eval-{case['id']}",
        context_chunks=chunks,
    )
    result = await agent.run(state)
    return result["messages"][-1].content


def _bucket(qa: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for case in qa:
        out.setdefault(case.get("category", "factual"), []).append(case)
    return out


# ---------------------------------------------------------------------------
# Per-case parametrized tests (kept fine-grained so a single regression
# surfaces in CI by case id rather than as an aggregate-only failure).
# ---------------------------------------------------------------------------


_QA = _load_qa()


@run_evals
@pytest.mark.parametrize(
    "case",
    [c for c in _QA if c.get("category", "factual") not in ("tool_use", "rag")],
    ids=lambda c: c["id"],
)
async def test_keyword_case(case: dict, real_llm):
    response, _ = await _run_chat(case, real_llm)
    score = score_keywords(response, case.get("expected_keywords", []))
    assert score >= 0.5, (
        f"[{case['id']}] keyword score {score:.0%}.\n"
        f"  Expected: {case.get('expected_keywords')}\n"
        f"  Response: {response}"
    )


# ---------------------------------------------------------------------------
# Per-category aggregate tests — these are the gating signal for CI.
# ---------------------------------------------------------------------------


async def _gather_keyword_scores(cases: list[dict], real_llm) -> list[float]:
    scores: list[float] = []
    for case in cases:
        response, _ = await _run_chat(case, real_llm)
        scores.append(score_keywords(response, case.get("expected_keywords", [])))
    return scores


def _assert_category(category: str, scorer: str, scores: list[float]) -> None:
    threshold = CATEGORY_THRESHOLDS[category]
    record_eval_run(category=category, scorer=scorer, scores=scores, threshold=threshold)
    overall = sum(scores) / len(scores) if scores else 1.0
    assert overall >= threshold, (
        f"{category} category score {overall:.0%} below threshold {threshold:.0%}. "
        f"per-case: {[f'{s:.0%}' for s in scores]}"
    )


@run_evals
async def test_factual_threshold(real_llm):
    cases = _bucket(_QA).get("factual", [])
    scores = await _gather_keyword_scores(cases, real_llm)
    _assert_category("factual", "keyword", scores)


@run_evals
async def test_honesty_threshold(real_llm):
    cases = _bucket(_QA).get("honesty", [])
    scores = await _gather_keyword_scores(cases, real_llm)
    _assert_category("honesty", "keyword", scores)


@run_evals
async def test_multi_turn_threshold(real_llm):
    cases = _bucket(_QA).get("multi_turn", [])
    scores = await _gather_keyword_scores(cases, real_llm)
    _assert_category("multi_turn", "keyword", scores)


@run_evals
async def test_tool_use_threshold(real_llm, eval_tools):
    cases = _bucket(_QA).get("tool_use", [])
    scores: list[float] = []
    for case in cases:
        _, called = await _run_chat(case, real_llm, tools=eval_tools)
        scores.append(score_tool_use(called, case.get("expected_tools", [])))
    _assert_category("tool_use", "tool_use", scores)


@run_evals
async def test_rag_threshold(real_llm):
    cases = _bucket(_QA).get("rag", [])
    scores: list[float] = []
    for case in cases:
        response = await _run_rag(case, real_llm)
        kw = score_keywords(response, case.get("expected_keywords", []))
        cite = score_citations(response, case.get("expected_citations", []))
        # Average keyword + citation correctness.
        scores.append((kw + cite) / 2)
    _assert_category("rag", "keyword+citation", scores)


@run_evals
async def test_judge_threshold(real_llm):
    """LLM-as-judge over every non-tool, non-rag case. Confirms that the
    answer is on-topic and reasonable, complementing the strict keyword
    check."""
    judge_cases = [c for c in _QA if c.get("category", "factual") not in ("tool_use", "rag")]
    scores: list[float] = []
    for case in judge_cases:
        response, _ = await _run_chat(case, real_llm)
        result = await score_with_judge(
            question=case["messages"][-1]["content"],
            response=response,
            expected_keywords=case.get("expected_keywords"),
        )
        scores.append(result.score)
    _assert_category("judge", "judge", scores)
