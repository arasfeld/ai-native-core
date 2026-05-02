# Phase 20 — Email & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add React Email templates, an in-app notification center (bell + popover), and budget threshold alerts (80%/100%) delivered as both emails and in-app notifications.

**Architecture:** A new `packages/emails` TypeScript package holds all React Email templates and a `sendEmail` utility; `packages/auth` imports from it. The Python server gets a `notifications` DB table, a `notifications` FastAPI router, and a `check_budget_thresholds` service that runs fire-and-forget after each chat turn. The web UI adds a `NotificationBell` component (polling every 60s) with a Radix Popover listing recent notifications.

**Tech Stack:** React Email (`@react-email/components`, `@react-email/render`), Resend (TS + Python), asyncpg, FastAPI, Radix UI Popover, lucide-react, Next.js App Router proxy routes.

---

## Task 1: DB migration — notifications table + tenant columns

**Files:**
- Create: `packages/db/migrations/0007_notifications.sql`
- Modify: `apps/server/src/api/main.py` (add `_CREATE_NOTIFICATIONS` constant + execute in lifespan)

- [ ] **Step 1: Create the migration file**

```sql
-- packages/db/migrations/0007_notifications.sql
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS budget_warned_80_at  TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS budget_warned_100_at TIMESTAMPTZ;
```

- [ ] **Step 2: Add the DDL constant and execute it in the server lifespan**

In `apps/server/src/api/main.py`, add this constant after `_CREATE_USER_API_KEYS`:

```python
_CREATE_NOTIFICATIONS = """
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS budget_warned_80_at  TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS budget_warned_100_at TIMESTAMPTZ;
"""
```

Then add `await conn.execute(_CREATE_NOTIFICATIONS)` inside the `async with pool.acquire() as conn:` block in `lifespan`, after the `_CREATE_USER_API_KEYS` call.

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/0007_notifications.sql apps/server/src/api/main.py
git commit -m "feat(db): add notifications table and budget_warned columns on tenants"
```

---

## Task 2: `packages/emails` — new package with React Email templates

**Files:**
- Create: `packages/emails/package.json`
- Create: `packages/emails/tsconfig.json`
- Create: `packages/emails/src/templates/WelcomeEmail.tsx`
- Create: `packages/emails/src/templates/PasswordResetEmail.tsx`
- Create: `packages/emails/src/templates/BudgetWarningEmail.tsx`
- Create: `packages/emails/src/index.tsx`

- [ ] **Step 1: Create `packages/emails/package.json`**

```json
{
  "name": "@repo/emails",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.tsx"
  },
  "dependencies": {
    "@react-email/components": "^0.0.35",
    "@react-email/render": "^1.0.0",
    "react": "^19.2.0",
    "resend": "^6.12.2"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@types/node": "^22.15.3",
    "@types/react": "^19.0.0",
    "typescript": "5.9.2"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "clean": "rm -rf dist node_modules"
  }
}
```

- [ ] **Step 2: Create `packages/emails/tsconfig.json`**

```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.tsx", "src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `packages/emails/src/templates/WelcomeEmail.tsx`**

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Text,
} from "@react-email/components";

type Props = { name?: string; appUrl: string };

export function WelcomeEmail({ name, appUrl }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}>
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>Welcome!</Text>
          <Text>Hi {name ?? "there"},</Text>
          <Text>Your account is ready. Start chatting right away.</Text>
          <Button
            href={appUrl}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Open App
          </Button>
          <Text style={{ color: "#888", fontSize: "12px" }}>
            If you didn&apos;t create an account, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 4: Create `packages/emails/src/templates/PasswordResetEmail.tsx`**

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Text,
} from "@react-email/components";

type Props = { url: string };

export function PasswordResetEmail({ url }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}>
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>Reset your password</Text>
          <Text>Click the button below to reset your password. This link expires in 1 hour.</Text>
          <Button
            href={url}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Reset Password
          </Button>
          <Text style={{ color: "#888", fontSize: "12px" }}>
            If you didn&apos;t request this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Create `packages/emails/src/templates/BudgetWarningEmail.tsx`**

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Text,
} from "@react-email/components";

type Props = {
  percent: 80 | 100;
  used: number;
  limit: number;
  upgradeUrl: string;
};

export function BudgetWarningEmail({ percent, used, limit, upgradeUrl }: Props) {
  const isExhausted = percent === 100;
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}>
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
            {isExhausted ? "Token budget exhausted" : "Token budget at 80%"}
          </Text>
          <Text>
            You&apos;ve used {used.toLocaleString()} of {limit.toLocaleString()} tokens this month ({percent}%).
          </Text>
          <Text>
            {isExhausted
              ? "Your account is now rate-limited. Upgrade to continue chatting."
              : "You're approaching your monthly limit. Upgrade to avoid interruptions."}
          </Text>
          <Button
            href={upgradeUrl}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Upgrade Plan
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 6: Create `packages/emails/src/index.tsx`**

```tsx
import { render } from "@react-email/render";
import { Resend } from "resend";
import { BudgetWarningEmail } from "./templates/BudgetWarningEmail";
import { PasswordResetEmail } from "./templates/PasswordResetEmail";
import { WelcomeEmail } from "./templates/WelcomeEmail";

export { WelcomeEmail, PasswordResetEmail, BudgetWarningEmail };

function getResend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return;
  await resend.emails.send({ from, to, subject, html });
}

export async function renderWelcomeEmail(props: { name?: string; appUrl: string }): Promise<string> {
  return render(<WelcomeEmail {...props} />);
}

export async function renderPasswordResetEmail(props: { url: string }): Promise<string> {
  return render(<PasswordResetEmail {...props} />);
}

export async function renderBudgetWarningEmail(props: {
  percent: 80 | 100;
  used: number;
  limit: number;
  upgradeUrl: string;
}): Promise<string> {
  return render(<BudgetWarningEmail {...props} />);
}
```

- [ ] **Step 7: Install deps and verify types**

```bash
pnpm install
pnpm --filter @repo/emails check-types
```

Expected: no errors. If `@react-email/render` has no types, `skipLibCheck: true` in base tsconfig will suppress it.

- [ ] **Step 8: Commit**

```bash
git add packages/emails/
git commit -m "feat(emails): add @repo/emails package with React Email templates"
```

---

## Task 3: Wire `packages/emails` into `packages/auth`

**Files:**
- Modify: `packages/auth/package.json`
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Add `@repo/emails` to `packages/auth/package.json`**

Add `"@repo/emails": "workspace:*"` to the `dependencies` section:

```json
{
  "name": "@repo/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "clean": "rm -rf dist node_modules"
  },
  "dependencies": {
    "@better-auth/expo": "^1.2.7",
    "@repo/db": "workspace:*",
    "@repo/emails": "workspace:*",
    "@repo/env": "workspace:*",
    "better-auth": "^1.5.5",
    "resend": "^6.12.2"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@types/node": "^22.15.3",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 2: Run `pnpm install`**

```bash
pnpm install
```

Expected: no errors.

- [ ] **Step 3: Update `packages/auth/src/index.ts` to use React Email templates**

Replace the file's email-sending logic. The current file has inline `html` strings in `sendVerificationEmail` and `sendResetPassword`. Replace both with the render functions from `@repo/emails`, and add a `databaseHooks.user.create.after` block for the welcome email.

Find the current `sendResetPassword` block:
```typescript
    sendResetPassword: async ({ user, url }) => {
      if (!resend || !env.RESEND_FROM_EMAIL) return;
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Reset your password",
        html: `<p>Hi,</p><p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    },
```

Replace the entire `emailAndPassword` block and add `databaseHooks`. Add these imports at the top of the file:

```typescript
import { renderPasswordResetEmail, renderWelcomeEmail, sendEmail } from "@repo/emails";
```

Remove the `const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;` line and the `import { Resend } from "resend";` line (sendEmail in @repo/emails handles Resend internally).

Replace `sendVerificationEmail` and `sendResetPassword` bodies:

```typescript
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { name?: string | null; email: string };
      url: string;
    }) => {
      const html = `<p>Hi ${user.name ?? "there"},</p><p>Click <a href="${url}">here</a> to verify your email address. This link expires in 24 hours.</p><p>If you didn't create an account, you can ignore this email.</p>`;
      await sendEmail(user.email, "Verify your email address", html);
    },
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      const html = await renderPasswordResetEmail({ url });
      await sendEmail(user.email, "Reset your password", html);
    },
```

Add `databaseHooks` after `emailAndPassword`, before `socialProviders`:

```typescript
  databaseHooks: {
    user: {
      create: {
        after: async (user: { name?: string | null; email: string }) => {
          const html = await renderWelcomeEmail({
            name: user.name ?? undefined,
            appUrl: env.BETTER_AUTH_URL,
          });
          await sendEmail(user.email, "Welcome to AI Native Core", html);
        },
      },
    },
  },
```

- [ ] **Step 4: Verify types**

```bash
pnpm --filter @repo/auth check-types 2>/dev/null || pnpm check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/package.json packages/auth/src/index.ts
git commit -m "feat(auth): use @repo/emails templates, add welcome email on signup"
```

---

## Task 4: FastAPI notifications router + tests (TDD)

**Files:**
- Create: `apps/server/tests/test_notifications.py`
- Create: `apps/server/src/api/routers/notifications.py`
- Modify: `apps/server/src/api/main.py` (import + include router)

- [ ] **Step 1: Write the failing tests**

Create `apps/server/tests/test_notifications.py`:

```python
"""Tests for the notifications router."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.routers.notifications import router
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
    resp = client.get("/notifications")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_requires_auth(app, mock_pool):
    app.state.db_pool = mock_pool
    client = TestClient(app)
    resp = client.get("/notifications")
    assert resp.status_code == 401


def test_list_returns_notifications(app, mock_pool):
    now = datetime.now(UTC)
    mock_pool.fetch.return_value = [
        {
            "id": "abc123",
            "type": "budget_warning_80",
            "title": "Budget at 80%",
            "body": "You've used 80% of your tokens.",
            "read_at": None,
            "created_at": now,
        }
    ]
    client = authed_client(app, mock_pool)
    resp = client.get("/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["type"] == "budget_warning_80"
    assert data[0]["read_at"] is None


def test_mark_read_sets_read_at(app, mock_pool):
    mock_pool.fetchrow.return_value = {"id": "abc123", "user_id": "user-1"}
    client = authed_client(app, mock_pool)
    resp = client.patch("/notifications/abc123/read")
    assert resp.status_code == 200
    mock_pool.execute.assert_called_once()


def test_mark_read_returns_404_for_unknown(app, mock_pool):
    mock_pool.fetchrow.return_value = None
    client = authed_client(app, mock_pool)
    resp = client.patch("/notifications/no-such-id/read")
    assert resp.status_code == 404


def test_mark_all_read(app, mock_pool):
    client = authed_client(app, mock_pool)
    resp = client.patch("/notifications/read-all")
    assert resp.status_code == 200
    mock_pool.execute.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
PYTHONPATH=apps/server/src uv run pytest apps/server/tests/test_notifications.py -v 2>&1 | head -30
```

Expected: `ImportError` or `ModuleNotFoundError` — router doesn't exist yet.

- [ ] **Step 3: Create `apps/server/src/api/routers/notifications.py`**

```python
"""Notifications router — list and mark-read for in-app notifications."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth.deps import AuthUser, get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/notifications", tags=["notifications"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    read_at: datetime | None = None
    created_at: datetime


def _get_pool(request: Request):
    return request.app.state.db_pool


@router.patch("/read-all", status_code=200)
async def mark_all_read(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    await pool.execute(
        "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
        user.id,
    )
    return {"ok": True}


@router.get("", response_model=list[NotificationOut])
async def list_notifications(user: CurrentUser, request: Request, limit: int = 20):
    pool = _get_pool(request)
    rows = await pool.fetch(
        """
        SELECT id::text, type, title, body, read_at, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, created_at DESC
        LIMIT $2
        """,
        user.id,
        limit,
    )
    return [dict(r) for r in rows]


@router.patch("/{notification_id}/read", status_code=200)
async def mark_read(notification_id: str, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM notifications WHERE id::text = $1 AND user_id = $2",
        notification_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    await pool.execute(
        "UPDATE notifications SET read_at = NOW() WHERE id::text = $1",
        notification_id,
    )
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
PYTHONPATH=apps/server/src uv run pytest apps/server/tests/test_notifications.py -v
```

Expected: 6 tests pass.

- [ ] **Step 5: Register the router in `apps/server/src/api/main.py`**

Add `notifications` to the import:
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
    rbac,
    user_api_keys,
)
```

Add `app.include_router(notifications.router)` after `app.include_router(user_api_keys.router)`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/tests/test_notifications.py apps/server/src/api/routers/notifications.py apps/server/src/api/main.py
git commit -m "feat(server): add notifications router with list and mark-read endpoints"
```

---

## Task 5: Budget threshold service + Python Resend config

**Files:**
- Modify: `apps/server/pyproject.toml` (add `resend` dep)
- Modify: `apps/server/src/api/config.py` (add `resend_api_key`, `resend_from_email`)
- Create: `apps/server/src/api/services/budget_notifications.py`
- Create: `apps/server/tests/test_budget_notifications.py`

- [ ] **Step 1: Add `resend` to Python server dependencies**

In `apps/server/pyproject.toml`, add `"resend>=2.0"` to the `dependencies` list:

```toml
dependencies = [
    "ai",
    "agents",
    "memory",
    "rag",
    "tools",
    "prompts",
    "fastapi[standard]>=0.115",
    "asyncer>=0.0.8",
    "anyio>=4.0",
    "python-dotenv>=1.0",
    "pydantic[email]>=2.0",
    "pydantic-settings>=2.0",
    "structlog>=24.0",
    "asyncpg>=0.29",
    "arq>=0.26",
    "python-jose[cryptography]>=3.3",
    "bcrypt>=4.0",
    "stripe>=10.0",
    "resend>=2.0",
]
```

- [ ] **Step 2: Run `uv sync`**

```bash
uv sync
```

Expected: resolves and installs `resend`.

- [ ] **Step 3: Add Resend settings to `apps/server/src/api/config.py`**

Add two fields to the `Settings` class:

```python
resend_api_key: str = ""
resend_from_email: str = ""
```

Place them after `stripe_pro_price_id`.

- [ ] **Step 4: Write the failing tests**

Create `apps/server/tests/test_budget_notifications.py`:

```python
"""Tests for the budget_notifications service."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from api.services.budget_notifications import _should_notify, check_budget_thresholds


def test_should_notify_when_never_warned():
    assert _should_notify(None) is True


def test_should_notify_when_warned_this_month():
    now = datetime.now(UTC)
    assert _should_notify(now) is False


def test_should_notify_when_warned_last_month():
    # A timestamp from the previous month should return True
    from datetime import timedelta

    last_month = datetime.now(UTC).replace(day=1) - timedelta(days=1)
    assert _should_notify(last_month) is True


async def test_budget_check_inserts_notification_at_80_percent():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        side_effect=[
            # First call: tenant row
            {
                "token_limit": 100_000,
                "budget_warned_80_at": None,
                "budget_warned_100_at": None,
            },
            # Second call: usage row
            {"total": 82_000},
        ]
    )
    pool.execute = AsyncMock()

    with patch("api.services.budget_notifications.settings") as mock_settings:
        mock_settings.resend_api_key = ""  # no email sending
        mock_settings.resend_from_email = ""
        mock_settings.web_url = "http://localhost:3000"
        await check_budget_thresholds(pool, "tenant-1", "user@example.com")

    # Should have called execute twice: INSERT notification + UPDATE tenant
    assert pool.execute.call_count == 2


async def test_budget_check_does_not_duplicate_same_month():
    pool = AsyncMock()
    now = datetime.now(UTC)
    pool.fetchrow = AsyncMock(
        side_effect=[
            {
                "token_limit": 100_000,
                "budget_warned_80_at": now,   # already warned this month
                "budget_warned_100_at": None,
            },
            {"total": 82_000},
        ]
    )
    pool.execute = AsyncMock()

    with patch("api.services.budget_notifications.settings") as mock_settings:
        mock_settings.resend_api_key = ""
        mock_settings.resend_from_email = ""
        mock_settings.web_url = "http://localhost:3000"
        await check_budget_thresholds(pool, "tenant-1", "user@example.com")

    # No execute calls — already warned this month
    pool.execute.assert_not_called()


async def test_budget_check_no_action_below_threshold():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"token_limit": 100_000, "budget_warned_80_at": None, "budget_warned_100_at": None},
            {"total": 50_000},  # 50% — below threshold
        ]
    )
    pool.execute = AsyncMock()

    with patch("api.services.budget_notifications.settings") as mock_settings:
        mock_settings.resend_api_key = ""
        mock_settings.resend_from_email = ""
        mock_settings.web_url = "http://localhost:3000"
        await check_budget_thresholds(pool, "tenant-1", "user@example.com")

    pool.execute.assert_not_called()
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
PYTHONPATH=apps/server/src uv run pytest apps/server/tests/test_budget_notifications.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError` for `budget_notifications`.

- [ ] **Step 6: Create `apps/server/src/api/services/budget_notifications.py`**

```python
"""Budget threshold notification service — fires in-app + email alerts at 80% and 100%."""

from __future__ import annotations

import asyncio
import functools
from datetime import UTC, datetime

import asyncpg
import structlog

from ..config import settings

log = structlog.get_logger()


def _should_notify(warned_at: datetime | None) -> bool:
    """Return True if warned_at is NULL or from a prior calendar month."""
    if warned_at is None:
        return True
    now = datetime.now(UTC)
    return warned_at.year < now.year or warned_at.month < now.month


def _budget_warning_html(percent: int, used: int, limit: int, upgrade_url: str) -> str:
    is_exhausted = percent >= 100
    advice = (
        "Your account is now rate-limited. Upgrade to continue chatting."
        if is_exhausted
        else "You're approaching your limit. Upgrade to avoid interruptions."
    )
    return (
        f"<p>You've used <strong>{used:,}</strong> of <strong>{limit:,}</strong> tokens "
        f"this month ({percent}%).</p>"
        f"<p>{advice}</p>"
        f'<p><a href="{upgrade_url}">Upgrade Plan</a></p>'
    )


async def check_budget_thresholds(
    pool: asyncpg.Pool, tenant_id: str, user_email: str
) -> None:
    """Insert notification + send email if budget crosses 80% or 100%.

    Called fire-and-forget from ChatService after recording token usage.
    All failures are logged and swallowed.
    """
    try:
        tenant_row = await pool.fetchrow(
            "SELECT token_limit, budget_warned_80_at, budget_warned_100_at "
            "FROM tenants WHERE id = $1",
            tenant_id,
        )
        if not tenant_row:
            return

        limit: int = tenant_row["token_limit"]
        if limit <= 0:
            return

        usage_row = await pool.fetchrow(
            """
            SELECT COALESCE(SUM(tokens), 0) AS total
            FROM session_token_usage
            WHERE tenant_id = $1
              AND DATE_TRUNC('month', recorded_at) = DATE_TRUNC('month', NOW())
            """,
            tenant_id,
        )
        used: int = int(usage_row["total"]) if usage_row else 0
        percent = used / limit * 100

        upgrade_url = f"{settings.web_url}/billing"

        for threshold, col in (
            (80, "budget_warned_80_at"),
            (100, "budget_warned_100_at"),
        ):
            if percent < threshold:
                continue
            if not _should_notify(tenant_row[col]):
                continue

            title = f"Token budget at {threshold}%"
            body = (
                f"You've used {used:,} of {limit:,} tokens this month ({threshold}%). "
                + ("Upgrade to continue chatting." if threshold == 100 else "Upgrade to avoid interruptions.")
            )

            await pool.execute(
                "INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)",
                tenant_id,
                f"budget_warning_{threshold}",
                title,
                body,
            )
            await pool.execute(
                f"UPDATE tenants SET {col} = NOW() WHERE id = $1",  # noqa: S608
                tenant_id,
            )

            if settings.resend_api_key and settings.resend_from_email:
                try:
                    import resend as resend_sdk  # noqa: PLC0415

                    resend_sdk.api_key = settings.resend_api_key
                    html = _budget_warning_html(threshold, used, limit, upgrade_url)
                    params = {
                        "from": settings.resend_from_email,
                        "to": [user_email],
                        "subject": f"Your token budget is at {threshold}%",
                        "html": html,
                    }
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(
                        None, functools.partial(resend_sdk.Emails.send, params)
                    )
                except Exception as email_exc:
                    log.warning("budget.email.failed", error=str(email_exc))

            log.info(
                "budget.threshold.notified",
                tenant_id=tenant_id,
                threshold=threshold,
                percent=round(percent, 1),
            )

    except Exception as exc:
        log.error("budget.threshold.check.failed", tenant_id=tenant_id, error=str(exc))
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
PYTHONPATH=apps/server/src uv run pytest apps/server/tests/test_budget_notifications.py -v
```

Expected: 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/server/pyproject.toml apps/server/src/api/config.py \
        apps/server/src/api/services/budget_notifications.py \
        apps/server/tests/test_budget_notifications.py
git commit -m "feat(server): add budget_notifications service with 80%/100% threshold checks"
```

---

## Task 6: Wire budget check into ChatService

**Files:**
- Modify: `apps/server/src/api/services/chat_service.py`

- [ ] **Step 1: Add import and fire-and-forget call in `chat_service.py`**

In `apps/server/src/api/services/chat_service.py`, add the import after the existing imports:

```python
from .budget_notifications import check_budget_thresholds
```

Find the line (around line 99):
```python
            await self._session_repo.add_token_usage(session_id, tokens_used, user.id)
```

After that line, add:
```python
            if not is_guest:
                asyncio.ensure_future(
                    check_budget_thresholds(self._session_repo._pool, user.id, user.email)
                )
```

The `_session_repo._pool` is `asyncpg.Pool` — private but internal to the same app.

- [ ] **Step 2: Run all server tests to confirm nothing broke**

```bash
PYTHONPATH=apps/server/src uv run pytest apps/server/tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/api/services/chat_service.py
git commit -m "feat(server): fire budget threshold check after each chat token record"
```

---

## Task 7: Next.js proxy routes for notifications

**Files:**
- Create: `apps/web/src/app/api/notifications/route.ts`
- Create: `apps/web/src/app/api/notifications/[id]/read/route.ts`
- Create: `apps/web/src/app/api/notifications/read-all/route.ts`

- [ ] **Step 1: Create `apps/web/src/app/api/notifications/route.ts`**

```typescript
import { headers } from "next/headers";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/notifications`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/notifications/read-all/route.ts`**

```typescript
import { headers } from "next/headers";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function PATCH() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 3: Create `apps/web/src/app/api/notifications/[id]/read/route.ts`**

```typescript
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/notifications/${id}/read`, {
    method: "PATCH",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 4: Verify types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/notifications/
git commit -m "feat(web): add Next.js proxy routes for notifications"
```

---

## Task 8: Popover UI component

**Files:**
- Create: `packages/ui/src/components/popover.tsx`

- [ ] **Step 1: Create `packages/ui/src/components/popover.tsx`**

The `radix-ui` package is already a dependency of `@repo/ui`. Pattern follows `dialog.tsx`.

```tsx
"use client";

import { cn } from "@repo/ui/lib/utils";
import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
```

- [ ] **Step 2: Verify types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/popover.tsx
git commit -m "feat(ui): add Popover component"
```

---

## Task 9: NotificationBell + NotificationPopover + wire into chat header

**Files:**
- Create: `apps/web/src/features/notifications/components/NotificationBell.tsx`
- Create: `apps/web/src/features/notifications/components/NotificationPopover.tsx`
- Create: `apps/web/src/features/notifications/index.ts`
- Modify: `apps/web/src/app/chat.tsx`

- [ ] **Step 1: Create `apps/web/src/features/notifications/components/NotificationPopover.tsx`**

```tsx
"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import type { ReactNode } from "react";
import type { Notification } from "./NotificationBell";

type Props = {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const BORDER_COLOR: Record<string, string> = {
  budget_warning_80: "border-l-green-500",
  budget_warning_100: "border-l-green-500",
  welcome: "border-l-violet-500",
};

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationPopover({
  notifications,
  onMarkRead,
  onMarkAllRead,
  open,
  onOpenChange,
  children,
}: Props) {
  const recent = notifications.slice(0, 10);
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {hasUnread && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={onMarkAllRead}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            recent.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read_at) onMarkRead(n.id);
                }}
                className={[
                  "w-full border-l-4 px-4 py-3 text-left hover:bg-muted",
                  BORDER_COLOR[n.type] ?? "border-l-transparent",
                  n.read_at ? "opacity-60" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <p className="text-sm font-medium leading-none">{n.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">
                  {timeSince(n.created_at)}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/features/notifications/components/NotificationBell.tsx`**

```tsx
"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationPopover } from "./NotificationPopover";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = (await res.json()) as Notification[];
        setNotifications(data);
      }
    } catch {
      // silently ignore network errors
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleMarkRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
  }, []);

  return (
    <NotificationPopover
      notifications={notifications}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
      open={open}
      onOpenChange={setOpen}
    >
      <button
        type="button"
        className="relative rounded-md p-1.5 hover:bg-muted"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </NotificationPopover>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/features/notifications/index.ts`**

```typescript
export { NotificationBell } from "./components/NotificationBell";
```

- [ ] **Step 4: Wire `NotificationBell` into the chat header in `apps/web/src/app/chat.tsx`**

Add the import at the top of the imports section:
```typescript
import { NotificationBell } from "@/features/notifications";
```

Find the header section (around line 204):
```tsx
          <UserMenu />
        </div>
      </header>
```

Replace with:
```tsx
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
```

- [ ] **Step 5: Verify types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/notifications/ apps/web/src/app/chat.tsx
git commit -m "feat(web): add NotificationBell with popover and 60s polling"
```

---

## Task 10: Final validation + ROADMAP update

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run all Python tests**

```bash
PYTHONPATH=apps/server/src uv run pytest apps/server/tests/ -v
```

Expected: all tests pass (including new `test_notifications.py` and `test_budget_notifications.py`).

- [ ] **Step 2: Run TypeScript type check**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 3: Mark Phase 20 items complete in ROADMAP.md**

In `ROADMAP.md`, find the Phase 20 table and change `⬜` to `✅` for items 98, 99, 100. Items 101 and 102 remain `⬜` (deferred).

- [ ] **Step 4: Commit ROADMAP**

```bash
git add ROADMAP.md
git commit -m "docs: mark Phase 20 items 98-100 complete in roadmap"
```
