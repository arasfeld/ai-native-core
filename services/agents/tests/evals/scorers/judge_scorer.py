"""LLM-as-judge scorer.

Uses a small, cheap model to grade response correctness against a question
and (optionally) the expected keywords as a hint. Returns a score in [0, 1]
and a short rationale. Results are cached by ``(question, response)`` hash
to keep repeated runs deterministic and inexpensive.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass

from ai import Message, create_llm

_RUBRIC = """You are an impartial judge grading a chatbot's answer.

Score in [0.0, 1.0]:
  1.0 — fully correct, complete, and on-topic
  0.5 — partially correct or missing important detail
  0.0 — incorrect, misleading, or off-topic

Respond as JSON: {"score": <float>, "rationale": "<one sentence>"}."""

_CACHE: dict[str, JudgeResult] = {}


@dataclass
class JudgeResult:
    score: float
    rationale: str


def _cache_key(question: str, response: str, model: str) -> str:
    h = hashlib.sha256()
    h.update(question.encode())
    h.update(b"\x00")
    h.update(response.encode())
    h.update(b"\x00")
    h.update(model.encode())
    return h.hexdigest()


async def score_with_judge(
    *,
    question: str,
    response: str,
    expected_keywords: list[str] | None = None,
    model: str | None = None,
) -> JudgeResult:
    """Call a small LLM to grade the response.

    Picks the model from ``EVAL_JUDGE_MODEL`` env var (default
    ``gpt-4o-mini``) and the provider from ``EVAL_JUDGE_PROVIDER`` (default
    ``openai``). Returns ``JudgeResult(score=0.0, rationale="judge_unavailable")``
    if the LLM call fails for any reason — judges should never break the
    eval pipeline on infrastructure errors.
    """
    judge_model = model or os.environ.get("EVAL_JUDGE_MODEL", "gpt-4o-mini")
    judge_provider = os.environ.get("EVAL_JUDGE_PROVIDER", "openai")

    key = _cache_key(question, response, judge_model)
    if key in _CACHE:
        return _CACHE[key]

    hint = (
        f"\nFor reference, evaluators expect these keywords in a strong answer: {expected_keywords}"
        if expected_keywords
        else ""
    )
    user_content = (
        f"Question:\n{question}\n\n"
        f"Candidate answer:\n{response}\n"
        f"{hint}\n\n"
        "Grade the candidate answer."
    )

    try:
        llm = create_llm(provider=judge_provider, model=judge_model)
        result = await llm.chat(
            [
                Message(role="system", content=_RUBRIC),
                Message(role="user", content=user_content),
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        payload = json.loads(result.content)
        out = JudgeResult(
            score=float(payload.get("score", 0.0)),
            rationale=str(payload.get("rationale", ""))[:500],
        )
    except Exception as exc:  # pragma: no cover - depends on external services
        out = JudgeResult(score=0.0, rationale=f"judge_unavailable: {exc}")

    _CACHE[key] = out
    return out
