"""Memory extractor — derives long-term facts from a conversation turn.

After each assistant reply the extractor asks the LLM to identify facts
worth remembering across future sessions (preferences, stated facts,
commitments, etc.).  The resulting facts are stored in the EpisodicStore.

Usage::

    extractor = MemoryExtractor(llm=llm, episodic=episodic_store)

    # After a turn completes
    await extractor.extract_and_store(
        human_message="I only drink decaf coffee.",
        assistant_reply="Got it, I'll keep that in mind.",
        session_id="abc",
    )
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from ai.base import Message

if TYPE_CHECKING:
    from ai.base import BaseLLM

    from .episodic import EpisodicStore

log = structlog.get_logger()

_EXTRACT_PROMPT = """\
You are a memory extraction assistant. Given one exchange between a user and an AI,
identify any facts worth storing for future reference.

Return ONLY a JSON array of short, self-contained fact strings.
Return an empty array [] if there is nothing worth remembering.

Rules:
- Each fact must be a complete sentence, ≤ 30 words.
- Include: user preferences, stated facts about themselves, commitments, decisions.
- Exclude: pleasantries, filler, facts already implied by the question.

Exchange:
User: {human}
Assistant: {assistant}

JSON array of facts:"""


class MemoryExtractor:
    """Extracts memorable facts from conversation turns and stores them.

    Args:
        llm:      LLM instance used for extraction.
        episodic: EpisodicStore where extracted facts will be saved.
        min_score_to_keep: Future hook for post-hoc deduplication scoring.
    """

    def __init__(self, llm: BaseLLM, episodic: EpisodicStore) -> None:
        self._llm = llm
        self._episodic = episodic

    async def extract_and_store(
        self,
        human_message: str | list | dict,
        assistant_reply: str,
        session_id: str | None = None,
        metadata: dict | None = None,
    ) -> list[int]:
        """Extract facts from one turn and persist them.

        Returns the list of new episodic memory IDs (empty if none found).
        """

        def _get_text(content: str | list | dict) -> str:
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return " ".join(
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
            return str(content)

        prompt = _EXTRACT_PROMPT.format(
            human=_get_text(human_message),
            assistant=assistant_reply,
        )
        messages: list[Message] = [Message(role="user", content=prompt)]
        response = await self._llm.chat(messages)

        facts = _parse_facts(response.content)
        if not facts:
            log.debug("memory.extractor.no_facts", session_id=session_id)
            return []

        ids: list[int] = []
        for fact in facts:
            fact_id = await self._episodic.store(
                fact,
                session_id=session_id,
                metadata=metadata,
            )
            ids.append(fact_id)

        log.info(
            "memory.extractor.stored",
            facts=len(facts),
            session_id=session_id,
        )
        return ids


def _parse_facts(raw: str) -> list[str]:
    """Parse the LLM's JSON array response into a list of fact strings."""
    import json
    import re

    # Strip markdown code fences if present
    raw = re.sub(r"```(?:json)?\s*", "", raw).strip()

    try:
        result = json.loads(raw)
        if isinstance(result, list):
            return [str(f).strip() for f in result if str(f).strip()]
    except json.JSONDecodeError:
        log.warning("memory.extractor.parse_failed", raw=raw[:200])
    return []
