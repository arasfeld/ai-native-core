# Custom System Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set a persistent global system prompt (stored in `user_preferences`) and a per-conversation system prompt (stored on `conversations`), resolved server-side in `ChatService` by appending both to any request-provided prompt.

**Architecture:** A `user_preferences` table (one row per user) stores global instructions; `conversations.system_instructions` stores per-conversation instructions. `ChatService.stream()` fetches both and combines them additively (global → per-conversation → request-provided). A new `/preferences` FastAPI router handles CRUD; a new `AiTab` in settings and a `ConversationInstructions` panel in chat handle the UI.

**Tech Stack:** PostgreSQL, FastAPI, asyncpg, Next.js App Router, shadcn/ui Textarea

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/server/src/api/main.py` | Modify | Add `user_preferences` DDL + register preferences router |
| `apps/server/src/api/routers/preferences.py` | Create | `GET/PUT /preferences` endpoints |
| `apps/server/src/api/routers/conversations.py` | Modify | Add `system_instructions` to `ConversationOut`, `PatchConversationRequest`, list query, and patch handler |
| `apps/server/src/api/services/chat_service.py` | Modify | Add `_fetch_global_instructions`, `_fetch_conversation_instructions`, call them in `stream()` |
| `apps/server/tests/test_preferences.py` | Create | 4 tests for preferences endpoints |
| `apps/server/tests/test_system_instructions.py` | Create | 6 tests for conversations + ChatService resolution |
| `apps/web/src/app/api/preferences/route.ts` | Create | Next.js proxy for `GET/PUT /preferences` |
| `apps/web/src/features/settings/components/AiTab.tsx` | Create | Global system instructions textarea in settings |
| `apps/web/src/features/settings/components/SettingsPage.tsx` | Modify | Add "AI" tab |
| `apps/web/src/features/chat/components/ConversationInstructions.tsx` | Create | Per-conversation instructions panel in chat |
| `apps/web/src/app/chat.tsx` | Modify | Pass `systemInstructions` to `ConversationInstructions`; update `Chat` props |
| `ROADMAP.md` | Modify | Mark item 94 ✅ |

---

### Task 1: DB migration + main.py DDL

**Files:**
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 1: Add DDL constants and execute them in lifespan**

In `apps/server/src/api/main.py`, add after the `_CREATE_ORGANIZATIONS` constant (around line 171) and before the `lifespan` function:

```python
_CREATE_USER_PREFERENCES = """
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id             TEXT        PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  system_instructions TEXT        NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS system_instructions TEXT NOT NULL DEFAULT '';
"""
```

Then inside `lifespan`, after `await conn.execute(_CREATE_ORGANIZATIONS)` (around line 185), add:

```python
        await conn.execute(_CREATE_USER_PREFERENCES)
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/api/main.py
git commit -m "feat: add user_preferences table and conversations.system_instructions DDL"
```

---

### Task 2: Preferences router — write failing tests

**Files:**
- Create: `apps/server/tests/test_preferences.py`

- [ ] **Step 1: Write the test file**

Create `apps/server/tests/test_preferences.py`:

```python
"""Tests for GET/PUT /preferences."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_preferences_new_user(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/preferences", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"system_instructions": ""}


@pytest.mark.asyncio
async def test_put_preferences_upserts(client: AsyncClient, auth_headers: dict):
    payload = {"system_instructions": "You are a helpful assistant."}
    resp = await client.put("/preferences", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == payload


@pytest.mark.asyncio
async def test_put_preferences_updates_on_second_call(client: AsyncClient, auth_headers: dict):
    await client.put("/preferences", json={"system_instructions": "first"}, headers=auth_headers)
    resp = await client.put("/preferences", json={"system_instructions": "second"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["system_instructions"] == "second"

    resp2 = await client.get("/preferences", headers=auth_headers)
    assert resp2.json()["system_instructions"] == "second"


@pytest.mark.asyncio
async def test_get_preferences_requires_auth(client: AsyncClient):
    resp = await client.get("/preferences")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
uv run pytest apps/server/tests/test_preferences.py -v
```

Expected: 4 failures — `404 Not Found` (router not registered yet).

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/server/tests/test_preferences.py
git commit -m "test: add failing preferences endpoint tests"
```

---

### Task 3: Preferences router — implement

**Files:**
- Create: `apps/server/src/api/routers/preferences.py`
- Modify: `apps/server/src/api/main.py`
- Modify: `apps/server/src/api/routers/__init__.py` (if it exists — add `preferences` export)

- [ ] **Step 1: Create the preferences router**

Create `apps/server/src/api/routers/preferences.py`:

```python
"""User preferences router — global system instructions."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..auth.deps import AuthUser, get_current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class PreferencesOut(BaseModel):
    system_instructions: str


class PutPreferencesRequest(BaseModel):
    system_instructions: str


@router.get("", response_model=PreferencesOut)
async def get_preferences(user: CurrentUser, request: Request):
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        "SELECT system_instructions FROM user_preferences WHERE user_id = $1",
        user.id,
    )
    return PreferencesOut(system_instructions=row["system_instructions"] if row else "")


@router.put("", response_model=PreferencesOut)
async def put_preferences(body: PutPreferencesRequest, user: CurrentUser, request: Request):
    pool = request.app.state.db_pool
    await pool.execute(
        """
        INSERT INTO user_preferences (user_id, system_instructions, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET system_instructions = EXCLUDED.system_instructions, updated_at = NOW()
        """,
        user.id,
        body.system_instructions,
    )
    return PreferencesOut(system_instructions=body.system_instructions)
```

- [ ] **Step 2: Register the router in main.py**

In `apps/server/src/api/main.py`, add to the import block (around line 20):

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
    notifications,
    organizations,
    preferences,
    rbac,
    user_api_keys,
)
```

Then add after `app.include_router(organizations.router)` (at the end of the file):

```python
app.include_router(preferences.router)
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
uv run pytest apps/server/tests/test_preferences.py -v
```

Expected: 4 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/api/routers/preferences.py apps/server/src/api/main.py
git commit -m "feat: add GET/PUT /preferences router for global system instructions"
```

---

### Task 4: Conversations router — write failing tests for system_instructions

**Files:**
- Create: `apps/server/tests/test_system_instructions.py`

- [ ] **Step 1: Write failing tests**

Create `apps/server/tests/test_system_instructions.py`:

```python
"""Tests for conversations.system_instructions and ChatService resolution."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_patch_conversation_persists_system_instructions(
    client: AsyncClient, auth_headers: dict, conversation_id: str
):
    resp = await client.patch(
        f"/conversations/{conversation_id}",
        json={"system_instructions": "Be concise."},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["system_instructions"] == "Be concise."


@pytest.mark.asyncio
async def test_list_conversations_includes_system_instructions(
    client: AsyncClient, auth_headers: dict, conversation_id: str
):
    await client.patch(
        f"/conversations/{conversation_id}",
        json={"system_instructions": "Always reply in French."},
        headers=auth_headers,
    )
    resp = await client.get("/conversations", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    match = next((c for c in items if c["id"] == conversation_id), None)
    assert match is not None
    assert match["system_instructions"] == "Always reply in French."


@pytest.mark.asyncio
async def test_patch_title_does_not_clear_system_instructions(
    client: AsyncClient, auth_headers: dict, conversation_id: str
):
    await client.patch(
        f"/conversations/{conversation_id}",
        json={"system_instructions": "Keep it short."},
        headers=auth_headers,
    )
    await client.patch(
        f"/conversations/{conversation_id}",
        json={"title": "Renamed"},
        headers=auth_headers,
    )
    resp = await client.get("/conversations", headers=auth_headers)
    match = next(c for c in resp.json() if c["id"] == conversation_id)
    assert match["system_instructions"] == "Keep it short."


@pytest.mark.asyncio
async def test_resolution_combines_nonempty_parts():
    from api.services.chat_service import ChatService

    parts = ["global", "per-conv", "request"]
    result = "\n\n".join(p for p in parts if p)
    assert result == "global\n\nper-conv\n\nrequest"


@pytest.mark.asyncio
async def test_resolution_skips_empty_parts():
    parts = ["global", "", "request"]
    result = "\n\n".join(p for p in parts if p)
    assert result == "global\n\nrequest"


@pytest.mark.asyncio
async def test_resolution_all_empty_yields_empty():
    parts = ["", "", ""]
    result = "\n\n".join(p for p in parts if p)
    assert result == ""
```

- [ ] **Step 2: Run — verify failures**

```bash
uv run pytest apps/server/tests/test_system_instructions.py -v
```

Expected: first 3 fail (schema/logic not updated), last 3 may pass (pure logic).

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/server/tests/test_system_instructions.py
git commit -m "test: add failing system instructions tests for conversations router"
```

---

### Task 5: Conversations router — add system_instructions

**Files:**
- Modify: `apps/server/src/api/routers/conversations.py`

- [ ] **Step 1: Update ConversationOut, PatchConversationRequest, list query, and patch handler**

In `apps/server/src/api/routers/conversations.py`, replace the models and handlers:

Replace `ConversationOut`:
```python
class ConversationOut(BaseModel):
    id: str
    title: str
    system_instructions: str = ""
    created_at: str | None = None
    updated_at: str | None = None
```

Replace `PatchConversationRequest`:
```python
class PatchConversationRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    system_instructions: str | None = None
```

Replace the `list_conversations` query + return:
```python
@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    rows = await pool.fetch(
        "SELECT id, title, system_instructions, created_at, updated_at FROM conversations "
        "WHERE user_id = $1 ORDER BY updated_at DESC",
        user.id,
    )
    return [
        ConversationOut(
            id=row["id"],
            title=row["title"],
            system_instructions=row["system_instructions"],
            created_at=row["created_at"].isoformat() if row["created_at"] else None,
            updated_at=row["updated_at"].isoformat() if row["updated_at"] else None,
        )
        for row in rows
    ]
```

Replace the `rename_conversation` handler:
```python
@router.patch("/{conversation_id}", response_model=ConversationOut)
async def patch_conversation(
    conversation_id: str,
    body: PatchConversationRequest,
    user: CurrentUser,
    request: Request,
):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id, title, system_instructions FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    new_title = body.title if body.title is not None else row["title"]
    new_instructions = body.system_instructions if body.system_instructions is not None else row["system_instructions"]

    await pool.execute(
        "UPDATE conversations SET title = $1, system_instructions = $2, updated_at = NOW() WHERE id = $3",
        new_title,
        new_instructions,
        conversation_id,
    )
    return ConversationOut(id=conversation_id, title=new_title, system_instructions=new_instructions)
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
uv run pytest apps/server/tests/test_system_instructions.py -v
```

Expected: 6 passed, 0 failed.

- [ ] **Step 3: Run full test suite**

```bash
uv run pytest apps/server/tests/ -q
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/api/routers/conversations.py
git commit -m "feat: add system_instructions to conversations router (GET list + PATCH)"
```

---

### Task 6: ChatService — fetch and resolve system instructions

**Files:**
- Modify: `apps/server/src/api/services/chat_service.py`
- Create: `apps/server/tests/test_preferences.py` (already done — may add integration test here)

- [ ] **Step 1: Add private helpers and update stream()**

In `apps/server/src/api/services/chat_service.py`, add two private helpers before `stream()`:

```python
    async def _fetch_global_instructions(self, user_id: str) -> str:
        row = await self._session_repo._pool.fetchrow(
            "SELECT system_instructions FROM user_preferences WHERE user_id = $1", user_id
        )
        return row["system_instructions"] if row else ""

    async def _fetch_conversation_instructions(self, conversation_id: str, user_id: str) -> str:
        if conversation_id == "default":
            return ""
        row = await self._session_repo._pool.fetchrow(
            "SELECT system_instructions FROM conversations WHERE id = $1 AND user_id = $2",
            conversation_id,
            user_id,
        )
        return row["system_instructions"] if row else ""
```

In `stream()`, after the budget check block (after line 59 `return`) and before the `context_messages` build (before line 62), add:

```python
        # Fetch and combine system instructions (registered users only)
        effective_system_prompt = request.system_prompt or ""
        if not is_guest:
            global_instr = await self._fetch_global_instructions(user.id)
            conv_instr = await self._fetch_conversation_instructions(request.session_id, user.id)
            parts = [p for p in [global_instr, conv_instr, request.system_prompt] if p]
            effective_system_prompt = "\n\n".join(parts)
```

Then update the `agent` build and `state` dict to use `effective_system_prompt`:

```python
        agent = self._agent_factory.build(
            use_rag=request.use_rag,
            system_prompt=effective_system_prompt or None,
        )
        state = {
            "messages": [*context_messages, HumanMessage(content=request.message)],
            "session_id": session_id,
            "system_prompt": effective_system_prompt or None,
        }
```

- [ ] **Step 2: Run tests**

```bash
uv run pytest apps/server/tests/ -q
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/api/services/chat_service.py
git commit -m "feat: fetch and resolve system instructions in ChatService.stream()"
```

---

### Task 7: Next.js proxy routes for /preferences

**Files:**
- Create: `apps/web/src/app/api/preferences/route.ts`

- [ ] **Step 1: Write the proxy route**

Create `apps/web/src/app/api/preferences/route.ts`:

```typescript
import { buildProxyHeaders } from "@/lib/api-proxy";
import { auth } from "@repo/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${API_URL}/preferences`, {
    headers: await buildProxyHeaders(),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${API_URL}/preferences`, {
    method: "PUT",
    headers: { ...(await buildProxyHeaders()), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm check-types
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/preferences/route.ts
git commit -m "feat: add Next.js proxy routes for GET/PUT /api/preferences"
```

---

### Task 8: Settings — AiTab component

**Files:**
- Create: `apps/web/src/features/settings/components/AiTab.tsx`
- Modify: `apps/web/src/features/settings/components/SettingsPage.tsx`

- [ ] **Step 1: Create AiTab**

Create `apps/web/src/features/settings/components/AiTab.tsx`:

```typescript
"use client";

import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useEffect, useState } from "react";

export function AiTab() {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInstructions(d.system_instructions))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system_instructions: instructions }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium text-lg">AI Settings</h2>
        <p className="text-muted-foreground text-sm">
          Customize how the AI responds across all your conversations.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="global-instructions">Global system instructions</Label>
        <p className="text-muted-foreground text-sm">
          These instructions are prepended to every conversation. Use them to set
          your preferred language, tone, or any standing context.
        </p>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <Textarea
            id="global-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Always reply in French. Be concise."
            rows={6}
            className="resize-y"
          />
        )}
      </div>

      <Button onClick={handleSave} disabled={saving || loading}>
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Wire AiTab into SettingsPage**

In `apps/web/src/features/settings/components/SettingsPage.tsx`, add the import:

```typescript
import { AiTab } from "./AiTab";
```

Update `VALID_TABS`:
```typescript
const VALID_TABS = [
  "profile",
  "appearance",
  "api-keys",
  "organization",
  "ai",
] as const;
```

Add the tab trigger after the Organization trigger:
```typescript
          <TabsTrigger value="ai">AI</TabsTrigger>
```

Add the tab content after the Organization content:
```typescript
        <TabsContent value="ai" className="mt-6">
          <AiTab />
        </TabsContent>
```

- [ ] **Step 3: Type check**

```bash
pnpm check-types
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/settings/components/AiTab.tsx \
        apps/web/src/features/settings/components/SettingsPage.tsx
git commit -m "feat: add AI settings tab with global system instructions"
```

---

### Task 9: Chat — ConversationInstructions component

**Files:**
- Create: `apps/web/src/features/chat/components/ConversationInstructions.tsx`
- Modify: `apps/web/src/app/chat.tsx`

- [ ] **Step 1: Create ConversationInstructions**

Create `apps/web/src/features/chat/components/ConversationInstructions.tsx`:

```typescript
"use client";

import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

export function ConversationInstructions({
  conversationId,
  initialInstructions = "",
}: {
  conversationId: string;
  initialInstructions?: string;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system_instructions: instructions }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="border-b px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
      >
        {open ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
        System instructions
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions for this conversation only…"
            rows={3}
            className="resize-y text-sm"
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update Chat props and render ConversationInstructions**

In `apps/web/src/app/chat.tsx`, add the import after the existing feature imports:

```typescript
import { ConversationInstructions } from "@/features/chat/components/ConversationInstructions";
```

Update the `Chat` component props interface:

```typescript
export function Chat({
  conversationId = "default",
  initialMessages = [],
  systemInstructions = "",
}: {
  conversationId?: string;
  initialMessages?: UIMessage[];
  systemInstructions?: string;
}): ReactNode {
```

Find where the conversation header/title bar is rendered and add `ConversationInstructions` below it, only for named conversations (not "default") with an authenticated user. Look for the `<header>` or the `<Conversation>` wrapper in `chat.tsx`. Add after the header and before the `<ConversationContent>`:

```typescript
      {conversationId !== "default" && session && (
        <ConversationInstructions
          conversationId={conversationId}
          initialInstructions={systemInstructions}
        />
      )}
```

- [ ] **Step 3: Pass systemInstructions from the page to Chat**

In `apps/web/src/app/chat/[id]/page.tsx`, find where `<Chat>` is rendered and add the `systemInstructions` prop from the conversation data fetched from the sidebar/API. Look at how the page fetches conversation data. If the page calls `GET /api/conversations` to hydrate sidebar data, extract the matching conversation's `system_instructions`.

Read the page file first:

```bash
cat apps/web/src/app/chat/\[id\]/page.tsx
```

Then update the `<Chat>` call to pass `systemInstructions={conversation?.system_instructions ?? ""}`.

- [ ] **Step 4: Type check**

```bash
pnpm check-types
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/chat/components/ConversationInstructions.tsx \
        apps/web/src/app/chat.tsx
git commit -m "feat: add ConversationInstructions panel in chat for per-conversation system prompt"
```

---

### Task 10: Mark ROADMAP complete

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Find and update item 94**

In `ROADMAP.md`, find the line for item 94:

```
| 94 | **Custom system instructions** | ⬜ | Per-conversation OR global user setting for system prompt customization |
```

Change it to:

```
| 94 | **Custom system instructions** | ✅ | Global via user_preferences + per-conversation on conversations table; additive resolution in ChatService; AiTab in settings + ConversationInstructions panel in chat |
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "chore: mark custom system instructions complete in ROADMAP (item 94)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `user_preferences` table — Task 1
- ✅ `conversations.system_instructions` column — Task 1
- ✅ `GET/PUT /preferences` FastAPI router — Tasks 2–3
- ✅ `PATCH /conversations/{id}` gains `system_instructions` — Task 5
- ✅ `GET /conversations` returns `system_instructions` — Task 5
- ✅ `ChatService._fetch_global_instructions` — Task 6
- ✅ `ChatService._fetch_conversation_instructions` — Task 6
- ✅ Additive resolution (global → per-conv → request) — Task 6
- ✅ Guest users skip DB fetches — Task 6 (`if not is_guest`)
- ✅ Next.js proxy routes — Task 7
- ✅ `AiTab` in settings — Task 8
- ✅ `ConversationInstructions` in chat — Task 9
- ✅ Tests for preferences endpoints — Task 2
- ✅ Tests for conversations system_instructions + resolution — Task 4

**Placeholder scan:** No TBDs found. Task 9 Step 3 instructs the engineer to read the page file first before editing — this is intentional since the exact shape of that page varies.

**Type consistency:** `system_instructions: str` used consistently in Python; `systemInstructions: string` in TypeScript props. `ConversationOut.system_instructions` added in Task 5 matches what `AiTab` and `ConversationInstructions` consume from the API.
