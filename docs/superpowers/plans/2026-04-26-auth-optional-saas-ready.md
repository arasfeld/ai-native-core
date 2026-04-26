# Auth-Optional + SaaS-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the template truly "Auth Optional" (guests can chat with a small token budget) and "SaaS Ready" (monthly per-tenant budgets, automatic tenant creation on registration, landing page with CTAs).

**Architecture:** Guests receive a synthetic `AuthUser` derived from their IP address and are governed by a small hardcoded token limit; registered users get a tenant record auto-created on first chat (lazy upsert) and are governed by a monthly token budget aggregated across all their sessions. The landing page lives at `/`, and the chat UI moves to `/chat`.

**Tech Stack:** FastAPI (Python), asyncpg, Next.js 14 App Router, Tailwind v4, shadcn/ui, Vercel AI SDK, LangGraph

---

## Audit Findings (Verified)

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | All unauthenticated traffic → `/login` | `apps/web/src/proxy.ts:31-33` | Confirmed |
| 2 | Chat router uses mandatory `CurrentUser` | `apps/server/src/api/routers/chat.py:38` | Confirmed |
| 3 | Token budget is per-session, not monthly per-tenant | `services/memory/src/memory/budget.py:60-70`, `session.py:158-165` | Confirmed |
| 4 | No tenant creation on user registration | No post-registration hook anywhere | Confirmed |
| 5 | Root `/` renders Chat; no `/chat` route exists | `apps/web/src/app/page.tsx` | Confirmed |

## File Map

### Modified files
- `apps/web/src/proxy.ts` — allow `/`, `/chat`, `/login`, `/register` without auth
- `apps/web/src/app/page.tsx` — replace Chat with LandingPage
- `apps/web/src/app/chat.tsx` — add optional `isGuest` prop to header
- `apps/server/src/api/routers/chat.py` — switch to `OptionalUser`, derive guest user from IP
- `apps/server/src/api/services/chat_service.py` — accept `AuthUser | None`, call tenant upsert
- `apps/server/src/api/repositories/session_repository.py` — guest budget cap, tenant upsert, monthly budget check
- `services/memory/src/memory/session.py` — add `get_monthly_tenant_usage()`
- `services/memory/src/memory/budget.py` — add `TenantMonthlyBudget` class

### Created files
- `apps/web/src/app/chat/page.tsx` — `/chat` route (renders existing `Chat` component)
- `apps/web/src/features/landing/components/LandingPage.tsx` — landing page UI
- `apps/web/src/features/landing/index.ts` — barrel export
- `tests/memory/test_monthly_budget.py` — unit tests for `TenantMonthlyBudget`
- `tests/api/test_guest_chat.py` — integration tests for guest chat flow

---

## Task 1: Monthly tenant budget in SessionStore

**Files:**
- Modify: `services/memory/src/memory/session.py`
- Modify: `services/memory/src/memory/budget.py`
- Create: `tests/memory/test_monthly_budget.py`

- [ ] **Step 1: Write failing tests for `get_monthly_tenant_usage`**

```python
# tests/memory/test_monthly_budget.py
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock
from memory.session import SessionStore
from memory.budget import TenantMonthlyBudget, BudgetExceeded


@pytest.fixture
def mock_store():
    store = MagicMock(spec=SessionStore)
    store.get_monthly_tenant_usage = AsyncMock(return_value=0)
    store.add_token_usage = AsyncMock()
    return store


@pytest.mark.asyncio
async def test_monthly_budget_ok(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 50_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    await budget.check("tenant-123")  # should not raise


@pytest.mark.asyncio
async def test_monthly_budget_exceeded(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 100_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    with pytest.raises(BudgetExceeded) as exc_info:
        await budget.check("tenant-123")
    assert exc_info.value.used == 100_000
    assert exc_info.value.limit == 100_000


@pytest.mark.asyncio
async def test_monthly_budget_remaining(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 30_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    assert await budget.remaining("tenant-123") == 70_000
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/repo
uv run pytest tests/memory/test_monthly_budget.py -v
```
Expected: `ImportError` or `AttributeError` — `TenantMonthlyBudget` and `get_monthly_tenant_usage` don't exist yet.

- [ ] **Step 3: Add `get_monthly_tenant_usage` to `SessionStore`**

In `services/memory/src/memory/session.py`, add after `get_token_usage`:

```python
async def get_monthly_tenant_usage(self, tenant_id: str) -> int:
    """Return total tokens consumed by a tenant in the current calendar month."""
    async with self._conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT COALESCE(SUM(tokens), 0) AS total
            FROM session_token_usage
            WHERE tenant_id = $1
              AND date_trunc('month', recorded_at) = date_trunc('month', NOW())
            """,
            tenant_id,
        )
    return int(row["total"])
```

- [ ] **Step 4: Add `TenantMonthlyBudget` to `budget.py`**

In `services/memory/src/memory/budget.py`, add after the `TokenBudget` class:

```python
class TenantMonthlyBudget:
    """Enforces a monthly token limit aggregated across all sessions for a tenant.

    Usage::

        budget = TenantMonthlyBudget(store, limit=100_000)
        await budget.check(tenant_id)      # raises BudgetExceeded if over
        remaining = await budget.remaining(tenant_id)
    """

    def __init__(self, store: SessionStore, limit: int = 100_000) -> None:
        self._store = store
        self._limit = limit

    async def remaining(self, tenant_id: str) -> int:
        used = await self._store.get_monthly_tenant_usage(tenant_id)
        return max(0, self._limit - used)

    async def check(self, tenant_id: str) -> None:
        """Raise ``BudgetExceeded`` if the tenant is at or over their monthly limit."""
        used = await self._store.get_monthly_tenant_usage(tenant_id)
        if used >= self._limit:
            log.warning(
                "budget.monthly.exceeded",
                tenant_id=tenant_id,
                used=used,
                limit=self._limit,
            )
            raise BudgetExceeded(session_id=tenant_id, used=used, limit=self._limit)
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
uv run pytest tests/memory/test_monthly_budget.py -v
```
Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/memory/src/memory/session.py services/memory/src/memory/budget.py tests/memory/test_monthly_budget.py
git commit -m "feat(memory): add monthly tenant budget with TenantMonthlyBudget"
```

---

## Task 2: Update SessionRepository to use monthly tenant budget

**Files:**
- Modify: `apps/server/src/api/repositories/session_repository.py`

- [ ] **Step 1: Write failing test for monthly budget enforcement**

Create `tests/api/test_guest_chat.py` (tests will expand in Task 3; create file now):

```python
# tests/api/test_guest_chat.py
"""Tests for guest chat and monthly budget enforcement."""
```

- [ ] **Step 2: Rewrite `check_budget` and add `get_or_create_tenant` in `session_repository.py`**

Replace the entire `session_repository.py` content:

```python
"""Session data access — wraps SessionStore and token budget logic."""
from __future__ import annotations

import asyncpg
from langchain_core.messages import BaseMessage
from memory import BudgetExceeded, SessionStore
from memory.budget import TenantMonthlyBudget

_GUEST_PREFIX = "guest:"
_GUEST_LIMIT = 10_000  # tokens per guest IP per month


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
        if user_id.startswith(_GUEST_PREFIX):
            return _GUEST_LIMIT
        row = await self._pool.fetchrow(
            "SELECT token_limit FROM tenants WHERE id = $1", user_id
        )
        return row["token_limit"] if row else self._default_limit

    async def get_or_create_tenant(self, user_id: str, email: str) -> None:
        """Ensure a tenant row exists for this user (idempotent)."""
        await self._pool.execute(
            """
            INSERT INTO tenants (id, name, plan, token_limit)
            VALUES ($1, $2, 'free', 100000)
            ON CONFLICT (id) DO NOTHING
            """,
            user_id,
            email,
        )

    async def check_budget(self, session_id: str, user_id: str) -> None:
        """Raise BudgetExceeded if the tenant has exceeded their monthly token budget."""
        limit = await self.get_token_limit(user_id)
        budget = TenantMonthlyBudget(self._store, limit=limit)
        await budget.check(user_id)
```

- [ ] **Step 3: Verify Python type checks pass**

```bash
uv run mypy apps/server/src/api/repositories/session_repository.py --ignore-missing-imports
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/api/repositories/session_repository.py tests/api/test_guest_chat.py
git commit -m "feat(server): monthly tenant budget enforcement and guest token cap"
```

---

## Task 3: Auth-optional chat router (guest support)

**Files:**
- Modify: `apps/server/src/api/routers/chat.py`
- Modify: `apps/server/src/api/services/chat_service.py`

- [ ] **Step 1: Write failing test for guest chat**

Append to `tests/api/test_guest_chat.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch


def test_guest_user_id_derived_from_ip():
    """Guest user ID should be deterministic from client IP."""
    from apps.server.src.api.routers.chat import _guest_user_from_ip
    user = _guest_user_from_ip("192.168.1.100")
    assert user.id.startswith("guest:")
    assert user.email == "guest@anonymous"
    assert _guest_user_from_ip("192.168.1.100").id == _guest_user_from_ip("192.168.1.100").id
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
uv run pytest tests/api/test_guest_chat.py::test_guest_user_id_derived_from_ip -v
```
Expected: `ImportError` — `_guest_user_from_ip` doesn't exist.

- [ ] **Step 3: Rewrite `chat.py` with `OptionalUser` and guest derivation**

Replace the entire content of `apps/server/src/api/routers/chat.py`:

```python
"""Chat router — thin HTTP adapter. All orchestration is in ChatService."""
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import OptionalUser
from ..auth.deps import AuthUser
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


def _guest_user_from_ip(ip: str) -> AuthUser:
    """Derive a stable, anonymous AuthUser from the client IP."""
    return AuthUser(id=f"guest:{ip}", email="guest@anonymous")


@router.post("")
async def chat(
    req: ChatRequest,
    request: Request,
    current_user: OptionalUser,
    chat_service: ChatService = ChatServiceDep,
) -> StreamingResponse:
    """Stream a chat response via Server-Sent Events. Auth is optional; guests use IP-based identity."""
    user = current_user or _guest_user_from_ip(
        request.client.host if request.client else "unknown"
    )
    return StreamingResponse(
        chat_service.stream(req, user, is_guest=current_user is None),
        media_type="text/event-stream",
    )
```

- [ ] **Step 4: Update `ChatService.stream` to handle guests and upsert tenants**

Replace `apps/server/src/api/services/chat_service.py`:

```python
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
```

- [ ] **Step 5: Run the guest test**

```bash
uv run pytest tests/api/test_guest_chat.py -v
```
Expected: PASS.

- [ ] **Step 6: Verify Python type checks**

```bash
uv run mypy apps/server/src/api/routers/chat.py apps/server/src/api/services/chat_service.py --ignore-missing-imports
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/routers/chat.py apps/server/src/api/services/chat_service.py
git commit -m "feat(server): auth-optional chat with guest IP-based identity"
```

---

## Task 4: Fix proxy to allow unauthenticated access to `/` and `/chat`

**Files:**
- Modify: `apps/web/src/proxy.ts`

- [ ] **Step 1: Update `PUBLIC_PATHS` to include `/` and `/chat`**

Replace the entire `apps/web/src/proxy.ts`:

```typescript
import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "@repo/auth";
import { type NextRequest, NextResponse } from "next/server";

// Paths that never require authentication
const PUBLIC_PATHS = [
  "/",
  "/chat",
  "/login",
  "/register",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

// Paths that always require authentication (protect even if unauthenticated)
const PROTECTED_PATHS = ["/billing", "/profile", "/settings"];

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Only redirect to login for explicitly protected paths
  if (!PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const { data: session, error } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: req.nextUrl.origin,
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
    },
  );

  if (error) {
    console.error("Proxy: session fetch error", error);
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web check-types
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/proxy.ts
git commit -m "feat(web): allow unauthenticated access to / and /chat"
```

---

## Task 5: Create `/chat` route and move Chat there

**Files:**
- Create: `apps/web/src/app/chat/page.tsx`

- [ ] **Step 1: Create the `/chat` page**

Create `apps/web/src/app/chat/page.tsx`:

```typescript
import { Chat } from "@/app/chat";

export default function ChatPage() {
  return <Chat />;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web check-types
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/chat/page.tsx
git commit -m "feat(web): add /chat route"
```

---

## Task 6: Build the landing page

**Files:**
- Create: `apps/web/src/features/landing/components/LandingPage.tsx`
- Create: `apps/web/src/features/landing/index.ts`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create the LandingPage component**

Create `apps/web/src/features/landing/components/LandingPage.tsx`:

```typescript
import Link from "next/link";
import { BotIcon, ZapIcon, ShieldIcon, UsersIcon, ArrowRightIcon } from "lucide-react";

const FEATURES = [
  {
    icon: BotIcon,
    title: "AI-Native from Day One",
    description:
      "LangGraph agents, streaming responses, RAG retrieval, and tool calling — all wired up and ready to extend.",
  },
  {
    icon: ZapIcon,
    title: "Streaming-First Architecture",
    description:
      "Every chat response streams via SSE. Vercel AI SDK on the frontend, FastAPI on the backend.",
  },
  {
    icon: ShieldIcon,
    title: "Auth + Multi-Tenancy",
    description:
      "better-auth handles sign-up/sign-in. Every user gets a tenant with a monthly token budget out of the box.",
  },
  {
    icon: UsersIcon,
    title: "Guest Mode Included",
    description:
      "Visitors can try the chat without signing up, rate-limited by IP. Converts to a full account in one click.",
  },
];

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <BotIcon className="size-4 text-muted-foreground" />
          AI Native Core
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-muted-foreground text-sm hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-20 text-center">
        <div className="space-y-4 max-w-2xl">
          <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">
            The AI-Native SaaS Starter
          </h1>
          <p className="text-muted-foreground text-lg">
            A production-ready monorepo template with LangGraph agents, streaming
            chat, RAG, multi-tenancy, and billing — so you can ship your idea, not
            the infrastructure.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          >
            Try for free (no sign-up)
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link
            href="/register"
            className="rounded-md border px-5 py-2.5 font-medium text-sm hover:bg-accent"
          >
            Create an account
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2 text-left mt-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-lg border bg-card p-5 space-y-2"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-4 text-center text-muted-foreground text-xs">
        AI Native Core — open-source monorepo template
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Create the barrel export**

Create `apps/web/src/features/landing/index.ts`:

```typescript
export { LandingPage } from "./components/LandingPage";
```

- [ ] **Step 3: Replace root page to render LandingPage**

Replace `apps/web/src/app/page.tsx`:

```typescript
import { LandingPage } from "@/features/landing";

export default function Home() {
  return <LandingPage />;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter web check-types
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/landing/ apps/web/src/app/page.tsx
git commit -m "feat(web): landing page at / with Try for Free CTA"
```

---

## Task 7: Update login redirect to `/chat` after sign-in

**Files:**
- Modify: `apps/web/src/features/auth/components/LoginPage.tsx`
- Modify: `apps/web/src/features/auth/components/RegisterPage.tsx`

After sign-in/registration, users should land on `/chat` rather than `/` (which is now the marketing page).

- [ ] **Step 1: Update `LoginPage.tsx` redirect**

In `apps/web/src/features/auth/components/LoginPage.tsx`, change line 27:

```typescript
// BEFORE
router.push("/");

// AFTER
router.push("/chat");
```

- [ ] **Step 2: Read and update `RegisterPage.tsx`**

Read `apps/web/src/features/auth/components/RegisterPage.tsx` first, then find the `router.push` call after successful registration and change it to `router.push("/chat")`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter web check-types
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/auth/components/LoginPage.tsx apps/web/src/features/auth/components/RegisterPage.tsx
git commit -m "feat(web): redirect to /chat after login and registration"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task | Covered? |
|-------------|------|----------|
| Guests can chat | Tasks 3, 4 | ✅ |
| Guest = anonymous tenant with small budget | Tasks 2, 3 | ✅ |
| Monthly budget checks (not per-session) | Tasks 1, 2 | ✅ |
| Tenant auto-created on registration (first chat) | Task 3 | ✅ |
| `/chat` route exists | Task 5 | ✅ |
| Landing page at `/` with Login + Try CTAs | Task 6 | ✅ |
| Post-login redirect to `/chat` | Task 7 | ✅ |

### Gaps identified and resolved
- **`RegisterPage.tsx`**: Step 2 in Task 7 requires reading the file before editing — marked as explicit read-first instruction.
- **`_guest_user_from_ip` test**: The test imports from a server module path that may need adjustment depending on how pytest discovers the server package. If import fails, change to `from api.routers.chat import _guest_user_from_ip` and run from `apps/server/`.
- **Budget check scope**: `check_budget` now passes `user_id` as the `tenant_id` to `TenantMonthlyBudget`. For guests this is `guest:{ip}` — there's no tenant row, so `get_token_limit` returns `_GUEST_LIMIT` (10,000) via the prefix check. `get_monthly_tenant_usage` will return 0 initially for a new IP, which is correct.
- **`location_place` unused variable**: `chat_service.py` destructures `location_place` but doesn't use it. This was present in the original; no change made to avoid scope creep.
