"""RAG citation scorer — fraction of expected source ids that appear as
``[source:<id>]`` markers in the response.

The chat.v2 system prompt instructs the agent to emit citation markers when
it uses information from a context chunk. This scorer checks that the
expected ids show up; it does not penalize extra (unexpected) citations.
"""

from __future__ import annotations

import re

_CITATION_RE = re.compile(r"\[source:([^\]]+)\]")


def extract_citations(response: str) -> list[str]:
    """Return the ordered list of source ids cited in the response."""
    return _CITATION_RE.findall(response)


def score_citations(response: str, expected_ids: list[str]) -> float:
    if not expected_ids:
        return 1.0
    cited = set(extract_citations(response))
    hits = sum(1 for sid in expected_ids if sid in cited)
    return hits / len(expected_ids)
