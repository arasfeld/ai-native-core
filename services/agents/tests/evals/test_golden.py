"""Golden-answer evaluation tests.

These tests run the real LLM at temperature=0 and assert the response contains
expected keywords. They are skipped in normal CI — set RUN_EVALS=1 to enable.

    RUN_EVALS=1 uv run pytest services/agents/tests/evals/ -v
"""

import json
import os
from pathlib import Path

import pytest
from langchain_core.messages import HumanMessage

from agents import ChatState, build_chat_graph

FIXTURES = Path(__file__).parent / "fixtures" / "chat_qa.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

run_evals = pytest.mark.skipif(
    not os.environ.get("RUN_EVALS"),
    reason="Set RUN_EVALS=1 to run golden-answer eval tests (requires LLM API access)",
)


def _load_qa() -> list[dict]:
    with open(FIXTURES) as f:
        return json.load(f)


def _score(response: str, expected_keywords: list[str]) -> float:
    """Fraction of expected keywords found in the response (case-insensitive)."""
    resp_lower = response.lower()
    hits = sum(1 for kw in expected_keywords if kw.lower() in resp_lower)
    return hits / len(expected_keywords)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

_QA = _load_qa()


@run_evals
@pytest.mark.parametrize("qa", _QA, ids=[q["id"] for q in _QA])
async def test_golden_chat_answer(qa: dict, real_llm):
    """Each Q&A pair must score 1.0 — all expected keywords present."""
    agent = build_chat_graph(llm=real_llm)
    state = ChatState(
        messages=[HumanMessage(content=qa["question"])],
        session_id=f"eval-{qa['id']}",
        system_prompt="",
    )
    result = await agent.run(state)
    response = result["messages"][-1].content
    score = _score(response, qa["expected_keywords"])

    assert score == 1.0, (
        f"[{qa['id']}] Score {score:.0%} — missing keywords in response.\n"
        f"  Question : {qa['question']}\n"
        f"  Expected : {qa['expected_keywords']}\n"
        f"  Response : {response}"
    )


@run_evals
async def test_overall_eval_score(real_llm):
    """Aggregate score across all Q&A pairs must be >= PASS_THRESHOLD."""
    PASS_THRESHOLD = 0.8

    agent = build_chat_graph(llm=real_llm)
    scores: list[float] = []

    for qa in _QA:
        state = ChatState(
            messages=[HumanMessage(content=qa["question"])],
            session_id=f"eval-{qa['id']}",
            system_prompt="",
        )
        result = await agent.run(state)
        response = result["messages"][-1].content
        scores.append(_score(response, qa["expected_keywords"]))

    overall = sum(scores) / len(scores)
    assert overall >= PASS_THRESHOLD, (
        f"Overall eval score {overall:.0%} is below threshold {PASS_THRESHOLD:.0%}. "
        f"Per-question scores: {[f'{s:.0%}' for s in scores]}"
    )
