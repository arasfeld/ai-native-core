"""Context Service — assembles message context for a chat turn."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from langchain_core.messages import BaseMessage, SystemMessage
from memory import EpisodicStore, SummaryCompressor
from tools import get_location_context

from ..repositories.session_repository import SessionRepository

log = structlog.get_logger()


def _extract_text(message: str | list[dict[str, Any]]) -> str:
    if isinstance(message, str):
        return message
    return " ".join(
        part.get("text", "")
        for part in message
        if isinstance(part, dict) and part.get("type") == "text"
    )


class ContextService:
    """Assembles the complete message context for a chat turn.

    Handles session history loading, compression, episodic memory injection,
    and location/weather context injection. Pure Python — no FastAPI imports.
    """

    def __init__(
        self,
        session_repo: SessionRepository,
        compressor: SummaryCompressor,
        episodic: EpisodicStore,
    ) -> None:
        self._session_repo = session_repo
        self._compressor = compressor
        self._episodic = episodic

    async def build(
        self,
        message: str | list[dict[str, Any]],
        session_id: str,
        lat: float | None = None,
        lng: float | None = None,
    ) -> tuple[list[BaseMessage], str | None]:
        """Build context messages for a chat turn.

        Returns:
            (context_messages, location_place_or_None)
            location_place is the human-readable location name for episodic storage.
        """
        # Load and compress session history
        history = await self._session_repo.get_messages(session_id)
        history = await self._compressor.compress(history)

        # Retrieve relevant long-term memories
        message_text = _extract_text(message)
        facts = await self._episodic.search(message_text, top_k=5)
        if facts:
            facts_text = "\n".join(f"- {f.content}" for f in facts)
            history = [
                SystemMessage(content=f"Relevant facts from previous conversations:\n{facts_text}"),
                *history,
            ]

        # Inject location + weather context
        location_place: str | None = None
        if lat is not None and lng is not None:
            try:
                now = datetime.now(UTC)
                location_ctx = await get_location_context(lat, lng)
                location_info = (
                    "The user has shared their device location with you. "
                    "Use this information confidently when asked about their location, "
                    "weather, or nearby places — do not say you lack location access.\n\n"
                    f"Current date and time: {now.strftime('%A, %B %d, %Y')} at {now.strftime('%H:%M')} UTC\n"
                    f"{location_ctx}"
                )
                history = [SystemMessage(content=location_info), *history]
                first_line = location_ctx.split("\n")[0]
                location_place = first_line.removeprefix("User is in ").removesuffix(".")
                log.info("context.location_injected", place=location_place)
            except Exception as exc:
                log.warning("context.location_error", error=str(exc))

        return history, location_place
