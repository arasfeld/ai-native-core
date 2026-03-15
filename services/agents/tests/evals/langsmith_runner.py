"""LangSmith evaluation runner.

Pushes golden Q&A pairs as a LangSmith dataset and runs the chat agent
against them, scoring results with a keyword-match evaluator.

Usage:
    LANGCHAIN_API_KEY=ls-... LLM_PROVIDER=openai OPENAI_API_KEY=sk-... \\
        uv run python -m services.agents.tests.evals.langsmith_runner

Environment variables:
    LANGCHAIN_API_KEY   Required. LangSmith API key.
    LLM_PROVIDER        LLM provider to use (default: openai).
    PASS_THRESHOLD      Minimum overall score to exit 0 (default: 0.80).
    DATASET_NAME        LangSmith dataset name (default: chat-golden-qa).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures" / "chat_qa.json"
DATASET_NAME = os.environ.get("DATASET_NAME", "chat-golden-qa")
PASS_THRESHOLD = float(os.environ.get("PASS_THRESHOLD", "0.80"))


def _load_qa() -> list[dict]:
    with open(FIXTURES) as f:
        return json.load(f)


def _score(response: str, expected_keywords: list[str]) -> float:
    resp_lower = response.lower()
    hits = sum(1 for kw in expected_keywords if kw.lower() in resp_lower)
    return hits / len(expected_keywords)


async def _run_agent(question: str) -> str:
    from langchain_core.messages import HumanMessage

    from agents import ChatState, build_chat_graph
    from ai import get_llm

    llm = get_llm()
    agent = build_chat_graph(llm=llm)
    state = ChatState(
        messages=[HumanMessage(content=question)],
        session_id="langsmith-eval",
        system_prompt="",
    )
    result = await agent.run(state)
    return result["messages"][-1].content


def _ensure_dataset(client, qa_pairs: list[dict]):
    """Create or clear-and-repopulate the LangSmith dataset."""
    existing = [d for d in client.list_datasets() if d.name == DATASET_NAME]
    if existing:
        dataset = existing[0]
        # Remove stale examples so we get a clean run
        for ex in client.list_examples(dataset_id=dataset.id):
            client.delete_example(ex.id)
    else:
        dataset = client.create_dataset(
            DATASET_NAME,
            description="Golden Q&A pairs for chat agent regression testing",
        )

    for qa in qa_pairs:
        client.create_example(
            inputs={"question": qa["question"]},
            outputs={"expected_keywords": qa["expected_keywords"]},
            dataset_id=dataset.id,
            metadata={"id": qa["id"]},
        )
    return dataset


def main() -> int:
    try:
        from langsmith import Client
        from langsmith.schemas import Run, Example
    except ImportError:
        print("langsmith not installed — skipping LangSmith upload.")
        return 0

    api_key = os.environ.get("LANGCHAIN_API_KEY")
    if not api_key:
        print("LANGCHAIN_API_KEY not set — skipping LangSmith upload.")
        return 0

    qa_pairs = _load_qa()
    client = Client(api_key=api_key)
    dataset = _ensure_dataset(client, qa_pairs)
    print(f"Dataset '{DATASET_NAME}' ready with {len(qa_pairs)} examples.")

    # Run agent against each example and collect scores
    scores: list[float] = []
    for qa in qa_pairs:
        response = asyncio.run(_run_agent(qa["question"]))
        score = _score(response, qa["expected_keywords"])
        scores.append(score)

        # Log run to LangSmith
        run_id = client.create_run(
            name="chat-golden-eval",
            run_type="chain",
            inputs={"question": qa["question"]},
            outputs={"response": response},
            extra={"score": score, "qa_id": qa["id"]},
        )
        print(f"  [{qa['id']}] score={score:.0%}  response={response[:80]!r}")

    overall = sum(scores) / len(scores)
    print(f"\nOverall score: {overall:.0%}  (threshold: {PASS_THRESHOLD:.0%})")

    if overall < PASS_THRESHOLD:
        print(f"FAIL — score {overall:.0%} is below threshold {PASS_THRESHOLD:.0%}")
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
