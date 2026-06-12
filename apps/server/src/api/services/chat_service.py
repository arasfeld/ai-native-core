"""Chat Service — orchestrates a complete streaming chat turn."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import structlog
from agents import trace_chat
from ai.pricing import PricingTable
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
        pricing: PricingTable | None = None,
    ) -> None:
        self._context_service = context_service
        self._agent_factory = agent_factory
        self._session_repo = session_repo
        self._extractor = extractor
        self._pricing = pricing

    async def _fetch_global_instructions(self, user_id: str) -> str:
        row = await self._session_repo._pool.fetchrow(
            "SELECT system_instructions FROM user_preferences WHERE user_id = $1", user_id
        )
        return (row.get("system_instructions") or "") if row else ""

    async def _fetch_conversation_instructions(self, conversation_id: str, user_id: str) -> str:
        if conversation_id == "default":
            return ""
        row = await self._session_repo._pool.fetchrow(
            "SELECT system_instructions FROM conversations WHERE id = $1 AND user_id = $2",
            conversation_id,
            user_id,
        )
        return (row.get("system_instructions") or "") if row else ""

    async def stream(
        self,
        request: Any,
        user: AuthUser,
        *,
        is_guest: bool = False,
        run_id: uuid.UUID | None = None,
    ) -> AsyncIterator[str]:
        """Stream SSE tokens for a chat turn.

        Yields lines in SSE format: ``data: <token>\\n\\n``
        Terminates with ``data: [DONE]\\n\\n``

        ``run_id`` identifies this invocation in LangSmith and is mirrored to
        clients as the leading meta event and an ``X-Run-Id`` response header.
        Callers should generate it upfront so the header can be set before the
        generator starts producing bytes.
        """
        if run_id is None:
            run_id = uuid.uuid4()
        session_id = SessionRepository.scope(user.id, request.session_id)

        # Ensure tenant record exists for registered users (idempotent upsert)
        if not is_guest:
            await self._session_repo.get_or_create_tenant(user.id, user.email)

        # Budget keyed by org_id (= user_id for personal orgs; different for team orgs)
        budget_key = user.org_id if user.org_id else user.id

        # Check token budget
        try:
            await self._session_repo.check_budget(session_id, budget_key)
        except Exception as exc:
            yield f"data: Error: {exc}\n\n"
            return

        # Fetch and combine system instructions (registered users only)
        effective_system_prompt = request.system_prompt or ""
        if not is_guest:
            global_instr = await self._fetch_global_instructions(user.id)
            conv_instr = await self._fetch_conversation_instructions(request.session_id, user.id)
            parts = [p for p in [global_instr, conv_instr, request.system_prompt] if p]
            effective_system_prompt = "\n\n".join(parts)

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
            system_prompt=effective_system_prompt or None,
        )
        state = {
            "messages": [*context_messages, HumanMessage(content=request.message)],
            "session_id": session_id,
            "system_prompt": effective_system_prompt or None,
        }

        # Emit the run_id as the first SSE event so SSE clients can correlate
        # the stream with a LangSmith trace (and submit feedback in Phase 3).
        yield f"data: {json.dumps({'type': 'meta', 'run_id': str(run_id)})}\n\n"

        accumulated: list[str] = []
        real_usage_total = 0
        real_prompt_tokens = 0
        real_completion_tokens = 0
        usage_provider: str | None = None
        usage_model: str | None = None
        message_for_trace = (
            request.message if isinstance(request.message, str) else str(request.message)
        )
        try:
            log.info(
                "chat.stream.start",
                session_id=session_id,
                user_id=user.id,
                is_guest=is_guest,
                run_id=str(run_id),
            )
            with trace_chat(
                run_id=run_id,
                name="chat.stream",
                inputs={"message": message_for_trace, "use_rag": request.use_rag},
                metadata={
                    "session_id": session_id,
                    "tenant_id": budget_key,
                    "user_id": user.id,
                    "is_guest": is_guest,
                },
                tags=[
                    "chat",
                    "rag" if request.use_rag else "no_rag",
                    "guest" if is_guest else "registered",
                ],
            ) as run_tree:
                async for event in agent.stream_with_usage(state):
                    if event.type == "token" and event.content:
                        accumulated.append(event.content)
                        yield f"data: {event.content}\n\n"
                    elif event.type == "usage" and event.usage:
                        real_usage_total = event.usage.total_tokens
                        real_prompt_tokens = event.usage.prompt_tokens
                        real_completion_tokens = event.usage.completion_tokens
                        usage_provider = event.usage.provider
                        usage_model = event.usage.model

                full_reply = "".join(accumulated)
                estimated_tokens = estimate_tokens(request.message) + estimate_tokens(full_reply)
                tokens_used = real_usage_total or estimated_tokens

                # Compute dollar cost from the pricing cache. Without provider/model
                # (Ollama doesn't stream usage), or for a model we have no rate for,
                # cost stays NULL — callers distinguish "unpriced" from "$0".
                cost_usd: Decimal | None = None
                if self._pricing and usage_provider and real_usage_total:
                    cost_usd = self._pricing.compute_cost(
                        provider=usage_provider,
                        model=usage_model,
                        input_tokens=real_prompt_tokens,
                        output_tokens=real_completion_tokens,
                    )

                if run_tree is not None:
                    run_tree.add_outputs({"response": full_reply})
                    run_tree.add_metadata(
                        {
                            "tokens_real": real_usage_total,
                            "tokens_estimated": estimated_tokens,
                            "tokens_recorded": tokens_used,
                            "tokens_source": "real" if real_usage_total else "estimate",
                            "provider": usage_provider,
                            "model": usage_model,
                            "cost_usd": str(cost_usd) if cost_usd is not None else None,
                        }
                    )

            # Persist assistant reply and token usage. Prefer real usage when the
            # provider exposed it (OpenAI/Anthropic/OpenRouter); fall back to the
            # estimate for providers that don't stream usage (Ollama).
            await self._session_repo.save_message(session_id, "assistant", full_reply)
            await self._session_repo.add_token_usage(
                session_id,
                tokens_used,
                budget_key,
                provider=usage_provider,
                model=usage_model,
                input_tokens=real_prompt_tokens or None,
                output_tokens=real_completion_tokens or None,
                cost_usd=cost_usd,
            )

            log.info(
                "chat.stream.complete",
                session_id=session_id,
                run_id=str(run_id),
                tokens_real=real_usage_total,
                tokens_estimated=estimated_tokens,
                tokens_recorded=tokens_used,
                source="real" if real_usage_total else "estimate",
                provider=usage_provider,
                model=usage_model,
                cost_usd=str(cost_usd) if cost_usd is not None else None,
            )

            # Background: budget threshold notifications (registered users only)
            if not is_guest:
                asyncio.ensure_future(
                    check_budget_thresholds(self._session_repo._pool, budget_key, user.email)
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
            log.error("chat.stream.error", error=str(exc), run_id=str(run_id))
            yield f"data: Error: {exc}\n\n"
