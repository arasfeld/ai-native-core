"""Tool-use scorer — judges whether the agent invoked the expected tool(s).

Score = Jaccard similarity between expected and observed tool-name sets.
A perfect match (same set, including the empty set when no tool is needed)
scores 1.0. False positives and false negatives both drag the score down.
"""

from __future__ import annotations


def score_tool_use(
    actual_tools: list[str],
    expected_tools: list[str],
) -> float:
    actual = {t for t in actual_tools}
    expected = {t for t in expected_tools}

    if not actual and not expected:
        return 1.0  # both empty → correctly skipped a tool call

    if not expected:
        # Agent invoked tools when none were needed → false-positive penalty.
        return 0.0

    intersection = actual & expected
    union = actual | expected
    return len(intersection) / len(union)
