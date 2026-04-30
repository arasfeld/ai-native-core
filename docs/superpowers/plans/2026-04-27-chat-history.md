# Chat History & Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist named chat conversations in the database, expose them in a left sidebar with create/rename/delete, and route each conversation to `/chat/[id]`.

**Architecture:** A new `conversations` table links user IDs to UUIDs that double as `session_id` values. Five FastAPI endpoints manage CRUD; two Next.js proxy routes forward requests with the session cookie. The sidebar is a client component that fetches/mutates via those proxies; the chat page reads `conversationId` from URL params and passes it into `DefaultChatTransport`.

**Tech Stack:** asyncpg, FastAPI, Pydantic, pytest, Next.js App Router, Vercel AI SDK (`useChat`), Tailwind v4, shadcn/ui (`DropdownMenu`, `Dialog`), nanoid.

---

## File Map

| Action | File |
|--------|------|
| Create | `packages/db/migrations/0005_conversations.sql` |
| Modify | `packages/db/src/schema/app.ts` |
| Modify | `packages/db/src/migrate.ts` |
| Create | `apps/server/src/api/routers/conversations.py` |
| Modify | `apps/server/src/api/main.py` |
| Modify | `apps/server/src/api/repositories/session_repository.py` |
| Modify | `apps/server/src/api/services/chat_service.py` |
| Create | `apps/server/tests/test_conversations.py` |
| Create | `apps/server/tests/test_chat_service_autotitle.py` |
| Create | `apps/web/src/app/api/conversations/route.ts` |
| Create | `apps/web/src/app/api/conversations/[id]/route.ts` |
| Modify | `apps/web/src/app/api/chat/route.ts` |
| Modify | `apps/web/src/app/chat.tsx` |
| Modify | `apps/web/src/app/chat/page.tsx` |
| Create | `apps/web/src/app/chat/[id]/page.tsx` |
| Create | `apps/web/src/app/chat/layout.tsx` |
| Create | `apps/web/src/features/chat/components/ConversationSidebar.tsx` |

---

### Task 1: DB Migration — conversations table

**Files:**
- Create: `packages/db/migrations/0005_conversations.sql`
- Modify: `packages/db/src/schema/app.ts`
- Modify: `packages/db/src/migrate.ts`

- [ ] **Step 1: Create the SQL migration file**

`packages/db/migrations/0005_conversations.sql`:
```sql
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
```

- [ ] **Step 2: Add Drizzle table definition**

In `packages/db/src/schema/app.ts`, append after the existing `documentChunks` table:

```typescript
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New chat"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 3: Add DDL to migrate.ts**

In `packages/db/src/migrate.ts`, append inside the `migrate()` function after the last `db.execute` block:

```typescript
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      title       TEXT        NOT NULL DEFAULT 'New chat',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id)
  `);
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0005_conversations.sql packages/db/src/schema/app.ts packages/db/src/migrate.ts
git commit -m "feat(db): add conversations table"
```

---

### Task 2: Python conversations router

**Files:**
- Create: `apps/server/src/api/routers/conversations.py`
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 1: Write the failing tests first**

Create `apps/server/tests/test_conversations.py`:

```python
"""Tests for the conversations router."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.conversations import router
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(router)
    return a


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


def authed_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_list_returns_empty_for_new_user(app, mock_pool):
    mock_pool.fetch.return_value = []
    client = authed_client(app, mock_pool)
    resp = client.get("/conversations")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/conversations")
    assert resp.status_code == 401


def test_create_returns_id_and_title(app, mock_pool):
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.post("/conversations", json={"id": "conv-abc"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "conv-abc"
    assert data["title"] == "New chat"


def test_patch_updates_title(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-abc", "title": "New chat", "user_id": "user-1"})
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.patch("/conversations/conv-abc", json={"title": "My renamed chat"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "My renamed chat"


def test_patch_returns_404_for_unknown_id(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.patch("/conversations/no-such-id", json={"title": "x"})
    assert resp.status_code == 404


def test_delete_returns_204(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-abc", "user_id": "user-1"})
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.delete("/conversations/conv-abc")
    assert resp.status_code == 204


def test_delete_returns_404_for_unknown_id(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.delete("/conversations/no-such-id")
    assert resp.status_code == 404


def test_get_messages_returns_list(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-abc", "user_id": "user-1"})
    mock_pool.fetch = AsyncMock(return_value=[
        {"role": "human", "content": "Hello"},
        {"role": "assistant", "content": "Hi there"},
    ])
    client = authed_client(app, mock_pool)
    resp = client.get("/conversations/conv-abc/messages")
    assert resp.status_code == 200
    msgs = resp.json()
    assert len(msgs) == 2
    assert msgs[0]["role"] == "human"
    assert msgs[1]["content"] == "Hi there"
```

- [ ] **Step 2: Run tests — expect FAIL (ImportError)**

```bash
cd apps/server && uv run pytest tests/test_conversations.py -v 2>&1 | head -30
```
Expected: `ImportError: cannot import name 'router' from 'api.routers.conversations'`

- [ ] **Step 3: Create the conversations router**

Create `apps/server/src/api/routers/conversations.py`:

```python
"""Conversations router — CRUD for named chat sessions."""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth.deps import AuthUser, get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/conversations", tags=["conversations"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str | None = None
    updated_at: str | None = None


class CreateConversationRequest(BaseModel):
    id: str


class PatchConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class MessageOut(BaseModel):
    role: str
    content: str


def _get_pool(request: Request):
    return request.app.state.db_pool


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    rows = await pool.fetch(
        "SELECT id, title, created_at, updated_at FROM conversations "
        "WHERE user_id = $1 ORDER BY updated_at DESC",
        user.id,
    )
    return [
        ConversationOut(
            id=row["id"],
            title=row["title"],
            created_at=row["created_at"].isoformat() if row["created_at"] else None,
            updated_at=row["updated_at"].isoformat() if row["updated_at"] else None,
        )
        for row in rows
    ]


@router.post("", response_model=ConversationOut)
async def create_conversation(
    body: CreateConversationRequest, user: CurrentUser, request: Request
):
    pool = _get_pool(request)
    await pool.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, 'New chat') "
        "ON CONFLICT (id) DO NOTHING",
        body.id,
        user.id,
    )
    return ConversationOut(id=body.id, title="New chat")


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(conversation_id: str, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    # Verify ownership
    row = await pool.fetchrow(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    scoped_id = f"{user.id}:{conversation_id}"
    rows = await pool.fetch(
        "SELECT role, content FROM chat_sessions WHERE session_id = $1 ORDER BY id ASC",
        scoped_id,
    )
    return [MessageOut(role=r["role"], content=r["content"]) for r in rows]


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: str,
    body: PatchConversationRequest,
    user: CurrentUser,
    request: Request,
):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await pool.execute(
        "UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2",
        body.title,
        conversation_id,
    )
    return ConversationOut(id=conversation_id, title=body.title)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str, user: CurrentUser, request: Request
):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    scoped_id = f"{user.id}:{conversation_id}"
    await pool.execute(
        "DELETE FROM chat_sessions WHERE session_id = $1", scoped_id
    )
    await pool.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
```

- [ ] **Step 4: Register the router in main.py**

In `apps/server/src/api/main.py`, add `conversations` to the import:

```python
from .routers import (
    admin,
    admin_tenants,
    admin_users,
    auth,
    billing,
    chat,
    conversations,
    health,
    ingest,
    jobs,
    media,
    rbac,
)
```

Add the `_CREATE_CONVERSATIONS` DDL constant after `_CREATE_RBAC`:

```python
_CREATE_CONVERSATIONS = """
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  title       TEXT        NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
"""
```

Add `await conn.execute(_CREATE_CONVERSATIONS)` inside the lifespan `async with pool.acquire() as conn:` block after the existing executes:

```python
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TENANTS)
        await conn.execute(_CREATE_RBAC)
        await conn.execute(_CREATE_CONVERSATIONS)
```

Add `app.include_router(conversations.router)` after the existing router registrations:

```python
app.include_router(conversations.router)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/server && uv run pytest tests/test_conversations.py -v
```
Expected: all 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/api/routers/conversations.py apps/server/src/api/main.py apps/server/tests/test_conversations.py
git commit -m "feat(server): add conversations router with CRUD endpoints"
```

---

### Task 3: SessionRepository conversation helpers + auto-title in ChatService

**Files:**
- Modify: `apps/server/src/api/repositories/session_repository.py`
- Modify: `apps/server/src/api/services/chat_service.py`
- Create: `apps/server/tests/test_chat_service_autotitle.py`

- [ ] **Step 1: Write failing auto-title tests**

Create `apps/server/tests/test_chat_service_autotitle.py`:

```python
"""Tests for ChatService auto-title and updated_at bump logic."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from api.auth.deps import AuthUser
from api.repositories.session_repository import SessionRepository
from api.services.chat_service import ChatService
from api.services.context_service import ContextService


def make_service(pool: AsyncMock) -> ChatService:
    store = MagicMock()
    store.get_messages = AsyncMock(return_value=[])
    store.add_message = AsyncMock()
    store.add_token_usage = AsyncMock()
    store.ensure_table = AsyncMock()

    session_repo = SessionRepository(store=store, pool=pool)

    context_service = MagicMock(spec=ContextService)
    context_service.build = AsyncMock(return_value=([], None))

    agent = MagicMock()
    agent.stream = MagicMock(return_value=_async_gen(["Hello", "!"]))

    agent_factory = MagicMock()
    agent_factory.build = MagicMock(return_value=agent)

    return ChatService(
        context_service=context_service,
        agent_factory=agent_factory,
        session_repo=session_repo,
    )


async def _async_gen(items):
    for item in items:
        yield item


@pytest.mark.asyncio
async def test_auto_title_fires_on_first_message():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"token_limit": 100000})
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    service = make_service(pool)

    request = MagicMock()
    request.message = "Tell me a joke"
    request.session_id = "conv-123"
    request.use_rag = False
    request.system_prompt = ""
    request.lat = None
    request.lng = None

    user = AuthUser(id="user-1", email="u@example.com")

    tokens = [t async for t in service.stream(request, user, is_guest=False)]

    # Check that auto_title UPDATE was called with the message text
    calls = [str(c) for c in pool.execute.call_args_list]
    title_calls = [c for c in calls if "title = $1" in c and "New chat" in c]
    assert len(title_calls) == 1


@pytest.mark.asyncio
async def test_updated_at_bump_fires_every_turn():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"token_limit": 100000})
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    service = make_service(pool)

    request = MagicMock()
    request.message = "Hello"
    request.session_id = "conv-456"
    request.use_rag = False
    request.system_prompt = ""
    request.lat = None
    request.lng = None

    user = AuthUser(id="user-1", email="u@example.com")
    [t async for t in service.stream(request, user, is_guest=False)]

    calls = [str(c) for c in pool.execute.call_args_list]
    bump_calls = [c for c in calls if "updated_at = NOW()" in c and "title" not in c]
    assert len(bump_calls) >= 1


@pytest.mark.asyncio
async def test_auto_title_skipped_for_guests():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value={"token_limit": 10000})
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock()

    service = make_service(pool)

    request = MagicMock()
    request.message = "Guest message"
    request.session_id = "default"
    request.use_rag = False
    request.system_prompt = ""
    request.lat = None
    request.lng = None

    user = AuthUser(id="guest:1.2.3.4", email="guest@anonymous")
    [t async for t in service.stream(request, user, is_guest=True)]

    calls = [str(c) for c in pool.execute.call_args_list]
    title_calls = [c for c in calls if "title = $1" in c and "New chat" in c]
    assert len(title_calls) == 0
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/server && uv run pytest tests/test_chat_service_autotitle.py -v 2>&1 | head -30
```
Expected: tests fail — auto-title logic not implemented yet.

- [ ] **Step 3: Add conversation helpers to SessionRepository**

In `apps/server/src/api/repositories/session_repository.py`, add the following two methods after `check_budget`:

```python
    async def auto_title_conversation(
        self, conversation_id: str, title: str
    ) -> None:
        """Conditionally set title from first message — no-op if already renamed."""
        try:
            await self._pool.execute(
                "UPDATE conversations SET title = $1, updated_at = NOW() "
                "WHERE id = $2 AND title = 'New chat'",
                title[:60],
                conversation_id,
            )
        except Exception:
            log.warning(
                "conversation.auto_title.failed", conversation_id=conversation_id
            )

    async def bump_conversation_updated_at(self, conversation_id: str) -> None:
        """Bump updated_at so the sidebar stays sorted by recency."""
        try:
            await self._pool.execute(
                "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
                conversation_id,
            )
        except Exception:
            log.warning(
                "conversation.bump.failed", conversation_id=conversation_id
            )
```

Add the structlog import at the top of session_repository.py if not already present:
```python
import structlog
log = structlog.get_logger()
```

- [ ] **Step 4: Modify ChatService.stream() to call the helpers**

In `apps/server/src/api/services/chat_service.py`, add the auto-title and bump calls after `save_message` for the user message. The changes go inside `stream()` — after `await self._session_repo.save_message(session_id, "human", request.message)`:

```python
        # Persist user message
        await self._session_repo.save_message(session_id, "human", request.message)

        # Fire-and-forget: auto-title + updated_at bump (registered users only)
        if not is_guest and isinstance(request.message, str):
            asyncio.ensure_future(
                self._session_repo.auto_title_conversation(
                    request.session_id, request.message
                )
            )
        if not is_guest:
            asyncio.ensure_future(
                self._session_repo.bump_conversation_updated_at(request.session_id)
            )
```

Note: `request.session_id` is the raw conversation UUID; `session_id` (local variable) is the scoped `{user_id}:{conversation_id}`. The conversations table stores by raw UUID.

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/server && uv run pytest tests/test_chat_service_autotitle.py -v
```
Expected: all 3 tests PASS

- [ ] **Step 6: Run full server test suite**

```bash
cd apps/server && uv run pytest --tb=short -q
```
Expected: all tests pass (no regressions)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/repositories/session_repository.py apps/server/src/api/services/chat_service.py apps/server/tests/test_chat_service_autotitle.py
git commit -m "feat(server): auto-title conversations and bump updated_at on chat turn"
```

---

### Task 4: Next.js proxy routes for conversations

**Files:**
- Create: `apps/web/src/app/api/conversations/route.ts`
- Create: `apps/web/src/app/api/conversations/[id]/route.ts`

- [ ] **Step 1: Create the collection proxy (GET + POST)**

Create `apps/web/src/app/api/conversations/route.ts`:

```typescript
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/conversations`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/conversations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: hdrs.get("cookie") ?? "",
    },
    body: await req.text(),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create the item proxy (GET messages + PATCH + DELETE)**

Create `apps/web/src/app/api/conversations/[id]/route.ts`:

```typescript
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/conversations/${id}/messages`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/conversations/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: hdrs.get("cookie") ?? "",
    },
    body: await req.text(),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/conversations/${id}`, {
    method: "DELETE",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm check-types 2>&1 | grep -E "conversations" | head -20
```
Expected: no errors related to conversations routes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/conversations/route.ts apps/web/src/app/api/conversations/[id]/route.ts
git commit -m "feat(web): add Next.js proxy routes for conversations"
```

---

### Task 5: Chat component — accept conversationId, pass as session_id

**Files:**
- Modify: `apps/web/src/app/chat.tsx`
- Modify: `apps/web/src/app/api/chat/route.ts`

- [ ] **Step 1: Modify the Chat component signature and transport**

In `apps/web/src/app/chat.tsx`, make the following changes:

**Change 1** — add `UIMessage` to the `ai` import:
```typescript
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type SourceUrlUIPart,
  type UIMessage,
} from "ai";
```

**Change 2** — add props to the `Chat` function signature (replace the existing signature):
```typescript
export function Chat({
  conversationId = "default",
  initialMessages = [],
}: {
  conversationId?: string;
  initialMessages?: UIMessage[];
}): ReactNode {
```

**Change 3** — update the `transport` so it includes `session_id` in the body. Replace the existing `useState` transport block:
```typescript
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        credentials: "include",
        body: () => ({ ...(coordsRef.current ?? {}), session_id: conversationId }),
      }),
  );
```

**Change 4** — pass `initialMessages` to `useChat`. Replace the `useChat` call:
```typescript
  const { messages, sendMessage, stop, status, addToolApprovalResponse } =
    useChat({
      transport,
      initialMessages,
    });
```

**Change 5** — change the outer `div` height from `h-dvh` to `h-full` so the new layout shell controls height:
```typescript
  return (
    <div className="flex h-full flex-col">
```

- [ ] **Step 2: Update chat API route to read session_id from body**

In `apps/web/src/app/api/chat/route.ts`, replace:
```typescript
  const sessionId = req.cookies.get("session-id")?.value ?? crypto.randomUUID();
```
with:
```typescript
  const sessionId = (body.session_id as string | undefined) ?? crypto.randomUUID();
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm check-types 2>&1 | grep -E "chat\.tsx|chat/route" | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/chat.tsx apps/web/src/app/api/chat/route.ts
git commit -m "feat(web): Chat accepts conversationId prop, passes session_id to transport"
```

---

### Task 6: Next.js routing — redirect page + conversation page

**Files:**
- Modify: `apps/web/src/app/chat/page.tsx`
- Create: `apps/web/src/app/chat/[id]/page.tsx`

- [ ] **Step 1: Rewrite chat/page.tsx as redirect for authenticated users**

Replace the entire content of `apps/web/src/app/chat/page.tsx`:

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { Chat } from "@/app/chat";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export default async function ChatPage() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  if (session) {
    const id = nanoid();
    try {
      await fetch(`${API_URL}/conversations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: hdrs.get("cookie") ?? "",
        },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Non-fatal — conversation row will be created lazily on first message
    }
    redirect(`/chat/${id}`);
  }

  // Guest: render chat directly with ephemeral session
  return <Chat conversationId="default" />;
}
```

- [ ] **Step 2: Create the conversation page**

Create `apps/web/src/app/chat/[id]/page.tsx`:

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UIMessage } from "ai";
import { auth } from "@/auth";
import { Chat } from "@/app/chat";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type RawMessage = { role: string; content: string };

async function fetchMessages(
  conversationId: string,
  cookieHeader: string,
): Promise<RawMessage[]> {
  try {
    const res = await fetch(
      `${API_URL}/conversations/${conversationId}/messages`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) redirect("/login");

  const raw = await fetchMessages(id, hdrs.get("cookie") ?? "");
  const initialMessages: UIMessage[] = raw.map((m, i) => ({
    id: String(i),
    role: m.role === "human" ? "user" : "assistant",
    parts: [{ type: "text", text: m.content }],
    content: m.content,
    createdAt: new Date(),
  }));

  return <Chat conversationId={id} initialMessages={initialMessages} />;
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm check-types 2>&1 | grep -E "chat/page|chat/\[id\]" | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/chat/page.tsx apps/web/src/app/chat/[id]/page.tsx
git commit -m "feat(web): route /chat to new conversation, add /chat/[id] page"
```

---

### Task 7: Chat layout — two-column shell with sidebar slot

**Files:**
- Create: `apps/web/src/app/chat/layout.tsx`

- [ ] **Step 1: Create the layout**

Create `apps/web/src/app/chat/layout.tsx`:

```typescript
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { ConversationSidebar } from "@/features/chat/components/ConversationSidebar";

export default async function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  return (
    <div className="flex h-screen">
      {session && <ConversationSidebar />}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create the ConversationSidebar stub (so layout compiles)**

Create the directory and stub file `apps/web/src/features/chat/components/ConversationSidebar.tsx`:

```typescript
"use client";

export function ConversationSidebar() {
  return (
    <aside className="w-60 shrink-0 border-r bg-background">
      {/* populated in Task 8 */}
    </aside>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm check-types 2>&1 | grep -E "layout|ConversationSidebar" | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit the stub**

```bash
git add apps/web/src/app/chat/layout.tsx apps/web/src/features/chat/components/ConversationSidebar.tsx
git commit -m "feat(web): add chat layout with sidebar slot"
```

---

### Task 8: ConversationSidebar — full implementation

**Files:**
- Modify: `apps/web/src/features/chat/components/ConversationSidebar.tsx`

- [ ] **Step 1: Check required shadcn components are available**

```bash
ls apps/web/src/components/ui/ | grep -E "dropdown|dialog|button|input"
```
Expected: `dropdown-menu.tsx`, `dialog.tsx`, `button.tsx`, `input.tsx` present. If any are missing, add them:
```bash
pnpm --filter web exec shadcn add dropdown-menu dialog button input
```

- [ ] **Step 2: Replace the stub with the full implementation**

Replace the entire content of `apps/web/src/features/chat/components/ConversationSidebar.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { PencilIcon, PlusIcon, Trash2Icon, EllipsisIcon } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

type Groups = {
  Today: Conversation[];
  Yesterday: Conversation[];
  "This week": Conversation[];
  Older: Conversation[];
};

function groupByRecency(convs: Conversation[]): Groups {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const groups: Groups = { Today: [], Yesterday: [], "This week": [], Older: [] };
  for (const c of convs) {
    const d = new Date(c.updated_at);
    if (d >= startOfToday) groups.Today.push(c);
    else if (d >= startOfYesterday) groups.Yesterday.push(c);
    else if (d >= startOfWeek) groups["This week"].push(c);
    else groups.Older.push(c);
  }
  return groups;
}

export function ConversationSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Re-fetch when navigating to a new conversation
  useEffect(() => {
    fetchConversations();
  }, [pathname, fetchConversations]);

  async function handleNewChat() {
    const id = nanoid();
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.push(`/chat/${id}`);
    fetchConversations();
  }

  function startRename(conv: Conversation) {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    setRenamingId(null);
    fetchConversations();
  }

  async function handleDelete(conv: Conversation) {
    await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    const isActive = pathname === `/chat/${conv.id}`;
    fetchConversations();
    if (isActive) {
      // Navigate to a fresh conversation
      const id = nanoid();
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.push(`/chat/${id}`);
    }
  }

  const groups = groupByRecency(conversations);
  const groupEntries = Object.entries(groups) as [keyof Groups, Conversation[]][];

  return (
    <>
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="font-medium text-sm">Conversations</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat} title="New chat">
            <PlusIcon className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {groupEntries.map(([label, items]) =>
            items.length === 0 ? null : (
              <div key={label} className="mb-2">
                <p className="px-3 py-1 text-muted-foreground text-xs font-medium">{label}</p>
                {items.map((conv) => {
                  const isActive = pathname === `/chat/${conv.id}`;
                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-1 rounded-md mx-1 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent ${isActive ? "bg-accent font-medium" : ""}`}
                      onClick={() => {
                        if (renamingId !== conv.id) router.push(`/chat/${conv.id}`);
                      }}
                    >
                      {renamingId === conv.id ? (
                        <Input
                          ref={renameInputRef}
                          value={renameValue}
                          className="h-6 flex-1 px-1 text-sm"
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(conv.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(conv.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate">{conv.title}</span>
                      )}

                      {renamingId !== conv.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <EllipsisIcon className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); startRename(conv); }}>
                              <PencilIcon className="mr-2 size-3" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(conv); }}
                            >
                              <Trash2Icon className="mr-2 size-3" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            ),
          )}

          {conversations.length === 0 && (
            <p className="px-3 py-4 text-center text-muted-foreground text-xs">
              No conversations yet
            </p>
          )}
        </div>
      </aside>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Check shadcn component import paths**

The imports above use `@repo/ui/components/button` etc. Verify these paths exist:

```bash
ls packages/ui/src/components/ | grep -E "^button|^input|^dropdown|^dialog"
```
Expected: `button.tsx`, `input.tsx`, `dropdown-menu.tsx`, `dialog.tsx` present.

If `@repo/ui` doesn't export these, check the package's glob export and add if needed. The `@repo/ui` package uses glob exports so any file in `packages/ui/src/components/` is auto-available.

- [ ] **Step 4: Type-check**

```bash
cd apps/web && pnpm check-types 2>&1 | grep -E "ConversationSidebar" | head -20
```
Expected: no errors.

- [ ] **Step 5: Run full TypeScript test suite**

```bash
cd apps/web && pnpm test 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/chat/components/ConversationSidebar.tsx
git commit -m "feat(web): ConversationSidebar with new/rename/delete and date grouping"
```

---

### Task 9: Final validation

- [ ] **Step 1: Run all Python tests**

```bash
cd apps/server && uv run pytest --tb=short -q
```
Expected: all pass.

- [ ] **Step 2: Run full TypeScript type-check**

```bash
pnpm check-types
```
Expected: no errors.

- [ ] **Step 3: Commit if there are any loose files**

```bash
git status
```
If clean: done. If there are unstaged changes, investigate and commit or discard.
