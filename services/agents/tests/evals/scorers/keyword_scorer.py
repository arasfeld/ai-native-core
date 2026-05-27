"""Keyword presence scorer — fraction of expected keywords found in the
response (case-insensitive).
"""

from __future__ import annotations


def score_keywords(response: str, expected_keywords: list[str]) -> float:
    if not expected_keywords:
        return 1.0
    resp_lower = response.lower()
    hits = sum(1 for kw in expected_keywords if kw.lower() in resp_lower)
    return hits / len(expected_keywords)
