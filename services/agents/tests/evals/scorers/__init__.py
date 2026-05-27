"""Scorers for eval cases.

Each scorer takes a case dict (from chat_qa.json) plus the agent's output
and returns a float in [0.0, 1.0]. Scorers are pure — they never call the
LLM unless explicitly noted (judge_scorer does).
"""

from .keyword_scorer import score_keywords
from .rag_citation_scorer import score_citations
from .tool_use_scorer import score_tool_use

__all__ = ["score_keywords", "score_tool_use", "score_citations"]
