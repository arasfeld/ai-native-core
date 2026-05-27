"""LangSmith evaluation runner.

Pushes golden Q&A pairs as a LangSmith dataset and runs the chat agent
against them, scoring with the category-appropriate evaluator and
registering each one as a separate LangSmith feedback key so the LangSmith
UI shows them side-by-side.

Usage:
    LANGCHAIN_API_KEY=ls-... LLM_PROVIDER=openai OPENAI_API_KEY=sk-... \\
        uv run python -m services.agents.tests.evals.langsmith_runner

Environment variables:
    LANGCHAIN_API_KEY   Required. LangSmith API key.
    LLM_PROVIDER        LLM provider to use (default: openai).
    PASS_THRESHOLD      Minimum overall score to exit 0 (default: 0.80).
    DATASET_NAME        LangSmith dataset name (default: chat-golden-qa).
    EVAL_JUDGE_MODEL    Model to use for LLM-as-judge (default: gpt-4o-mini).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures" / "chat_qa.json"
RAG_CORPUS = Path(__file__).parent / "fixtures" / "rag_corpus.json"
DATASET_NAME = os.environ.get("DATASET_NAME", "chat-golden-qa")
PASS_THRESHOLD = float(os.environ.get("PASS_THRESHOLD", "0.80"))


def _load_qa() -> list[dict]:
    with open(FIXTURES) as f:
        return json.load(f)


def _load_corpus() -> dict[str, str]:
    with open(RAG_CORPUS) as f:
        return json.load(f)


async def _run_case(qa: dict, corpus: dict[str, str]) -> dict:
    """Run the agent against one case and return per-scorer breakdown."""
    from agents import ChatState, RAGState, build_chat_graph, build_rag_graph
    from ai import get_llm
    from langchain_core.messages import AIMessage, HumanMessage

    from .scorers import score_citations, score_keywords, score_tool_use
    from .scorers.judge_scorer import score_with_judge

    def to_lc(messages):
        out = []
        for m in messages:
            if m["role"] == "user":
                out.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                out.append(AIMessage(content=m["content"]))
        return out

    llm = get_llm()
    category = qa.get("category", "factual")

    tool_calls: list[str] = []
    if category == "rag":
        chunks = [f"[{cid}] {corpus.get(cid, '')}" for cid in qa.get("context_chunks", [])]
        agent = build_rag_graph(llm=llm)
        state = RAGState(
            messages=to_lc(qa["messages"]),
            session_id=f"ls-eval-{qa['id']}",
            context_chunks=chunks,
        )
    else:
        agent = build_chat_graph(llm=llm)
        state = ChatState(
            messages=to_lc(qa["messages"]),
            session_id=f"ls-eval-{qa['id']}",
            system_prompt="",
        )
    result = await agent.run(state)
    response = result["messages"][-1].content

    scores: dict[str, float] = {}
    if "expected_keywords" in qa:
        scores["keyword"] = score_keywords(response, qa["expected_keywords"])
    if category == "tool_use":
        scores["tool_use"] = score_tool_use(tool_calls, qa.get("expected_tools", []))
    if category == "rag":
        scores["citation"] = score_citations(response, qa.get("expected_citations", []))
    if category not in ("tool_use", "rag"):
        judged = await score_with_judge(
            question=qa["messages"][-1]["content"],
            response=response,
            expected_keywords=qa.get("expected_keywords"),
        )
        scores["judge"] = judged.score

    return {"qa": qa, "response": response, "scores": scores}


def _ensure_dataset(client, qa_pairs: list[dict]):
    existing = [d for d in client.list_datasets() if d.name == DATASET_NAME]
    if existing:
        dataset = existing[0]
        for ex in client.list_examples(dataset_id=dataset.id):
            client.delete_example(ex.id)
    else:
        dataset = client.create_dataset(
            DATASET_NAME,
            description="Golden Q&A pairs for chat agent regression testing",
        )

    for qa in qa_pairs:
        client.create_example(
            inputs={
                "messages": qa["messages"],
                "category": qa.get("category", "factual"),
            },
            outputs={
                "expected_keywords": qa.get("expected_keywords", []),
                "expected_tools": qa.get("expected_tools", []),
                "expected_citations": qa.get("expected_citations", []),
            },
            dataset_id=dataset.id,
            metadata={"id": qa["id"], "category": qa.get("category", "factual")},
        )
    return dataset


def main() -> int:
    try:
        from langsmith import Client
    except ImportError:
        print("langsmith not installed — skipping LangSmith upload.")
        return 0

    api_key = os.environ.get("LANGCHAIN_API_KEY")
    if not api_key:
        print("LANGCHAIN_API_KEY not set — skipping LangSmith upload.")
        return 0

    qa_pairs = _load_qa()
    corpus = _load_corpus()
    client = Client(api_key=api_key)
    _ensure_dataset(client, qa_pairs)
    print(f"Dataset '{DATASET_NAME}' ready with {len(qa_pairs)} examples.")

    # Per-scorer aggregates so LangSmith can chart them independently.
    by_scorer: dict[str, list[float]] = {}

    for qa in qa_pairs:
        out = asyncio.run(_run_case(qa, corpus))
        run = client.create_run(
            name="chat-golden-eval",
            run_type="chain",
            inputs={"messages": qa["messages"]},
            outputs={"response": out["response"]},
            extra={
                "qa_id": qa["id"],
                "category": qa.get("category", "factual"),
                **out["scores"],
            },
        )
        # Mirror each scorer as a separate feedback key.
        if run is not None and hasattr(run, "id"):
            run_id = run.id
            for key, score in out["scores"].items():
                try:
                    client.create_feedback(run_id=run_id, key=key, score=score)
                except Exception as exc:
                    print(f"  ! mirror {key} failed: {exc}")
        breakdown = " ".join(f"{k}={v:.0%}" for k, v in out["scores"].items())
        print(f"  [{qa['id']}] {breakdown}  response={out['response'][:80]!r}")
        for key, score in out["scores"].items():
            by_scorer.setdefault(key, []).append(score)

    print()
    overall_scores: list[float] = []
    for key, scores in sorted(by_scorer.items()):
        mean = sum(scores) / len(scores)
        overall_scores.append(mean)
        print(f"{key:10s} {mean:.0%}  (n={len(scores)})")

    overall = sum(overall_scores) / len(overall_scores) if overall_scores else 0.0
    print(f"\nOverall score: {overall:.0%}  (threshold: {PASS_THRESHOLD:.0%})")

    if overall < PASS_THRESHOLD:
        print(f"FAIL — score {overall:.0%} is below threshold {PASS_THRESHOLD:.0%}")
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
