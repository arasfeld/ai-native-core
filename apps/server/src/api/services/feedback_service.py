"""Feedback Service — persists thumbs-up/down on assistant messages and
mirrors the signal to LangSmith so the same rating shows up next to its run
in the LangSmith UI.

The LangSmith mirror is fire-and-forget: a missing or down LangSmith does
not block the request, since the canonical store is Postgres.
"""

from __future__ import annotations

import asyncio
import uuid

import asyncpg
import structlog
from agents import is_tracing_enabled

log = structlog.get_logger()


_FEEDBACK_KEY = "user_thumbs"


class FeedbackService:
    """All feedback writes go through this service."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def record(
        self,
        *,
        run_id: uuid.UUID,
        rating: int,
        session_id: str,
        tenant_id: str,
        user_id: str | None,
        comment: str | None = None,
    ) -> uuid.UUID:
        """Persist a feedback row and (best-effort) mirror to LangSmith.

        Returns the new row id. Raises asyncpg errors on insert failure.
        """
        row = await self._pool.fetchrow(
            """
            INSERT INTO message_feedback
                (run_id, session_id, tenant_id, user_id, rating, comment)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            run_id,
            session_id,
            tenant_id,
            user_id,
            rating,
            comment,
        )
        feedback_id = row["id"]

        # Mirror to LangSmith without blocking the response.
        if is_tracing_enabled():
            asyncio.ensure_future(self._mirror_to_langsmith(run_id, rating, comment))
        return feedback_id

    @staticmethod
    async def _mirror_to_langsmith(run_id: uuid.UUID, rating: int, comment: str | None) -> None:
        try:
            from langsmith import Client

            client = Client()
            # Convention: thumbs-up -> 1, thumbs-down -> 0. Mapping from our
            # -1/+1 storage so the signal in LangSmith matches the standard
            # "good/bad" scale most evaluators expect.
            score = 1 if rating == 1 else 0
            await asyncio.to_thread(
                client.create_feedback,
                run_id=run_id,
                key=_FEEDBACK_KEY,
                score=score,
                comment=comment,
            )
        except Exception as exc:  # pragma: no cover - depends on external service
            log.warning("feedback.langsmith.mirror_failed", run_id=str(run_id), error=str(exc))
