"""Chat Service — orchestrates a complete streaming chat turn."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import structlog
from langchain_core.messages import HumanMessage
from memory import MemoryExtractor, estimate_tokens

from ..agent_factory import AgentFactory
from ..auth.deps import AuthUser
from ..repositories.session_repository import SessionRepository
from .budget_notifications import check_budget_thresholds
from .context_service import ContextService

log = structlog.get_logger()


class ChatService:
    """Orchestrates a complete chat turn. No FastAPI imports."""

    def __init__(
        self,
        context_service: ContextService,
        agent_factory: AgentFactory,
        session_repo: SessionRepository,
        extractor: MemoryExtractor | None = None,
    ) -> None:
        self._context_service = context_service
        self._agent_factory = agent_factory
        self._session_repo = session_repo
        self._extractor = extractor

    async def stream(
        self, request: Any, user: AuthUser, *, is_guest: bool = False
    ) -> AsyncIterator[str]:
        """Stream SSE tokens for a chat turn.

        Yields lines in SSE format: ``data: <token>\\n\\n``
        Terminates with ``data: [DONE]\\n\\n``
        """
        session_id = SessionRepository.scope(user.id, request.session_id)

        # Ensure tenant record exists for registered users (idempotent upsert)
        if not is_guest:
            await self._session_repo.get_or_create_tenant(user.id, user.email)

        # Check token budget
        try:
            await self._session_repo.check_budget(session_id, user.id)
        except Exception as exc:
            yield f"data: Error: {exc}\n\n"
            return

        # Build context
        context_messages, location_place = await self._context_service.build(
            message=request.message,
            session_id=session_id,
            lat=getattr(request, "lat", None),
            lng=getattr(request, "lng", None),
        )

        # Persist user message
        await self._session_repo.save_message(session_id, "human", request.message)

        # Best-effort: auto-title + updated_at bump (registered users only, non-fatal)
        if not is_guest:
            if isinstance(request.message, str):
                await self._session_repo.auto_title_conversation(
                    request.session_id, request.message
                )
            await self._session_repo.bump_conversation_updated_at(request.session_id)

        # Build agent and stream
        agent = self._agent_factory.build(
            use_rag=request.use_rag,
            system_prompt=request.system_prompt,
        )
        state = {
            "messages": [*context_messages, HumanMessage(content=request.message)],
            "session_id": session_id,
            "system_prompt": request.system_prompt,
        }

        accumulated: list[str] = []
        try:
            log.info("chat.stream.start", session_id=session_id, user_id=user.id, is_guest=is_guest)
            async for token in agent.stream(state):
                accumulated.append(token)
                yield f"data: {token}\n\n"

            full_reply = "".join(accumulated)

            # Persist assistant reply and token usage
            await self._session_repo.save_message(session_id, "assistant", full_reply)
            tokens_used = estimate_tokens(request.message) + estimate_tokens(full_reply)
            await self._session_repo.add_token_usage(session_id, tokens_used, user.id)

            # Background: budget threshold notifications (registered users only)
            if not is_guest:
                asyncio.ensure_future(
                    check_budget_thresholds(self._session_repo._pool, user.id, user.email)
                )

            # Background: extract long-term memories (only for registered users)
            if self._extractor and not is_guest:
                asyncio.ensure_future(
                    self._extractor.extract_and_store(
                        human_message=request.message,
                        assistant_reply=full_reply,
                        session_id=session_id,
                        metadata={"user_id": user.id},
                    )
                )

            yield "data: [DONE]\n\n"

        except Exception as exc:
            log.error("chat.stream.error", error=str(exc))
            yield f"data: Error: {exc}\n\n"
