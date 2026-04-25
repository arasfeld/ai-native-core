# Phase 12 — Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the backend from router-level orchestration to a clean 3-layer architecture (Router → Service → Repository), wire the existing tool registry into a working tool-calling agent loop, add per-feature runtime AI config, fix RAG connection pooling, isolate SaaS schema, and restructure the web frontend to feature-based modules.

**Architecture:** New `services/` and `repositories/` directories in `apps/server/src/api/` hold pure-Python business logic. The chat router delegates entirely to `ChatService`, which uses `ContextService` + `AgentFactory`. Tool calling is implemented as a manual loop in `ChatAgent.stream()` that executes registered tools and re-invokes the LLM until no more tool calls remain.

**Tech Stack:** FastAPI, asyncpg, LangGraph, LangChain tools, LLMResponse (internal), better-auth, Drizzle ORM, Next.js App Router, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-04-25-phase-12-architecture-design.md`

---

## File Map

### New files (create)
| File | Responsibility |
|---|---|
| `apps/server/src/api/repositories/__init__.py` | Package init |
| `apps/server/src/api/repositories/session_repository.py` | Session/token data access |
| `apps/server/src/api/services/__init__.py` | Package init |
| `apps/server/src/api/services/context_service.py` | Assemble message context (memory + location) |
| `apps/server/src/api/services/chat_service.py` | Orchestrate full chat turn |
| `apps/server/src/api/agent_factory.py` | Build correct agent for request |
| `apps/server/src/api/routers/admin.py` | `GET/PUT /admin/ai-config` endpoints |
| `apps/server/tests/__init__.py` | Test package |
| `apps/server/tests/conftest.py` | Shared test fixtures |
| `apps/server/tests/test_session_repository.py` | Repository unit tests |
| `apps/server/tests/test_context_service.py` | Service unit tests |
| `apps/server/tests/test_chat_service.py` | Service unit tests |
| `packages/db/src/schema/saas.ts` | Optional SaaS tables (tenants, billing) |
| `apps/web/src/features/chat/index.ts` | Chat feature exports |
| `apps/web/src/features/chat/components/ChatInterface.tsx` | Feature-wrapped Chat UI |
| `apps/web/src/features/auth/index.ts` | Auth feature exports |
| `apps/web/src/features/auth/components/LoginPage.tsx` | Feature-wrapped login |
| `apps/web/src/features/auth/components/RegisterPage.tsx` | Feature-wrapped register |
| `apps/web/src/features/billing/index.ts` | Billing feature exports |
| `apps/web/src/features/billing/components/BillingPage.tsx` | Feature-wrapped billing |

### Modified files
| File | Change |
|---|---|
| `services/ai/src/ai/base.py` | Add `tool_calls` to `LLMResponse`; add `bind_tools` + `tool_calls` to `Message` |
| `services/ai/src/ai/factory.py` | Add `create_llm(provider, model)` for per-feature instantiation |
| `services/ai/src/ai/utils.py` | Update `messages_to_dicts` to handle tool call/result messages |
| `services/ai/src/ai/providers/openai.py` | Add `bind_tools`, update `chat()` to return tool calls |
| `services/ai/src/ai/providers/anthropic.py` | Add `bind_tools`, update `chat()` + `_split_messages()` for tool calls |
| `services/ai/src/ai/providers/ollama.py` | Add stub `bind_tools` (raises `NotImplementedError`) |
| `services/ai/src/ai/providers/openrouter.py` | Add stub `bind_tools` (raises `NotImplementedError`) |
| `services/agents/src/agents/chat_agent.py` | Add `tools` param; implement tool-calling loop in `stream()` |
| `services/rag/src/rag/retriever.py` | Accept `asyncpg.Pool`; use pool instead of per-call connections |
| `apps/server/src/api/main.py` | Load ai_feature_configs; create AgentFactory; wire new services |
| `apps/server/src/api/routers/chat.py` | Thin down to ~30 lines; delegate to `ChatService` |
| `packages/db/src/schema/app.ts` | Remove `tenants`; add `aiFeatureConfigs` table |
| `packages/db/src/schema.ts` | Add `export * from "./schema/saas"` |
| `apps/web/src/app/page.tsx` | Import `ChatInterface` from `features/chat` |
| `apps/web/src/app/login/page.tsx` | Import `LoginPage` from `features/auth` |
| `apps/web/src/app/register/page.tsx` | Import `RegisterPage` from `features/auth` |
| `apps/web/src/app/billing/page.tsx` | Import `BillingPage` from `features/billing` |

---

## Task 1: Session Repository

**Files:**
- Create: `apps/server/src/api/repositories/__init__.py`
- Create: `apps/server/src/api/repositories/session_repository.py`
- Create: `apps/server/tests/__init__.py`
- Create: `apps/server/tests/conftest.py`
- Create: `apps/server/tests/test_session_repository.py`

- [ ] **Step 1.1: Write the failing tests**

Create `apps/server/tests/__init__.py` (empty) and `apps/server/tests/conftest.py`:

```python
# apps/server/tests/conftest.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from ai import LLMResponse
from langchain_core.messages import HumanMessage, AIMessage


@pytest.fixture
def mock_store():
    store = AsyncMock()
    store.get_messages = AsyncMock(return_value=[
        HumanMessage(content="hello"),
        AIMessage(content="hi there"),
    ])
    store.add_message = AsyncMock()
    store.add_token_usage = AsyncMock()
    store.get_token_usage = AsyncMock(return_value=0)
    return store


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"token_limit": 50_000})
    return pool


@pytest.fixture
def mock_llm():
    llm = AsyncMock()
    llm.chat = AsyncMock(return_value=LLMResponse(content="Mock response."))
    llm.bind_tools = MagicMock(return_value=None)

    async def _stream(*args, **kwargs):
        for token in ["Mock", " response", "."]:
            yield token

    llm.stream = _stream
    return llm
```

Create `apps/server/tests/test_session_repository.py`:

```python
import pytest
from unittest.mock import AsyncMock
from memory import BudgetExceeded


@pytest.mark.asyncio
async def test_scope_session_id():
    from api.repositories.session_repository import SessionRepository
    assert SessionRepository.scope("user-1", "chat") == "user-1:chat"


@pytest.mark.asyncio
async def test_get_messages_delegates_to_store(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository
    repo = SessionRepository(store=mock_store, pool=mock_pool)
    msgs = await repo.get_messages("user-1:default")
    mock_store.get_messages.assert_called_once_with("user-1:default")
    assert len(msgs) == 2


@pytest.mark.asyncio
async def test_get_token_limit_returns_tenant_value(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository
    repo = SessionRepository(store=mock_store, pool=mock_pool)
    limit = await repo.get_token_limit("user-1")
    assert limit == 50_000


@pytest.mark.asyncio
async def test_get_token_limit_fallback_when_no_tenant(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository
    mock_pool.fetchrow = AsyncMock(return_value=None)
    repo = SessionRepository(store=mock_store, pool=mock_pool, default_limit=100_000)
    limit = await repo.get_token_limit("unknown-user")
    assert limit == 100_000


@pytest.mark.asyncio
async def test_check_budget_raises_when_exceeded(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository
    mock_store.get_token_usage = AsyncMock(return_value=60_000)  # Over 50k limit
    repo = SessionRepository(store=mock_store, pool=mock_pool)
    with pytest.raises(BudgetExceeded):
        await repo.check_budget("user-1:default", "user-1")
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /Users/adam/Code/arasfeld/ai-native-core
uv run pytest apps/server/tests/test_session_repository.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'api.repositories'`

- [ ] **Step 1.3: Create the repository package**

Create `apps/server/src/api/repositories/__init__.py` (empty).

Create `apps/server/src/api/repositories/session_repository.py`:

```python
"""Session data access — wraps SessionStore and token budget logic."""
from __future__ import annotations

import asyncpg
from langchain_core.messages import BaseMessage
from memory import BudgetExceeded, SessionStore, TokenBudget


class SessionRepository:
    """All session-related data access. SQL and token budget logic lives here."""

    def __init__(
        self,
        store: SessionStore,
        pool: asyncpg.Pool,
        default_limit: int = 100_000,
    ) -> None:
        self._store = store
        self._pool = pool
        self._default_limit = default_limit

    @staticmethod
    def scope(user_id: str, session_id: str) -> str:
        """Return a user-scoped session ID string."""
        return f"{user_id}:{session_id}"

    async def get_messages(self, session_id: str) -> list[BaseMessage]:
        return await self._store.get_messages(session_id)

    async def save_message(self, session_id: str, role: str, content) -> None:
        await self._store.add_message(session_id, role, content)

    async def add_token_usage(
        self, session_id: str, tokens: int, tenant_id: str
    ) -> None:
        await self._store.add_token_usage(session_id, tokens, tenant_id=tenant_id)

    async def get_token_limit(self, user_id: str) -> int:
        row = await self._pool.fetchrow(
            "SELECT token_limit FROM tenants WHERE id = $1", user_id
        )
        return row["token_limit"] if row else self._default_limit

    async def check_budget(self, session_id: str, user_id: str) -> None:
        """Raise BudgetExceeded if the session has consumed its token budget."""
        limit = await self.get_token_limit(user_id)
        budget = TokenBudget(self._store, limit=limit)
        await budget.check(session_id)
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
uv run pytest apps/server/tests/test_session_repository.py -v
```

Expected: 5 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add apps/server/src/api/repositories/ apps/server/tests/
git commit -m "feat: add SessionRepository and server test scaffolding"
```

---

## Task 2: Context Service

**Files:**
- Create: `apps/server/src/api/services/__init__.py`
- Create: `apps/server/src/api/services/context_service.py`
- Create: `apps/server/tests/test_context_service.py`

- [ ] **Step 2.1: Write the failing tests**

Create `apps/server/tests/test_context_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from dataclasses import dataclass


@dataclass
class FakeFact:
    content: str
    session_id: str | None = None
    score: float = 0.9


@pytest.fixture
def mock_episodic():
    e = AsyncMock()
    e.search = AsyncMock(return_value=[FakeFact("User likes brevity.")])
    return e


@pytest.fixture
def mock_compressor():
    c = AsyncMock()
    c.compress = AsyncMock(side_effect=lambda msgs: msgs)  # pass-through
    return c


@pytest.mark.asyncio
async def test_build_returns_history_with_user_message(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    messages = await svc.build(
        message="hello", session_id="user-1:default"
    )

    # History (2 msgs) + episodic system message
    assert any(isinstance(m, SystemMessage) for m in messages)


@pytest.mark.asyncio
async def test_build_injects_location_system_message(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    with patch("api.services.context_service.get_location_context", new=AsyncMock(
        return_value="User is in Brooklyn, NY.\nWeather: 65°F, clear."
    )):
        messages = await svc.build(
            message="what's the weather?",
            session_id="user-1:default",
            lat=40.6782,
            lng=-73.9442,
        )

    system_messages = [m for m in messages if isinstance(m, SystemMessage)]
    location_msgs = [m for m in system_messages if "location" in m.content.lower()]
    assert len(location_msgs) == 1


@pytest.mark.asyncio
async def test_build_returns_location_place(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    with patch("api.services.context_service.get_location_context", new=AsyncMock(
        return_value="User is in Brooklyn, NY.\nWeather: 65°F, clear."
    )):
        _, place = await svc.build(
            message="hello", session_id="user-1:default",
            lat=40.6782, lng=-73.9442,
        )

    assert place == "Brooklyn, NY"


@pytest.mark.asyncio
async def test_build_without_location_returns_none_place(
    mock_store, mock_pool, mock_episodic, mock_compressor
):
    from api.repositories.session_repository import SessionRepository
    from api.services.context_service import ContextService

    repo = SessionRepository(store=mock_store, pool=mock_pool)
    svc = ContextService(session_repo=repo, compressor=mock_compressor, episodic=mock_episodic)

    _, place = await svc.build(message="hello", session_id="user-1:default")
    assert place is None
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
uv run pytest apps/server/tests/test_context_service.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'api.services'`

- [ ] **Step 2.3: Create Context Service**

Create `apps/server/src/api/services/__init__.py` (empty).

Create `apps/server/src/api/services/context_service.py`:

```python
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
                SystemMessage(
                    content=f"Relevant facts from previous conversations:\n{facts_text}"
                ),
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
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
uv run pytest apps/server/tests/test_context_service.py -v
```

Expected: 4 tests PASS

- [ ] **Step 2.5: Commit**

```bash
git add apps/server/src/api/services/ apps/server/tests/test_context_service.py
git commit -m "feat: add ContextService for session + memory + location assembly"
```

---

## Task 3: Agent Factory

**Files:**
- Create: `apps/server/src/api/agent_factory.py`

- [ ] **Step 3.1: Create Agent Factory**

Create `apps/server/src/api/agent_factory.py`:

```python
"""Agent Factory — builds the appropriate LangGraph agent for each request."""
from __future__ import annotations

from agents import build_chat_graph, build_rag_graph
from ai import get_llm
from rag import PgVectorRetriever
from tools import registry


class AgentFactory:
    """Builds the right agent for the request type.

    Centralises agent construction so the chat service doesn't need to know
    which agent class or provider to use.
    """

    def __init__(self, retriever: PgVectorRetriever) -> None:
        self._retriever = retriever

    def build(self, use_rag: bool = False, system_prompt: str = ""):
        """Return a ready-to-stream agent."""
        if use_rag:
            return build_rag_graph(llm=get_llm())
        tools = registry.get_all()
        return build_chat_graph(llm=get_llm(), system_prompt=system_prompt, tools=tools)
```

Note: `tools` parameter added to `build_chat_graph` is implemented in Task 9. For now, `get_all()` returns the existing registered tools — the agent just ignores them until Task 9.

- [ ] **Step 3.2: Confirm the factory is importable**

```bash
cd /Users/adam/Code/arasfeld/ai-native-core
uv run python -c "from apps.server.src.api.agent_factory import AgentFactory; print('OK')" 2>&1 || \
uv run python -c "import sys; sys.path.insert(0, 'apps/server/src'); from api.agent_factory import AgentFactory; print('OK')"
```

Expected: `OK` (or import works without errors in the server context)

- [ ] **Step 3.3: Commit**

```bash
git add apps/server/src/api/agent_factory.py
git commit -m "feat: add AgentFactory to centralise agent construction"
```

---

## Task 4: Chat Service

**Files:**
- Create: `apps/server/src/api/services/chat_service.py`
- Create: `apps/server/tests/test_chat_service.py`

- [ ] **Step 4.1: Write the failing tests**

Create `apps/server/tests/test_chat_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.messages import HumanMessage, AIMessage
from pydantic import BaseModel


class FakeUser:
    id = "user-1"
    email = "test@example.com"


class FakeRequest:
    message = "hello"
    session_id = "default"
    use_rag = False
    system_prompt = ""
    lat = None
    lng = None


@pytest.fixture
def mock_context_service():
    svc = AsyncMock()
    svc.build = AsyncMock(return_value=(
        [HumanMessage(content="hello")],  # context messages
        None,  # no location place
    ))
    return svc


@pytest.fixture
def mock_session_repo(mock_store, mock_pool):
    from api.repositories.session_repository import SessionRepository
    return SessionRepository(store=mock_store, pool=mock_pool)


@pytest.fixture
def mock_agent():
    agent = MagicMock()

    async def fake_stream(state):
        yield "hello"
        yield " world"

    agent.stream = fake_stream
    return agent


@pytest.fixture
def mock_agent_factory(mock_agent):
    factory = MagicMock()
    factory.build = MagicMock(return_value=mock_agent)
    return factory


@pytest.mark.asyncio
async def test_stream_yields_tokens(
    mock_context_service, mock_session_repo, mock_agent_factory
):
    from api.services.chat_service import ChatService

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=mock_agent_factory,
        session_repo=mock_session_repo,
    )

    tokens = []
    async for token in svc.stream(FakeRequest(), FakeUser()):
        if not token.startswith("data:"):
            continue
        tokens.append(token)

    assert any("hello" in t for t in tokens)
    assert any("world" in t for t in tokens)


@pytest.mark.asyncio
async def test_stream_saves_message_after_done(
    mock_context_service, mock_session_repo, mock_agent_factory, mock_store
):
    from api.services.chat_service import ChatService

    svc = ChatService(
        context_service=mock_context_service,
        agent_factory=mock_agent_factory,
        session_repo=mock_session_repo,
    )

    async for _ in svc.stream(FakeRequest(), FakeUser()):
        pass

    # Saves user message + assistant reply
    assert mock_store.add_message.call_count == 2
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
uv run pytest apps/server/tests/test_chat_service.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'api.services.chat_service'`

- [ ] **Step 4.3: Create Chat Service**

Create `apps/server/src/api/services/chat_service.py`:

```python
"""Chat Service — orchestrates a complete streaming chat turn."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import structlog
from langchain_core.messages import HumanMessage
from memory import MemoryExtractor, estimate_tokens

from ..agent_factory import AgentFactory
from ..auth.deps import AuthUser
from ..repositories.session_repository import SessionRepository
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
        self, request: Any, user: AuthUser
    ) -> AsyncIterator[str]:
        """Stream SSE tokens for a chat turn.

        Yields lines in SSE format: ``data: <token>\\n\\n``
        Terminates with ``data: [DONE]\\n\\n``
        """
        session_id = SessionRepository.scope(user.id, request.session_id)

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
            log.info("chat.stream.start", session_id=session_id, user_id=user.id)
            async for token in agent.stream(state):
                accumulated.append(token)
                yield f"data: {token}\n\n"

            full_reply = "".join(accumulated)

            # Persist assistant reply and token usage
            await self._session_repo.save_message(session_id, "assistant", full_reply)
            tokens_used = estimate_tokens(request.message) + estimate_tokens(full_reply)
            await self._session_repo.add_token_usage(session_id, tokens_used, user.id)

            # Background: extract long-term memories
            if self._extractor:
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
```

- [ ] **Step 4.4: Run tests to confirm they pass**

```bash
uv run pytest apps/server/tests/test_chat_service.py -v
```

Expected: 2 tests PASS

- [ ] **Step 4.5: Commit**

```bash
git add apps/server/src/api/services/chat_service.py apps/server/tests/test_chat_service.py
git commit -m "feat: add ChatService to orchestrate streaming chat turns"
```

---

## Task 5: Thin Chat Router

**Files:**
- Modify: `apps/server/src/api/routers/chat.py`
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 5.1: Rewrite chat.py as a thin router**

Replace the entire contents of `apps/server/src/api/routers/chat.py` with:

```python
"""Chat router — thin HTTP adapter. All orchestration is in ChatService."""
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import CurrentUser
from ..services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str | list[dict[str, Any]]
    session_id: str = "default"
    use_rag: bool = False
    system_prompt: str = ""
    lat: float | None = None
    lng: float | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


ChatServiceDep = Depends(get_chat_service)


@router.post("")
async def chat(
    req: ChatRequest,
    current_user: CurrentUser,
    chat_service: ChatService = ChatServiceDep,
) -> StreamingResponse:
    """Stream a chat response via Server-Sent Events."""
    return StreamingResponse(
        chat_service.stream(req, current_user),
        media_type="text/event-stream",
    )
```

- [ ] **Step 5.2: Wire services in main.py lifespan**

In `apps/server/src/api/main.py`, add imports and update the lifespan:

Add at the top (after existing imports):
```python
from .agent_factory import AgentFactory
from .repositories.session_repository import SessionRepository
from .services.chat_service import ChatService
from .services.context_service import ContextService
from .routers import admin
```

Update the lifespan block. Replace everything from `store = SessionStore(pool=pool)` through `app.state.extractor = ...` with:

```python
    store = SessionStore(pool=pool)
    await store.ensure_table()

    llm = get_llm()
    retriever = PgVectorRetriever(llm=llm, pool=pool, embedding_dim=settings.embedding_dim)
    await retriever.ensure_table()

    episodic = EpisodicStore(llm=llm, pool=pool, embedding_dim=settings.embedding_dim)
    await episodic.ensure_table()

    extractor = MemoryExtractor(llm=llm, episodic=episodic)
    compressor = SummaryCompressor(llm=llm)

    session_repo = SessionRepository(
        store=store, pool=pool, default_limit=settings.session_token_budget
    )
    context_service = ContextService(
        session_repo=session_repo, compressor=compressor, episodic=episodic
    )
    agent_factory = AgentFactory(retriever=retriever)
    chat_service = ChatService(
        context_service=context_service,
        agent_factory=agent_factory,
        session_repo=session_repo,
        extractor=extractor,
    )

    app.state.db_pool = pool
    app.state.chat_service = chat_service
    app.state.retriever = retriever   # still used by ingest router
```

Also add `admin` router registration after the existing `app.include_router(media.router)` line:
```python
app.include_router(admin.router)
```

- [ ] **Step 5.3: Verify the server still starts**

```bash
cd /Users/adam/Code/arasfeld/ai-native-core
uv run uvicorn api.main:app --app-dir apps/server/src --port 8001 &
sleep 3
curl -s http://localhost:8001/health | python3 -m json.tool
kill %1
```

Expected: `{"status": "ok", "version": "0.1.0"}` (or similar health response)

- [ ] **Step 5.4: Run the golden-answer eval suite**

```bash
RUN_EVALS=1 uv run pytest services/agents/tests/evals/ -v --tb=short 2>&1 | tail -20
```

Expected: eval suite passes with ≥80% score (same as before refactor)

- [ ] **Step 5.5: Commit**

```bash
git add apps/server/src/api/routers/chat.py apps/server/src/api/main.py
git commit -m "refactor: thin chat router delegates to ChatService"
```

---

## Task 6: Runtime AI Config — Schema & Migration

**Files:**
- Modify: `packages/db/src/schema/app.ts`
- Create: `packages/db/src/schema/saas.ts`
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0002_ai_feature_configs_saas.sql`

- [ ] **Step 6.1: Create saas.ts with the tenants table**

Create `packages/db/src/schema/saas.ts`:

```typescript
/**
 * Optional SaaS Module
 *
 * Contains tables for multi-tenancy, token budgeting, and Stripe billing.
 * These are NOT required for core AI functionality.
 *
 * To strip SaaS features from a fork:
 *   1. Delete this file
 *   2. Delete apps/server/src/api/routers/billing.py
 *   3. Remove check_budget calls from ContextService / SessionRepository
 *   4. Remove `export * from "./schema/saas"` from schema.ts
 */
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(), // Keyed by better-auth user ID
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"), // "free" | "pro"
  tokenLimit: integer("token_limit").notNull().default(100_000),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 6.2: Update app.ts — remove tenants, add ai_feature_configs**

Edit `packages/db/src/schema/app.ts`. Replace the `tenants` table export with `aiFeatureConfigs`:

```typescript
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

// Runtime AI configuration — one row per feature, updated without redeployment.
export const aiFeatureConfigs = pgTable("ai_feature_configs", {
  feature: text("feature").primaryKey(), // 'chat' | 'rag' | 'embeddings' | 'image_gen' | 'memory'
  provider: text("provider").notNull(), // 'ollama' | 'openai' | 'anthropic' | 'openrouter'
  model: text("model"), // null = provider default
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memoryEntries = pgTable("memory_entries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").notNull().default({}),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
```

- [ ] **Step 6.3: Update schema.ts to include saas**

Edit `packages/db/src/schema.ts`:

```typescript
// Re-export all schema tables from split files
export * from "./schema/app";
export * from "./schema/auth";
export * from "./schema/saas";
```

- [ ] **Step 6.4: Create the SQL migration**

Create `packages/db/migrations/0002_ai_feature_configs_saas.sql`:

```sql
-- Phase 12: Runtime AI config table + separate SaaS tables file
-- The tenants table stays unchanged (already created in 0000_setup.sql).
-- This migration only adds ai_feature_configs.

CREATE TABLE IF NOT EXISTS ai_feature_configs (
    feature     TEXT        PRIMARY KEY,
    provider    TEXT        NOT NULL DEFAULT 'ollama',
    model       TEXT,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default configs (all use env-var provider as default)
INSERT INTO ai_feature_configs (feature, provider) VALUES
    ('chat',        'ollama'),
    ('rag',         'ollama'),
    ('embeddings',  'ollama'),
    ('image_gen',   'openai'),
    ('memory',      'ollama')
ON CONFLICT (feature) DO NOTHING;
```

- [ ] **Step 6.5: Verify TypeScript types compile**

```bash
pnpm --filter @repo/db check-types 2>&1 | tail -10
```

Expected: no errors

- [ ] **Step 6.6: Commit**

```bash
git add packages/db/src/schema/ packages/db/migrations/0002_ai_feature_configs_saas.sql
git commit -m "feat: add ai_feature_configs table; isolate tenants to saas.ts"
```

---

## Task 7: Per-Feature LLM Factory + Admin Endpoints

**Files:**
- Modify: `services/ai/src/ai/factory.py`
- Create: `apps/server/src/api/routers/admin.py`
- Modify: `apps/server/src/api/main.py`
- Modify: `apps/server/src/api/agent_factory.py`

- [ ] **Step 7.1: Add `create_llm` to factory.py**

Edit `services/ai/src/ai/factory.py`. Add `create_llm` below `get_llm`:

```python
import os

from .base import BaseLLM

_instance: BaseLLM | None = None


def get_llm() -> BaseLLM:
    """Return the shared LLM provider instance (singleton, configured via LLM_PROVIDER env var)."""
    global _instance
    if _instance is None:
        _instance = create_llm()
    return _instance


def create_llm(
    provider: str | None = None,
    model: str | None = None,
) -> BaseLLM:
    """Create a fresh LLM provider instance (not cached).

    Args:
        provider: One of 'openai', 'anthropic', 'openrouter', 'ollama'.
                  Defaults to LLM_PROVIDER env var.
        model: Override the model name. None uses provider default.
    """
    _provider = (provider or os.environ.get("LLM_PROVIDER", "ollama")).lower()
    return _create_llm(_provider, model)


def _create_llm(provider: str, model: str | None = None) -> BaseLLM:
    match provider:
        case "openai":
            from .providers.openai import OpenAIProvider
            p = OpenAIProvider()
            if model:
                p.model = model
            return p
        case "anthropic":
            from .providers.anthropic import AnthropicProvider
            p = AnthropicProvider()
            if model:
                p.model = model
            return p
        case "openrouter":
            from .providers.openrouter import OpenRouterProvider
            p = OpenRouterProvider()
            if model:
                p.model = model
            return p
        case "ollama":
            from .providers.ollama import OllamaProvider
            p = OllamaProvider()
            if model:
                p.model = model
            return p
        case _:
            raise ValueError(
                f"Unknown LLM provider: '{provider}'. "
                "Choose from: openai, anthropic, openrouter, ollama"
            )
```

- [ ] **Step 7.2: Create admin router**

Create `apps/server/src/api/routers/admin.py`:

```python
"""Admin router — runtime AI configuration management."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..auth import CurrentUser

router = APIRouter(prefix="/admin", tags=["admin"])


class AIFeatureConfig(BaseModel):
    feature: str
    provider: str
    model: str | None = None
    enabled: bool = True


class AIConfigUpdate(BaseModel):
    provider: str
    model: str | None = None
    enabled: bool = True


@router.get("/ai-config")
async def get_ai_config(
    request: Request,
    _current_user: CurrentUser,
) -> dict[str, AIFeatureConfig]:
    """Return current AI feature configuration."""
    return request.app.state.ai_config


@router.put("/ai-config/{feature}")
async def update_ai_config(
    feature: str,
    update: AIConfigUpdate,
    request: Request,
    current_user: CurrentUser,
) -> AIFeatureConfig:
    """Update a feature's AI config and refresh in-memory state."""
    pool = request.app.state.db_pool

    row = await pool.fetchrow(
        "SELECT feature FROM ai_feature_configs WHERE feature = $1", feature
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Feature '{feature}' not found")

    await pool.execute(
        """
        UPDATE ai_feature_configs
        SET provider = $1, model = $2, enabled = $3, updated_at = NOW()
        WHERE feature = $4
        """,
        update.provider,
        update.model,
        update.enabled,
        feature,
    )

    # Refresh in-memory config
    updated = AIFeatureConfig(
        feature=feature,
        provider=update.provider,
        model=update.model,
        enabled=update.enabled,
    )
    request.app.state.ai_config[feature] = updated
    return updated
```

- [ ] **Step 7.3: Load ai_feature_configs at startup and update AgentFactory**

In `apps/server/src/api/main.py`, add after pool creation in the lifespan:

```python
    # Load runtime AI config from DB
    config_rows = await pool.fetch("SELECT * FROM ai_feature_configs")
    ai_config = {
        row["feature"]: {
            "feature": row["feature"],
            "provider": row["provider"],
            "model": row["model"],
            "enabled": row["enabled"],
        }
        for row in config_rows
    }
    app.state.ai_config = ai_config
```

Update `AgentFactory` in `apps/server/src/api/agent_factory.py` to use per-feature config:

```python
"""Agent Factory — builds the appropriate LangGraph agent for each request."""
from __future__ import annotations

from agents import build_chat_graph, build_rag_graph
from ai import create_llm, get_llm
from rag import PgVectorRetriever
from tools import registry


class AgentFactory:
    def __init__(
        self,
        retriever: PgVectorRetriever,
        ai_config: dict | None = None,
    ) -> None:
        self._retriever = retriever
        self._ai_config = ai_config or {}

    def _get_llm(self, feature: str):
        cfg = self._ai_config.get(feature)
        if cfg and cfg.get("enabled", True):
            return create_llm(provider=cfg.get("provider"), model=cfg.get("model"))
        return get_llm()  # fallback to singleton

    def build(self, use_rag: bool = False, system_prompt: str = ""):
        if use_rag:
            return build_rag_graph(llm=self._get_llm("rag"))
        tools = registry.get_all()
        return build_chat_graph(
            llm=self._get_llm("chat"), system_prompt=system_prompt, tools=tools
        )
```

Update the `AgentFactory` construction in `main.py` lifespan to pass `ai_config`:
```python
    agent_factory = AgentFactory(retriever=retriever, ai_config=ai_config)
```

- [ ] **Step 7.4: Test the admin endpoints**

Start the server and verify:

```bash
uv run uvicorn api.main:app --app-dir apps/server/src --port 8001 &
sleep 3

# Should return the config map (requires auth token in real use; test with dev session)
curl -s http://localhost:8001/admin/ai-config | python3 -m json.tool

kill %1
```

Expected: JSON object with keys `chat`, `rag`, `embeddings`, etc.

- [ ] **Step 7.5: Commit**

```bash
git add services/ai/src/ai/factory.py apps/server/src/api/routers/admin.py apps/server/src/api/agent_factory.py apps/server/src/api/main.py
git commit -m "feat: per-feature LLM factory and runtime AI config admin endpoints"
```

---

## Task 8: bind_tools in LLMResponse, Message, and Providers

**Files:**
- Modify: `services/ai/src/ai/base.py`
- Modify: `services/ai/src/ai/utils.py`
- Modify: `services/ai/src/ai/providers/openai.py`
- Modify: `services/ai/src/ai/providers/anthropic.py`
- Modify: `services/ai/src/ai/providers/ollama.py`
- Modify: `services/ai/src/ai/providers/openrouter.py`

- [ ] **Step 8.1: Write a failing test for bind_tools**

Add to `services/agents/tests/test_tool_calling.py` (create new file):

```python
"""Tests for tool-calling infrastructure in BaseLLM providers."""
import pytest
from unittest.mock import AsyncMock
from langchain_core.tools import tool


@tool
def get_weather(location: str) -> str:
    """Get the weather for a location."""
    return f"72°F and sunny in {location}"


def test_llmresponse_has_tool_calls_field():
    from ai import LLMResponse
    r = LLMResponse(content="", tool_calls=[{"name": "get_weather", "args": {"location": "NYC"}, "id": "call_1"}])
    assert r.tool_calls is not None
    assert r.tool_calls[0]["name"] == "get_weather"


def test_message_has_tool_calls_field():
    from ai.base import Message
    m = Message(
        role="assistant",
        content="",
        tool_calls=[{"name": "get_weather", "args": {"location": "NYC"}, "id": "call_1"}],
    )
    assert m.tool_calls[0]["name"] == "get_weather"


def test_messages_to_dicts_serialises_tool_calls():
    from ai.base import Message
    from ai.utils import messages_to_dicts
    msg = Message(
        role="assistant",
        content="",
        tool_calls=[{"name": "get_weather", "args": {"location": "NYC"}, "id": "call_1"}],
    )
    dicts = messages_to_dicts([msg])
    assert dicts[0]["role"] == "assistant"
    assert "tool_calls" in dicts[0]
    # OpenAI wire format
    assert dicts[0]["tool_calls"][0]["function"]["name"] == "get_weather"


def test_messages_to_dicts_serialises_tool_result():
    from ai.base import Message
    from ai.utils import messages_to_dicts
    msg = Message(role="tool", content="72°F", tool_call_id="call_1", name="get_weather")
    dicts = messages_to_dicts([msg])
    assert dicts[0]["role"] == "tool"
    assert dicts[0]["tool_call_id"] == "call_1"
```

- [ ] **Step 8.2: Run test to confirm failure**

```bash
uv run pytest services/agents/tests/test_tool_calling.py -v 2>&1 | head -30
```

Expected: `AssertionError` or attribute errors on `LLMResponse` / `Message`

- [ ] **Step 8.3: Update base.py**

Edit `services/ai/src/ai/base.py`:

```python
from collections.abc import AsyncIterator
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel


class Message(BaseModel):
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str | list[dict[str, Any]]
    tool_call_id: str | None = None  # for role="tool" messages
    name: str | None = None           # tool name for role="tool" messages
    tool_calls: list[dict[str, Any]] | None = None  # for role="assistant" with tool calls


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    content: str
    usage: Usage | None = None
    model: str | None = None
    tool_calls: list[dict[str, Any]] | None = None  # populated when LLM requests tool calls


@runtime_checkable
class BaseLLM(Protocol):
    """Protocol defining the interface for all LLM providers."""

    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        """Send messages and return a complete response."""
        ...

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        """Send messages and stream response tokens."""
        ...

    async def embed(self, text: str) -> list[float]:
        """Embed text and return a vector."""
        ...

    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str:
        """Transcribe audio bytes to text. Raises NotImplementedError if unsupported."""
        ...

    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]:
        """Stream TTS audio bytes. Raises NotImplementedError if unsupported."""
        ...

    def bind_tools(self, tools: list) -> "BaseLLM":
        """Return a copy of this provider with tools bound for function calling.

        Raises NotImplementedError for providers that don't support tool calling.
        Each tool in the list must be a langchain_core.tools.BaseTool instance.
        """
        ...
```

- [ ] **Step 8.4: Update messages_to_dicts in utils.py**

Edit `services/ai/src/ai/utils.py`:

```python
"""Shared utilities for OpenAI-compatible providers."""
import json

from .base import Message, Usage


def messages_to_dicts(messages: list[Message] | list[dict]) -> list[dict]:
    """Convert Message objects to OpenAI-compatible dict format.

    Handles tool call messages (assistant with tool_calls) and tool result
    messages (role="tool") in OpenAI wire format.
    """
    result = []
    for m in messages:
        if isinstance(m, dict):
            result.append(m)
            continue

        d: dict = {"role": m.role}

        # Content: can be None for pure tool-call messages from assistant
        if m.content or not m.tool_calls:
            d["content"] = m.content
        else:
            d["content"] = None

        # Assistant tool calls → OpenAI function format
        if m.tool_calls:
            d["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["args"]),
                    },
                }
                for tc in m.tool_calls
            ]

        # Tool result message fields
        if m.tool_call_id:
            d["tool_call_id"] = m.tool_call_id
        if m.name:
            d["name"] = m.name

        result.append(d)
    return result


def parse_openai_usage(response) -> Usage | None:
    """Parse usage metrics from an OpenAI-compatible chat completion response."""
    if not response.usage:
        return None
    return Usage(
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        total_tokens=response.usage.total_tokens,
    )
```

- [ ] **Step 8.5: Update OpenAI provider**

In `services/ai/src/ai/providers/openai.py`, add `_openai_tools` to `__init__` and update `chat()`:

In `__init__`, add at the end:
```python
        self._openai_tools: list[dict] | None = None
```

Add `bind_tools` method:
```python
    def bind_tools(self, tools: list) -> "OpenAIProvider":
        """Return a copy of this provider with OpenAI function-calling tools bound."""
        import copy
        clone = copy.copy(self)
        clone._openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": (
                        t.args_schema.model_json_schema()
                        if t.args_schema
                        else {"type": "object", "properties": {}}
                    ),
                },
            }
            for t in tools
        ]
        return clone
```

Update `chat()` method to pass tools and parse tool calls:
```python
    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        import json as _json
        params = {**kwargs}
        if self._openai_tools:
            params["tools"] = self._openai_tools

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages_to_dicts(messages),
            **params,
        )
        msg = response.choices[0].message

        tool_calls = None
        if msg.tool_calls:
            tool_calls = [
                {
                    "name": tc.function.name,
                    "args": _json.loads(tc.function.arguments),
                    "id": tc.id,
                }
                for tc in msg.tool_calls
            ]

        return LLMResponse(
            content=msg.content or "",
            usage=parse_openai_usage(response),
            model=response.model,
            tool_calls=tool_calls,
        )
```

- [ ] **Step 8.6: Update Anthropic provider**

In `services/ai/src/ai/providers/anthropic.py`, add `_anthropic_tools` to `__init__`:
```python
        self._anthropic_tools: list[dict] | None = None
```

Add `bind_tools` method:
```python
    def bind_tools(self, tools: list) -> "AnthropicProvider":
        """Return a copy with Anthropic tool_use schema bound."""
        import copy
        clone = copy.copy(self)
        clone._anthropic_tools = [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": (
                    t.args_schema.model_json_schema()
                    if t.args_schema
                    else {"type": "object"}
                ),
            }
            for t in tools
        ]
        return clone
```

Update `_split_messages` to handle tool call / tool result messages:
```python
    def _split_messages(self, messages: list[Message]) -> tuple[str | None, list[dict]]:
        """Anthropic separates system prompt from user/assistant turns.
        
        Also converts tool call / tool result messages to Anthropic format.
        """
        system_parts = []
        turns = []
        pending_tool_results: list[dict] = []

        for m in messages:
            if m.role == "system":
                system_parts.append(m.content)
                continue

            if m.role == "tool":
                # Accumulate tool results to batch into a user message
                pending_tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": m.tool_call_id,
                    "content": m.content,
                })
                continue

            # Flush pending tool results as a user message before next assistant turn
            if pending_tool_results:
                turns.append({"role": "user", "content": pending_tool_results})
                pending_tool_results = []

            if m.tool_calls:
                # Assistant message with tool use blocks
                blocks: list[dict] = []
                if m.content:
                    blocks.append({"type": "text", "text": m.content})
                for tc in m.tool_calls:
                    blocks.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc["args"],
                    })
                turns.append({"role": m.role, "content": blocks})
            elif isinstance(m.content, list):
                turns.append({"role": m.role, "content": [self._convert_part(p) for p in m.content]})
            else:
                turns.append({"role": m.role, "content": m.content})

        if pending_tool_results:
            turns.append({"role": "user", "content": pending_tool_results})

        system = "\n\n".join(system_parts) if system_parts else None
        return system, turns
```

Update `chat()` to pass tools and parse tool use blocks — replace the existing `chat` method body:
```python
    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        system, turns = self._split_messages(messages)
        params = {**kwargs}
        if self._anthropic_tools:
            params["tools"] = self._anthropic_tools

        create_kwargs = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": turns,
            **params,
        }
        if system:
            create_kwargs["system"] = system

        response = await self.client.messages.create(**create_kwargs)

        text_content = ""
        tool_calls = None
        for block in response.content:
            if block.type == "text":
                text_content += block.text
            elif block.type == "tool_use":
                if tool_calls is None:
                    tool_calls = []
                tool_calls.append({
                    "name": block.name,
                    "args": block.input,
                    "id": block.id,
                })

        usage = None
        if response.usage:
            from ..base import Usage
            usage = Usage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            )

        return LLMResponse(
            content=text_content,
            usage=usage,
            model=response.model,
            tool_calls=tool_calls,
        )
```

- [ ] **Step 8.7: Add stub bind_tools to Ollama and OpenRouter**

In `services/ai/src/ai/providers/ollama.py`, add:
```python
    def bind_tools(self, tools: list) -> "OllamaProvider":
        raise NotImplementedError(
            "OllamaProvider does not support bind_tools. "
            "Use a tool-calling capable model (e.g., llama3.2) with OpenAI-compatible "
            "tool calling, or switch to the OpenAI/Anthropic provider."
        )
```

In `services/ai/src/ai/providers/openrouter.py`, add:
```python
    def bind_tools(self, tools: list) -> "OpenRouterProvider":
        raise NotImplementedError(
            "OpenRouterProvider does not support bind_tools. "
            "Use the OpenAI or Anthropic provider directly for tool calling."
        )
```

- [ ] **Step 8.8: Run tool calling infrastructure tests**

```bash
uv run pytest services/agents/tests/test_tool_calling.py -v
```

Expected: 4 tests PASS

- [ ] **Step 8.9: Commit**

```bash
git add services/ai/
git commit -m "feat: add bind_tools and tool_calls to BaseLLM protocol and providers"
```

---

## Task 9: Tool-Calling Loop in ChatAgent

**Files:**
- Modify: `services/agents/src/agents/chat_agent.py`
- Modify: `services/agents/tests/test_tool_calling.py`

- [ ] **Step 9.1: Write failing test for tool-calling agent**

Add to `services/agents/tests/test_tool_calling.py`:

```python
@pytest.mark.asyncio
async def test_chat_agent_executes_tool_and_returns_result():
    """Agent calls a tool and incorporates the result into its final answer."""
    from ai import LLMResponse
    from agents import build_chat_graph
    from langchain_core.tools import tool

    call_count = 0

    @tool
    def lookup_city_pop(city: str) -> str:
        """Look up the population of a city."""
        return f"{city} has 8.3 million people."

    # LLM first returns a tool call, then returns the final answer
    mock_llm = AsyncMock()
    mock_llm.bind_tools = lambda tools: mock_llm  # bind_tools returns same mock

    responses = [
        LLMResponse(
            content="",
            tool_calls=[{"name": "lookup_city_pop", "args": {"city": "NYC"}, "id": "call_1"}],
        ),
        LLMResponse(content="NYC has 8.3 million people.", tool_calls=None),
    ]

    async def chat_side_effect(messages, **kwargs):
        nonlocal call_count
        resp = responses[min(call_count, len(responses) - 1)]
        call_count += 1
        return resp

    mock_llm.chat = chat_side_effect

    agent = build_chat_graph(llm=mock_llm, tools=[lookup_city_pop])
    tokens = []
    async for token in agent.stream({
        "messages": [],
        "session_id": "test",
        "system_prompt": "",
    }):
        tokens.append(token)

    full = "".join(tokens)
    assert "8.3 million" in full
    assert call_count == 2  # LLM called twice: once for tool call, once for final answer


@pytest.mark.asyncio
async def test_chat_agent_without_tools_streams_directly(mock_llm):
    """Without tools, agent streams tokens directly."""
    from agents import build_chat_graph

    agent = build_chat_graph(llm=mock_llm)
    tokens = []
    async for token in agent.stream({
        "messages": [],
        "session_id": "test",
        "system_prompt": "",
    }):
        tokens.append(token)

    assert "".join(tokens) == "Mock response."
```

- [ ] **Step 9.2: Run tests to confirm failure**

```bash
uv run pytest services/agents/tests/test_tool_calling.py::test_chat_agent_executes_tool_and_returns_result -v 2>&1 | head -20
```

Expected: FAIL — `build_chat_graph` doesn't accept `tools` param yet

- [ ] **Step 9.3: Update ChatAgent**

Replace the contents of `services/agents/src/agents/chat_agent.py`:

```python
import operator
from collections.abc import AsyncIterator
from typing import Annotated, Any, TypedDict

import structlog
from ai import BaseLLM, get_llm
from ai.base import Message
from langchain_core.messages import AIMessage, BaseMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .base_agent import BaseAgent
from .utils import lc_to_messages

log = structlog.get_logger()


class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    session_id: str
    system_prompt: str


class ChatAgent(BaseAgent):
    """Conversational agent with optional tool-calling support."""

    def __init__(
        self,
        llm: BaseLLM | None = None,
        system_prompt: str = "",
        tools: list | None = None,
    ) -> None:
        self.llm = llm or get_llm()
        self.system_prompt = system_prompt
        self._tools = tools or []
        self._tool_map = {t.name: t for t in self._tools}

        # Bind tools to the LLM if tools are provided and provider supports it
        if self._tools:
            try:
                self._llm_with_tools = self.llm.bind_tools(self._tools)
            except NotImplementedError:
                log.warning(
                    "chat_agent.bind_tools_unsupported",
                    provider=type(self.llm).__name__,
                )
                self._llm_with_tools = self.llm
                self._tools = []      # disable tool loop
                self._tool_map = {}
        else:
            self._llm_with_tools = self.llm

        self._graph = self.build_graph()

    def build_graph(self) -> CompiledStateGraph:
        graph = StateGraph(ChatState)
        graph.add_node("agent", self._agent_node)
        graph.set_entry_point("agent")
        graph.add_edge("agent", END)
        return graph.compile()

    async def _agent_node(self, state: ChatState) -> dict[str, Any]:
        system = state.get("system_prompt") or self.system_prompt
        messages = lc_to_messages(state["messages"], system=system or None)
        log.info("chat_agent.invoke", session_id=state.get("session_id"), message_count=len(messages))
        response = await self._llm_with_tools.chat(messages)
        return {"messages": [AIMessage(content=response.content)]}

    async def run(self, input: dict[str, Any]) -> dict[str, Any]:
        return await self._graph.ainvoke(input)

    async def stream(self, input: dict[str, Any]) -> AsyncIterator[str]:
        system = input.get("system_prompt") or self.system_prompt
        messages = lc_to_messages(input.get("messages", []), system=system or None)

        if not self._tools:
            # Simple path: stream directly without tool loop
            async for token in self.llm.stream(messages):
                yield token
            return

        # Tool-calling path: loop until no more tool calls, then yield final answer
        while True:
            response = await self._llm_with_tools.chat(messages)

            if not response.tool_calls:
                # Final answer — yield content
                if response.content:
                    yield response.content
                break

            log.info(
                "chat_agent.tool_calls",
                tools=[tc["name"] for tc in response.tool_calls],
            )

            # Add assistant's tool-call message to history
            messages.append(
                Message(
                    role="assistant",
                    content=response.content or "",
                    tool_calls=response.tool_calls,
                )
            )

            # Execute each tool and add results
            for tc in response.tool_calls:
                tool_fn = self._tool_map.get(tc["name"])
                if tool_fn is not None:
                    try:
                        result = str(await tool_fn.arun(tc["args"]))
                    except Exception as exc:
                        result = f"Error executing {tc['name']}: {exc}"
                        log.warning("chat_agent.tool_error", tool=tc["name"], error=str(exc))
                else:
                    result = f"Error: unknown tool '{tc['name']}'"

                messages.append(
                    Message(
                        role="tool",
                        content=result,
                        tool_call_id=tc["id"],
                        name=tc["name"],
                    )
                )


def build_chat_graph(
    llm: BaseLLM | None = None,
    system_prompt: str = "",
    tools: list | None = None,
) -> ChatAgent:
    return ChatAgent(llm=llm, system_prompt=system_prompt, tools=tools)
```

- [ ] **Step 9.4: Run all tool calling tests**

```bash
uv run pytest services/agents/tests/test_tool_calling.py -v
```

Expected: All tests PASS

- [ ] **Step 9.5: Run the full agent test suite to check for regressions**

```bash
uv run pytest services/agents/tests/ -v --ignore=services/agents/tests/evals
```

Expected: All tests PASS

- [ ] **Step 9.6: Commit**

```bash
git add services/agents/src/agents/chat_agent.py services/agents/tests/test_tool_calling.py
git commit -m "feat: add tool-calling loop to ChatAgent.stream()"
```

---

## Task 10: RAG Connection Pooling Fix

**Files:**
- Modify: `services/rag/src/rag/retriever.py`

- [ ] **Step 10.1: Update PgVectorRetriever to accept pool**

Edit `services/rag/src/rag/retriever.py`. Update `__init__` to accept an optional pool:

```python
class PgVectorRetriever:
    """Retrieves relevant document chunks from pgvector using cosine similarity."""

    def __init__(
        self,
        llm: BaseLLM,
        pool=None,  # asyncpg.Pool — preferred; falls back to per-call connections
        database_url: str | None = None,
        embedding_dim: int = 768,
    ) -> None:
        self.llm = llm
        self._pool = pool
        self.database_url = database_url or os.environ["DATABASE_URL"]
        self.embedding_dim = embedding_dim
```

Add a `_conn` context manager (similar to `SessionStore`) and update `retrieve` and `store`:

After `__init__`, add:
```python
    from contextlib import asynccontextmanager
    from collections.abc import AsyncIterator as _AI

    @asynccontextmanager
    async def _conn(self):
        import asyncpg
        if self._pool is not None:
            async with self._pool.acquire() as conn:
                yield conn
        else:
            conn = await asyncpg.connect(self.database_url)
            try:
                yield conn
            finally:
                await conn.close()
```

Update `retrieve` to use `self._conn()` instead of `asyncpg.connect`:
```python
    async def retrieve(self, query: str, top_k: int = 3) -> list[RetrievedChunk]:
        embedding = await self.llm.embed(query)
        embedding_str = _vec_str(embedding)

        async with self._conn() as conn:
            rows = await conn.fetch(
                """
                SELECT content, metadata, 1 - (embedding <=> $1::vector) AS score
                FROM document_chunks
                ORDER BY embedding <=> $1::vector
                LIMIT $2
                """,
                embedding_str,
                top_k,
            )
            return [
                RetrievedChunk(
                    content=r["content"],
                    metadata=json.loads(r["metadata"]) if r["metadata"] else {},
                    score=r["score"],
                )
                for r in rows
            ]
```

Update `store` to use `self._conn()`:
```python
    async def store(self, chunks: list[str], metadata: dict | None = None) -> int:
        embeddings = await asyncio.gather(*[self.llm.embed(chunk) for chunk in chunks])
        meta_json = json.dumps(metadata or {})

        async with self._conn() as conn:
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                await conn.execute(
                    """
                    INSERT INTO document_chunks (content, embedding, metadata)
                    VALUES ($1, $2::vector, $3::jsonb)
                    """,
                    chunk,
                    _vec_str(embedding),
                    meta_json,
                )
            return len(chunks)
```

Also update `ensure_table` to use the pool if available:
```python
    async def ensure_table(self) -> None:
        async with self._conn() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id          BIGSERIAL PRIMARY KEY,
                    content     TEXT        NOT NULL,
                    embedding   vector({self.embedding_dim}),
                    metadata    JSONB       NOT NULL DEFAULT '{{}}',
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
                ON document_chunks
                USING hnsw (embedding vector_cosine_ops)
            """)
```

- [ ] **Step 10.2: Update PgVectorRetriever construction in main.py**

The lifespan already creates the retriever. Update the construction line in `main.py`:
```python
    retriever = PgVectorRetriever(llm=llm, pool=pool, embedding_dim=settings.embedding_dim)
```

(Remove the `database_url` arg if present; `pool` is now the primary connection mechanism.)

- [ ] **Step 10.3: Verify server starts without errors**

```bash
uv run uvicorn api.main:app --app-dir apps/server/src --port 8001 &
sleep 3
curl -s http://localhost:8001/health
kill %1
```

Expected: health check returns 200

- [ ] **Step 10.4: Commit**

```bash
git add services/rag/src/rag/retriever.py apps/server/src/api/main.py
git commit -m "fix: PgVectorRetriever uses connection pool instead of per-call connections"
```

---

## Task 11: Frontend — Chat Feature

**Files:**
- Create: `apps/web/src/features/chat/index.ts`
- Create: `apps/web/src/features/chat/components/ChatInterface.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/chat-client.tsx` (or replace page import chain)

- [ ] **Step 11.1: Create features/chat/ directory and ChatInterface**

Create `apps/web/src/features/chat/components/ChatInterface.tsx`:

```typescript
// Re-export the existing Chat component under the feature namespace.
// The existing chat.tsx is the implementation; this wrapper keeps page.tsx clean.
export { Chat as ChatInterface } from "@/app/chat";
```

Note: The bulk of the chat UI is already well-factored in `apps/web/src/app/chat.tsx`. In Phase 12 we move it to `features/chat/components/` in full. For now, we re-export it to establish the feature boundary without a big rewrite.

Create `apps/web/src/features/chat/index.ts`:

```typescript
export { ChatInterface } from "./components/ChatInterface";
```

- [ ] **Step 11.2: Update page.tsx to import from features**

Edit `apps/web/src/app/page.tsx`:

```typescript
import { ChatInterface } from "@/features/chat";

export default function Home() {
  return <ChatInterface />;
}
```

Update `apps/web/src/app/chat-client.tsx` to point to the feature:

```typescript
"use client";

import dynamic from "next/dynamic";

export const ChatClient = dynamic(
  () => import("@/features/chat").then((m) => m.ChatInterface),
  { ssr: false },
);
```

- [ ] **Step 11.3: TypeScript check**

```bash
pnpm --filter web check-types 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 11.4: Commit**

```bash
git add apps/web/src/features/ apps/web/src/app/page.tsx apps/web/src/app/chat-client.tsx
git commit -m "feat: establish features/chat feature boundary"
```

---

## Task 12: Frontend — Auth & Billing Features

**Files:**
- Create: `apps/web/src/features/auth/components/LoginPage.tsx`
- Create: `apps/web/src/features/auth/components/RegisterPage.tsx`
- Create: `apps/web/src/features/auth/index.ts`
- Create: `apps/web/src/features/billing/components/BillingPage.tsx`
- Create: `apps/web/src/features/billing/index.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/register/page.tsx`
- Modify: `apps/web/src/app/billing/page.tsx`

- [ ] **Step 12.1: Create auth feature**

Create `apps/web/src/features/auth/components/LoginPage.tsx`:

```typescript
// LoginPage — wraps the existing login route implementation.
// The existing login/page.tsx is moved here; the route file becomes a thin shell.
export { default as LoginPage } from "@/app/login/LoginForm";
```

Since the existing `apps/web/src/app/login/page.tsx` contains the login form inline, move its content:

Read `apps/web/src/app/login/page.tsx`, then create `apps/web/src/features/auth/components/LoginPage.tsx` with the same content (but exported as a named component `LoginPage`), and replace the route file with:

```typescript
// apps/web/src/app/login/page.tsx
import { LoginPage } from "@/features/auth";
export default LoginPage;
```

Create `apps/web/src/features/auth/index.ts`:

```typescript
export { LoginPage } from "./components/LoginPage";
export { RegisterPage } from "./components/RegisterPage";
```

Repeat the same pattern for `register/page.tsx` → `features/auth/components/RegisterPage.tsx`.

- [ ] **Step 12.2: Create billing feature**

Create `apps/web/src/features/billing/components/BillingPage.tsx` — move the content of `apps/web/src/app/billing/page.tsx` here, rename the default export to `BillingPage`.

Create `apps/web/src/features/billing/index.ts`:

```typescript
export { BillingPage } from "./components/BillingPage";
```

Replace `apps/web/src/app/billing/page.tsx`:

```typescript
import { BillingPage } from "@/features/billing";
export default BillingPage;
```

- [ ] **Step 12.3: TypeScript check across the whole web app**

```bash
pnpm --filter web check-types 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 12.4: Verify the dev server starts and all pages load**

```bash
pnpm --filter web dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/billing
kill %1
```

Expected: both return `200` (or `307` redirect for auth-protected routes)

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/src/features/auth/ apps/web/src/features/billing/ apps/web/src/app/login/ apps/web/src/app/register/ apps/web/src/app/billing/
git commit -m "feat: establish features/auth and features/billing boundaries"
```

---

## Task 13: Update Docs & Verify End-to-End

**Files:**
- Modify: `ROADMAP.md`
- Modify: `ARCHITECTURE.md`

- [ ] **Step 13.1: Run full test suite**

```bash
# Python: all unit tests
uv run pytest services/ apps/server/tests/ -v --ignore=services/agents/tests/evals

# Python: eval suite
RUN_EVALS=1 uv run pytest services/agents/tests/evals/ -v --tb=short 2>&1 | tail -30

# TypeScript: type check
pnpm check-types

# Python lint
uv run ruff check .
```

Expected: all pass, eval suite ≥80%, no type errors, no lint errors

- [ ] **Step 13.2: End-to-end verification checklist**

Start server (`uv run uvicorn api.main:app --app-dir apps/server/src`) and run these manual checks:

- [ ] `GET /admin/ai-config` returns JSON with `chat`, `rag`, `embeddings`, `memory`, `image_gen` keys
- [ ] `POST /chat` with `{"message": "what's the weather in NYC?"}` streams tokens and calls `WeatherTool` (check logs for `chat_agent.tool_calls`)
- [ ] `POST /chat` without a weather question streams tokens without tool calls
- [ ] Session history persists across two sequential requests with same `session_id`
- [ ] `PUT /admin/ai-config/chat` with new provider updates `app.state.ai_config` without restart

- [ ] **Step 13.3: Mark Phase 12 complete in ROADMAP.md**

Find the Phase 12 entry in `ROADMAP.md` and update its status to complete. Add the date.

- [ ] **Step 13.4: Final commit**

```bash
git add ROADMAP.md ARCHITECTURE.md
git commit -m "docs: mark Phase 12 complete — architecture refactor, tool calling, feature structure"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Router → Service → Repository | Tasks 1–5 |
| `ContextService` wraps memory + location | Task 2 |
| `ChatService` orchestrates chat turn | Task 4 |
| `AgentFactory` builds agents | Task 3, updated Task 7 |
| Runtime `ai_feature_configs` table | Task 6 |
| `create_llm(provider, model)` per-feature | Task 7 |
| `GET/PUT /admin/ai-config` endpoints | Task 7 |
| `bind_tools` on BaseLLM + providers | Task 8 |
| Tool-calling loop in `ChatAgent.stream()` | Task 9 |
| `registry.get_all()` wired into AgentFactory | Task 3+7 |
| `PgVectorRetriever` connection pooling | Task 10 |
| SaaS tables isolated in `saas.ts` | Task 6 |
| Feature-based frontend: chat | Task 11 |
| Feature-based frontend: auth + billing | Task 12 |

**Type consistency check:**
- `SessionRepository.scope(user_id, session_id)` used in Tasks 1, 2, 4 — consistent
- `ContextService.build()` returns `tuple[list[BaseMessage], str | None]` — used consistently in Task 4
- `AgentFactory.build(use_rag, system_prompt)` — consistent in Tasks 3, 5, 7
- `LLMResponse.tool_calls: list[dict] | None` — defined in Task 8, consumed in Task 9
- `Message.tool_calls: list[dict] | None` — defined in Task 8, used in Task 9
- `create_llm(provider, model)` — defined in Task 7, used in Task 7 (AgentFactory)
