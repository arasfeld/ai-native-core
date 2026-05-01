# Phase 19 — User Settings & Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a unified `/settings` page with Profile, Appearance (theme), and API Keys tabs — replacing the standalone `/profile` page.

**Architecture:** Unified `/settings` page with `?tab=` query-param routing. Theme is client-only via `next-themes` (already wired). API keys use a new `user_api_keys` DB table, FastAPI CRUD router, and Next.js proxy routes. Profile tab migrates the existing `/profile` content to shadcn components.

**Tech Stack:** Next.js App Router, shadcn/ui (Tabs, Card, Dialog, Input, Button), next-themes, FastAPI, asyncpg, Python hashlib/secrets, Vitest (type-check only), pytest.

---

## File Map

**Create:**
- `packages/db/migrations/0006_user_api_keys.sql`
- `packages/db/src/schema/app.ts` — add `userApiKeys` table
- `packages/db/src/migrate.ts` — add `_CREATE_USER_API_KEYS` DDL block
- `apps/server/src/api/routers/user_api_keys.py`
- `apps/server/tests/test_user_api_keys.py`
- `apps/web/src/app/api/user/api-keys/route.ts`
- `apps/web/src/app/api/user/api-keys/[id]/route.ts`
- `packages/ui/src/components/tabs.tsx`
- `packages/ui/src/components/card.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/features/settings/components/SettingsPage.tsx`
- `apps/web/src/features/settings/components/ProfileTab.tsx`
- `apps/web/src/features/settings/components/AppearanceTab.tsx`
- `apps/web/src/features/settings/components/ApiKeysTab.tsx`
- `apps/web/src/features/settings/index.ts`

**Modify:**
- `apps/server/src/api/main.py` — add DDL constant, import, `include_router`
- `apps/web/src/app/profile/page.tsx` — replace with redirect
- `apps/web/src/proxy.ts` — remove `/profile` from `PROTECTED_PATHS`

---

### Task 1: DB migration — user_api_keys table

**Files:**
- Create: `packages/db/migrations/0006_user_api_keys.sql`
- Modify: `packages/db/src/schema/app.ts`
- Modify: `packages/db/src/migrate.ts`

- [ ] **Step 1: Create migration file**

```sql
-- packages/db/migrations/0006_user_api_keys.sql
CREATE TABLE IF NOT EXISTS user_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  key_prefix   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS user_api_keys_key_hash_idx ON user_api_keys(key_hash);
```

- [ ] **Step 2: Add Drizzle table definition**

In `packages/db/src/schema/app.ts`, add at the top: `uuid` to imports, then append the table after `conversations`:

```ts
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
```

Append at bottom of `packages/db/src/schema/app.ts`:

```ts
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("user_api_keys_user_id_idx").on(table.userId),
    index("user_api_keys_key_hash_idx").on(table.keyHash),
  ],
);
```

- [ ] **Step 3: Add DDL to migrate.ts**

In `packages/db/src/migrate.ts`, append before the closing `}` of `migrate()`:

```ts
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name         TEXT        NOT NULL,
      key_hash     TEXT        NOT NULL UNIQUE,
      key_prefix   TEXT        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys(user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_api_keys_key_hash_idx ON user_api_keys(key_hash)
  `);
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @repo/db check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0006_user_api_keys.sql packages/db/src/schema/app.ts packages/db/src/migrate.ts
git commit -m "feat(db): add user_api_keys table"
```

---

### Task 2: FastAPI router + tests (TDD)

**Files:**
- Create: `apps/server/tests/test_user_api_keys.py`
- Create: `apps/server/src/api/routers/user_api_keys.py`

- [ ] **Step 1: Write failing tests**

Create `apps/server/tests/test_user_api_keys.py`:

```python
"""Tests for the user API keys router."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock
from datetime import datetime, timezone

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.user_api_keys import router
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
    resp = client.get("/user/api-keys")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/user/api-keys")
    assert resp.status_code == 401


def test_create_returns_key_with_correct_format(app, mock_pool):
    now = datetime.now(timezone.utc)
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "name": "My script",
            "key_prefix": "ak_a1b2c3",
            "created_at": now,
        }
    )
    client = authed_client(app, mock_pool)
    resp = client.post("/user/api-keys", json={"name": "My script"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["key"].startswith("ak_")
    assert len(data["key"]) == 67
    assert data["name"] == "My script"
    assert "key_prefix" in data


def test_create_stores_sha256_hash(app, mock_pool):
    now = datetime.now(timezone.utc)
    captured = {}

    async def fake_fetchrow(query, *args):
        captured["key_hash"] = args[2]  # third positional arg is key_hash
        captured["full_key"] = args[0]  # set in test below
        return {
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "name": "test",
            "key_prefix": args[3],
            "created_at": now,
        }

    mock_pool.fetchrow = fake_fetchrow
    client = authed_client(app, mock_pool)
    resp = client.post("/user/api-keys", json={"name": "test"})
    assert resp.status_code == 201
    returned_key = resp.json()["key"]
    expected_hash = hashlib.sha256(returned_key.encode()).hexdigest()
    assert captured["key_hash"] == expected_hash


def test_delete_revokes_key(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(
        return_value={"id": "123e4567-e89b-12d3-a456-426614174000", "user_id": "user-1"}
    )
    mock_pool.execute = AsyncMock()
    client = authed_client(app, mock_pool)
    resp = client.delete("/user/api-keys/123e4567-e89b-12d3-a456-426614174000")
    assert resp.status_code == 204


def test_delete_returns_404_for_unknown_key(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.delete("/user/api-keys/no-such-id")
    assert resp.status_code == 404


def test_delete_returns_404_for_other_users_key(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)
    client = authed_client(app, mock_pool)
    resp = client.delete("/user/api-keys/some-other-key-id")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/server && uv run pytest tests/test_user_api_keys.py -v
```

Expected: FAIL with `ModuleNotFoundError` or `ImportError` (router doesn't exist yet).

- [ ] **Step 3: Create the router**

Create `apps/server/src/api/routers/user_api_keys.py`:

```python
"""User API keys router — generate, list, and revoke personal API keys."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth.deps import AuthUser, get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/user/api-keys", tags=["user-api-keys"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class ApiKeyCreated(BaseModel):
    key: str
    id: str
    name: str
    key_prefix: str
    created_at: datetime


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


def _get_pool(request: Request):
    return request.app.state.db_pool


@router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    rows = await pool.fetch(
        "SELECT id, name, key_prefix, created_at, last_used_at, revoked_at "
        "FROM user_api_keys WHERE user_id = $1 AND revoked_at IS NULL "
        "ORDER BY created_at DESC",
        user.id,
    )
    return [
        ApiKeyOut(
            id=str(row["id"]),
            name=row["name"],
            key_prefix=row["key_prefix"],
            created_at=row["created_at"],
            last_used_at=row["last_used_at"],
            revoked_at=row["revoked_at"],
        )
        for row in rows
    ]


@router.post("", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(body: CreateApiKeyRequest, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    full_key = "ak_" + secrets.token_hex(32)
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    key_prefix = full_key[:8]
    row = await pool.fetchrow(
        "INSERT INTO user_api_keys (user_id, name, key_hash, key_prefix) "
        "VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at",
        user.id,
        body.name,
        key_hash,
        key_prefix,
    )
    return ApiKeyCreated(
        key=full_key,
        id=str(row["id"]),
        name=row["name"],
        key_prefix=row["key_prefix"],
        created_at=row["created_at"],
    )


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM user_api_keys "
        "WHERE id = $1::uuid AND user_id = $2 AND revoked_at IS NULL",
        key_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    await pool.execute(
        "UPDATE user_api_keys SET revoked_at = NOW() WHERE id = $1::uuid",
        key_id,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/server && uv run pytest tests/test_user_api_keys.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/api/routers/user_api_keys.py apps/server/tests/test_user_api_keys.py
git commit -m "feat(server): add user API keys router with CRUD endpoints"
```

---

### Task 3: Register router in main.py

**Files:**
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 1: Add DDL constant**

In `apps/server/src/api/main.py`, add after the `_CREATE_CONVERSATIONS` block (around line 106):

```python
_CREATE_USER_API_KEYS = """
CREATE TABLE IF NOT EXISTS user_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  key_prefix   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS user_api_keys_key_hash_idx ON user_api_keys(key_hash);
"""
```

- [ ] **Step 2: Execute DDL in lifespan**

In the `lifespan` function, inside the `async with pool.acquire() as conn:` block, add after `await conn.execute(_CREATE_CONVERSATIONS)`:

```python
        await conn.execute(_CREATE_USER_API_KEYS)
```

- [ ] **Step 3: Import and register router**

In the imports block at the top of `main.py`, add `user_api_keys` to the router imports:

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
    user_api_keys,
)
```

At the bottom of `main.py`, add after `app.include_router(conversations.router)`:

```python
app.include_router(user_api_keys.router)
```

- [ ] **Step 4: Run full test suite**

```bash
cd apps/server && uv run pytest -v --tb=short
```

Expected: all existing tests pass plus the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/api/main.py
git commit -m "feat(server): register user_api_keys router in main app"
```

---

### Task 4: Next.js proxy routes

**Files:**
- Create: `apps/web/src/app/api/user/api-keys/route.ts`
- Create: `apps/web/src/app/api/user/api-keys/[id]/route.ts`

- [ ] **Step 1: Create collection route**

Create `apps/web/src/app/api/user/api-keys/route.ts`:

```ts
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/user/api-keys`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/user/api-keys`, {
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

- [ ] **Step 2: Create item route**

Create `apps/web/src/app/api/user/api-keys/[id]/route.ts`:

```ts
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/user/api-keys/${id}`, {
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
pnpm --filter web check-types 2>&1 | grep -v "apps/extension"
```

Expected: no errors in `apps/web`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/user/api-keys/
git commit -m "feat(web): add Next.js proxy routes for user API keys"
```

---

### Task 5: Add Tabs and Card components to @repo/ui

**Files:**
- Create: `packages/ui/src/components/tabs.tsx`
- Create: `packages/ui/src/components/card.tsx`

- [ ] **Step 1: Create tabs.tsx**

Create `packages/ui/src/components/tabs.tsx`:

```tsx
"use client";

import { cn } from "@repo/ui/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

function Tabs({
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 font-medium text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
```

- [ ] **Step 2: Create card.tsx**

Create `packages/ui/src/components/card.tsx`:

```tsx
import { cn } from "@repo/ui/lib/utils";
import type * as React from "react";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold text-lg leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @repo/ui check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/tabs.tsx packages/ui/src/components/card.tsx
git commit -m "feat(ui): add Tabs and Card components"
```

---

### Task 6: Settings page shell

**Files:**
- Create: `apps/web/src/app/settings/page.tsx`
- Create: `apps/web/src/features/settings/components/SettingsPage.tsx`
- Create: `apps/web/src/features/settings/index.ts`

- [ ] **Step 1: Create SettingsPage client component**

Create `apps/web/src/features/settings/components/SettingsPage.tsx`:

```tsx
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { useRouter } from "next/navigation";
import { ApiKeysTab } from "./ApiKeysTab";
import { AppearanceTab } from "./AppearanceTab";
import { ProfileTab } from "./ProfileTab";

const VALID_TABS = ["profile", "appearance", "api-keys"] as const;
type Tab = (typeof VALID_TABS)[number];

function isValidTab(t: string): t is Tab {
  return VALID_TABS.includes(t as Tab);
}

export function SettingsPage({ tab }: { tab: string }) {
  const router = useRouter();
  const activeTab: Tab = isValidTab(tab) ? tab : "profile";

  function onTabChange(value: string) {
    router.replace(`/settings?tab=${value}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-semibold text-2xl">Settings</h1>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="appearance" className="mt-6">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-6">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Create index.ts**

Create `apps/web/src/features/settings/index.ts`:

```ts
export { SettingsPage } from "./components/SettingsPage";
```

- [ ] **Step 3: Create settings page route**

Create `apps/web/src/app/settings/page.tsx`:

```tsx
import { SettingsPage } from "@/features/settings";

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function Page({ searchParams }: Props) {
  const { tab = "profile" } = await searchParams;
  return <SettingsPage tab={tab} />;
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter web check-types 2>&1 | grep -v "apps/extension"
```

Expected: no errors in `apps/web`. (ProfileTab, AppearanceTab, ApiKeysTab will be stub files — create them in the next step if check-types complains about missing modules.)

> **Note:** If type-check fails with "Cannot find module './ProfileTab'", create empty stubs:
> - `apps/web/src/features/settings/components/ProfileTab.tsx` → `export function ProfileTab() { return null; }`
> - `apps/web/src/features/settings/components/AppearanceTab.tsx` → `export function AppearanceTab() { return null; }`
> - `apps/web/src/features/settings/components/ApiKeysTab.tsx` → `export function ApiKeysTab() { return null; }`
> Then re-run type-check. Replace stubs in Tasks 7–9.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/settings/ apps/web/src/features/settings/
git commit -m "feat(web): add /settings page shell with tab routing"
```

---

### Task 7: ProfileTab

**Files:**
- Create (or replace stub): `apps/web/src/features/settings/components/ProfileTab.tsx`

- [ ] **Step 1: Create ProfileTab**

Create `apps/web/src/features/settings/components/ProfileTab.tsx`:

```tsx
"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type SessionItem = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
};

export function ProfileTab() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "");
      setImage(session.user.image ?? "");
    }
  }, [session]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess(false);
    setSaving(true);
    const { error } = await authClient.updateUser({
      name: name.trim() || undefined,
      image: image.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message ?? "Failed to save changes.");
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    const { data } = await authClient.listSessions();
    setSessions((data as unknown as SessionItem[]) ?? []);
    setLoadingSessions(false);
    setSessionsLoaded(true);
  }

  async function handleRevokeSession(token: string) {
    await authClient.revokeSession({ token });
    setSessions((prev) => prev.filter((s) => s.token !== token));
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "delete my account") return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Request failed");
      await authClient.signOut();
      router.push("/");
    } catch {
      setDeleteError("Failed to delete account. Please try again.");
      setDeleting(false);
    }
  }

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (!session?.user) return null;

  const email = session.user.email ?? "";
  const initials = (session.user.name ?? email.split("@")[0] ?? "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt="Avatar"
            className="size-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-primary font-semibold text-lg text-primary-foreground">
            {initials}
          </div>
        )}
        <div>
          <p className="font-medium">{session.user.name ?? email}</p>
          <p className="text-muted-foreground text-sm">{email}</p>
        </div>
      </div>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="profile-name" className="font-medium text-sm">
                Display name
              </label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="profile-image" className="font-medium text-sm">
                Avatar URL
              </label>
              <Input
                id="profile-image"
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
            {saveError && <p className="text-destructive text-sm">{saveError}</p>}
            {saveSuccess && <p className="text-sm text-green-600">Changes saved.</p>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active sessions</CardTitle>
            {!sessionsLoaded && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadSessions}
                disabled={loadingSessions}
              >
                {loadingSessions ? "Loading…" : "Load sessions"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoaded && sessions.length === 0 && (
            <p className="text-muted-foreground text-sm">No other active sessions.</p>
          )}
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium text-sm">
                    {s.userAgent ? s.userAgent.slice(0, 60) : "Unknown device"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    IP: {s.ipAddress ?? "unknown"} · Created:{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRevokeSession(s.token)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete account */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            This permanently deletes your account, all conversations, and cancels any active
            subscription. This action cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteDialog(false);
            setDeleteConfirmText("");
            setDeleteError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              Type <strong>delete my account</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="delete my account"
          />
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "delete my account" || deleting}
            >
              {deleting ? "Deleting…" : "Confirm deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter web check-types 2>&1 | grep -v "apps/extension"
```

Expected: no errors in `apps/web`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/settings/components/ProfileTab.tsx
git commit -m "feat(web): add ProfileTab with shadcn Card/Input/Button"
```

---

### Task 8: AppearanceTab

**Files:**
- Create (or replace stub): `apps/web/src/features/settings/components/AppearanceTab.tsx`

- [ ] **Step 1: Create AppearanceTab**

Create `apps/web/src/features/settings/components/AppearanceTab.tsx`:

```tsx
"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useTheme } from "next-themes";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose your preferred color theme.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              variant={theme === t.value ? "default" : "outline"}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter web check-types 2>&1 | grep -v "apps/extension"
```

Expected: no errors in `apps/web`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/settings/components/AppearanceTab.tsx
git commit -m "feat(web): add AppearanceTab with light/dark/system theme picker"
```

---

### Task 9: ApiKeysTab

**Files:**
- Create (or replace stub): `apps/web/src/features/settings/components/ApiKeysTab.tsx`

- [ ] **Step 1: Create ApiKeysTab**

Create `apps/web/src/features/settings/components/ApiKeysTab.tsx`:

```tsx
"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { useEffect, useState } from "react";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

type CreatedKey = {
  key: string;
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
};

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogStep, setDialogStep] = useState<"closed" | "form" | "reveal">("closed");
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [creating, setCreating] = useState(false);

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    setLoading(true);
    const res = await fetch("/api/user/api-keys");
    if (res.ok) setKeys(await res.json());
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/user/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    if (res.ok) {
      const data: CreatedKey = await res.json();
      setCreatedKey(data);
      setDialogStep("reveal");
      setKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          key_prefix: data.key_prefix,
          created_at: data.created_at,
          last_used_at: null,
        },
        ...prev,
      ]);
    }
    setCreating(false);
  }

  function closeDialog() {
    setDialogStep("closed");
    setNewKeyName("");
    setCreatedKey(null);
  }

  async function handleRevoke() {
    if (!revokeId) return;
    setRevoking(true);
    const res = await fetch(`/api/user/api-keys/${revokeId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setKeys((prev) => prev.filter((k) => k.id !== revokeId));
    }
    setRevoking(false);
    setRevokeId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-lg">API Keys</h2>
          <p className="text-muted-foreground text-sm">
            Use API keys to authenticate programmatic requests.
          </p>
        </div>
        <Button onClick={() => setDialogStep("form")}>Generate new key</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No API keys yet. Generate your first key to use the API programmatically.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {k.key_prefix}…
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-destructive text-sm hover:underline"
                      onClick={() => setRevokeId(k.id)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate key dialog */}
      <Dialog
        open={dialogStep !== "closed"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {dialogStep === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Generate API key</DialogTitle>
                <DialogDescription>
                  Give this key a name to identify it later.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <Input
                  placeholder="e.g. My script"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating || !newKeyName.trim()}
                  >
                    {creating ? "Generating…" : "Generate"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
          {dialogStep === "reveal" && createdKey && (
            <>
              <DialogHeader>
                <DialogTitle>Your new API key</DialogTitle>
                <DialogDescription>
                  Copy this key now — it won't be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all select-all">
                {createdKey.key}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(createdKey.key)}
                >
                  Copy
                </Button>
                <Button type="button" onClick={closeDialog}>
                  I've copied this key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={revokeId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              This key will stop working immediately. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRevokeId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter web check-types 2>&1 | grep -v "apps/extension"
```

Expected: no errors in `apps/web`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/settings/components/ApiKeysTab.tsx
git commit -m "feat(web): add ApiKeysTab with generate/reveal/revoke flow"
```

---

### Task 10: Profile redirect + proxy cleanup + final validation

**Files:**
- Modify: `apps/web/src/app/profile/page.tsx`
- Modify: `apps/web/src/proxy.ts`

- [ ] **Step 1: Replace /profile page with redirect**

Replace the entire content of `apps/web/src/app/profile/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function ProfilePage() {
  redirect("/settings?tab=profile");
}
```

- [ ] **Step 2: Remove /profile from PROTECTED_PATHS**

In `apps/web/src/proxy.ts`, change:

```ts
const PROTECTED_PATHS = ["/admin", "/billing", "/profile", "/settings"];
```

to:

```ts
const PROTECTED_PATHS = ["/admin", "/billing", "/settings"];
```

- [ ] **Step 3: Run Python tests**

```bash
cd apps/server && uv run pytest tests/test_user_api_keys.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 4: Run full type-check**

```bash
pnpm check-types 2>&1 | grep -v "apps/extension"
```

Expected: no errors in `apps/web` or `packages/`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/profile/page.tsx apps/web/src/proxy.ts
git commit -m "feat(web): redirect /profile to /settings, remove from PROTECTED_PATHS"
```
