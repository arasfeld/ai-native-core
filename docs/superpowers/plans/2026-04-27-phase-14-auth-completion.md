# Phase 14 — Auth Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google/GitHub OAuth, email verification, profile editing, session management, and account deletion to complete the auth system.

**Architecture:** All OAuth and email verification flows run through the existing better-auth `toNextJsHandler` at `/api/auth/[...all]`. Profile editing uses `authClient.updateUser()` (better-auth built-in). Session listing/revoking uses better-auth client methods. Account deletion uses a FastAPI proxy route (needs Stripe subscription cancellation before DB row removal).

**Tech Stack:** better-auth v1.5.5, Next.js App Router, FastAPI, asyncpg, Resend, Stripe (optional for account deletion)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/web/src/middleware.ts` | Wires proxy.ts into Next.js — without this, route protection is inactive |
| Modify | `packages/env/src/server.ts` | Add GOOGLE/GITHUB OAuth secret vars |
| Modify | `packages/auth/src/index.ts` | Add `socialProviders` + `sendVerificationEmail` |
| Create | `apps/web/src/features/auth/components/OAuthButtons.tsx` | Reusable Google + GitHub sign-in buttons |
| Modify | `apps/web/src/features/auth/components/LoginPage.tsx` | Add OAuthButtons + divider |
| Modify | `apps/web/src/features/auth/components/RegisterPage.tsx` | Add name field + OAuthButtons |
| Create | `apps/web/src/features/auth/components/EmailVerificationBanner.tsx` | Unverified email warning with resend |
| Create | `apps/web/src/features/profile/components/ProfilePage.tsx` | Profile edit + sessions + account deletion |
| Create | `apps/web/src/features/profile/index.ts` | Feature re-export |
| Create | `apps/web/src/app/profile/page.tsx` | Thin RSC shell for profile route |
| Create | `apps/web/src/app/api/proxy/auth/account/route.ts` | Next.js proxy → `DELETE /auth/account` on FastAPI |
| Modify | `apps/server/src/api/auth/deps.py` | Expand `AuthUser` with `name`, `image`, `email_verified` |
| Modify | `apps/server/src/api/routers/auth.py` | Add GET/PUT `/auth/profile`, GET `/auth/sessions`, DELETE `/auth/sessions/{token}`, DELETE `/auth/account` |
| Create | `apps/server/tests/test_auth_profile.py` | pytest tests for new endpoints |

---

## Task 1: Wire Next.js Middleware

**Files:**
- Create: `apps/web/src/middleware.ts`

- [ ] **Step 1: Create middleware.ts**

```typescript
// apps/web/src/middleware.ts
export { proxy as middleware, proxyConfig as config } from "@/proxy";
```

- [ ] **Step 2: Verify the file type-checks**

```bash
pnpm --filter web check-types
```

Expected: no new type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "fix: wire Next.js middleware so route protection is active"
```

---

## Task 2: Add OAuth Env Vars

**Files:**
- Modify: `packages/env/src/server.ts`

- [ ] **Step 1: Add four OAuth vars to the schema**

In `packages/env/src/server.ts`, add inside the `z.object({...})`:

```typescript
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
```

Place them after `RESEND_FROM_EMAIL`. The full object becomes:

```typescript
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url().default("http://localhost:3000"),
  INTERNAL_SECRET: z.string().default("change-me-internal-secret"),
  API_URL: z.url().default("http://localhost:8000"),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_EMAIL: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/env/src/server.ts
git commit -m "feat(env): add Google and GitHub OAuth secret vars"
```

---

## Task 3: Configure OAuth + Email Verification in better-auth

**Files:**
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Replace the file with the updated config**

```typescript
// packages/auth/src/index.ts
import { expo } from "@better-auth/expo";
import { authSchema, db } from "@repo/db";
import { env } from "@repo/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  trustedOrigins: [
    env.CORS_ORIGIN,
    "ai-native://",
    ...(env.NODE_ENV === "development"
      ? [
          "exp://",
          "exp://**",
          "exp://192.168.*.*:*/**",
          "http://localhost:8081",
        ]
      : []),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      if (!resend || !env.RESEND_FROM_EMAIL) return;
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Verify your email address",
        html: `<p>Hi ${user.name ?? "there"},</p><p>Click <a href="${url}">here</a> to verify your email address. This link expires in 24 hours.</p><p>If you didn't create an account, you can ignore this email.</p>`,
      });
    },
    sendResetPassword: async ({ user, url }) => {
      if (!resend || !env.RESEND_FROM_EMAIL) return;
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Reset your password",
        html: `<p>Hi,</p><p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    },
  },
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    defaultCookieAttributes: {
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as any,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
  },
  plugins: [expo()],
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/auth/src/index.ts
git commit -m "feat(auth): add Google/GitHub OAuth providers and email verification"
```

---

## Task 4: Create OAuthButtons Component

**Files:**
- Create: `apps/web/src/features/auth/components/OAuthButtons.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/features/auth/components/OAuthButtons.tsx
"use client";

import { authClient } from "@/lib/auth-client";

export function OAuthButtons() {
  async function handleGoogle() {
    await authClient.signIn.social({ provider: "google", callbackURL: "/chat" });
  }

  async function handleGithub() {
    await authClient.signIn.social({ provider: "github", callbackURL: "/chat" });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>
      <button
        type="button"
        onClick={handleGithub}
        className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 fill-current"
          aria-hidden="true"
        >
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
        Continue with GitHub
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/auth/components/OAuthButtons.tsx
git commit -m "feat(auth): add OAuthButtons component for Google and GitHub sign-in"
```

---

## Task 5: Update Login Page with OAuth Buttons

**Files:**
- Modify: `apps/web/src/features/auth/components/LoginPage.tsx`

- [ ] **Step 1: Add OAuthButtons + divider above the email/password form**

Replace the full `LoginPage.tsx` with:

```typescript
// apps/web/src/features/auth/components/LoginPage.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { OAuthButtons } from "./OAuthButtons";

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (authError) {
      setError("Invalid email or password.");
    } else {
      router.push("/chat");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-semibold text-2xl">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Enter your credentials to continue
          </p>
        </div>

        <OAuthButtons />

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-muted-foreground text-xs">or continue with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="font-medium text-sm">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="font-medium text-sm">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-muted-foreground text-xs underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/auth/components/LoginPage.tsx
git commit -m "feat(auth): add OAuth buttons to login page"
```

---

## Task 6: Update Register Page with Name Field and OAuth Buttons

**Files:**
- Modify: `apps/web/src/features/auth/components/RegisterPage.tsx`

- [ ] **Step 1: Replace RegisterPage.tsx with name field + OAuthButtons**

```typescript
// apps/web/src/features/auth/components/RegisterPage.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { OAuthButtons } from "./OAuthButtons";

export function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.signUp.email({
      email,
      password,
      name: name.trim() || email.split("@")[0] ?? email,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Registration failed.");
    } else {
      router.push("/chat");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-semibold text-2xl">Create account</h1>
          <p className="text-muted-foreground text-sm">Sign up to get started</p>
        </div>

        <OAuthButtons />

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-muted-foreground text-xs">or continue with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="font-medium text-sm">
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="font-medium text-sm">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="font-medium text-sm">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-muted-foreground text-xs">At least 8 characters</p>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/auth/components/RegisterPage.tsx
git commit -m "feat(auth): add name field and OAuth buttons to register page"
```

---

## Task 7: Add Email Verification Banner

**Files:**
- Create: `apps/web/src/features/auth/components/EmailVerificationBanner.tsx`

The banner is displayed in the chat layout when a user is logged in but hasn't verified their email. It offers a resend button.

- [ ] **Step 1: Create the banner component**

```typescript
// apps/web/src/features/auth/components/EmailVerificationBanner.tsx
"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export function EmailVerificationBanner() {
  const { data: session } = authClient.useSession();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!session?.user || session.user.emailVerified) return null;

  async function handleResend() {
    if (!session) return;
    setSending(true);
    await authClient.sendVerificationEmail({
      email: session.user.email,
      callbackURL: "/chat",
    });
    setSent(true);
    setSending(false);
  }

  return (
    <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <span>Please verify your email address to access all features.</span>
      <button
        type="button"
        onClick={handleResend}
        disabled={sent || sending}
        className="ml-4 font-medium underline underline-offset-4 disabled:opacity-50"
      >
        {sent ? "Email sent!" : sending ? "Sending…" : "Resend verification email"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Export from auth feature index**

Check `apps/web/src/features/auth/index.ts` — if it exists, add the export. If not, create it:

```typescript
// apps/web/src/features/auth/index.ts
export { LoginPage } from "./components/LoginPage";
export { RegisterPage } from "./components/RegisterPage";
export { ForgotPasswordPage } from "./components/ForgotPasswordPage";
export { ResetPasswordPage } from "./components/ResetPasswordPage";
export { OAuthButtons } from "./components/OAuthButtons";
export { EmailVerificationBanner } from "./components/EmailVerificationBanner";
```

- [ ] **Step 3: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/auth/
git commit -m "feat(auth): add email verification banner with resend capability"
```

---

## Task 8: Expand FastAPI AuthUser + Profile Endpoints (with tests)

**Files:**
- Modify: `apps/server/src/api/auth/deps.py`
- Modify: `apps/server/src/api/routers/auth.py`
- Create: `apps/server/tests/test_auth_profile.py`

- [ ] **Step 1: Write failing tests first**

```python
# apps/server/tests/test_auth_profile.py
"""Tests for profile, session, and account deletion endpoints."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from api.routers.auth import router
from api.auth.deps import AuthUser


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    return pool


@pytest.fixture
def authed_client(app, mock_pool):
    """TestClient with the DB pool mounted and auth bypassed."""
    app.state.db_pool = mock_pool

    def override_current_user():
        return AuthUser(
            id="user-1",
            email="test@example.com",
            name="Test User",
            image=None,
            email_verified=True,
        )

    from api.auth.deps import get_current_user
    app.dependency_overrides[get_current_user] = override_current_user

    return TestClient(app)


def test_get_profile_returns_user_fields(authed_client, mock_pool):
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "test@example.com",
            "name": "Test User",
            "image": None,
            "emailVerified": True,
        }
    )

    resp = authed_client.get("/auth/profile")

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "user-1"
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert data["emailVerified"] is True


def test_put_profile_updates_name_and_image(authed_client, mock_pool):
    mock_pool.execute = AsyncMock()
    mock_pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "test@example.com",
            "name": "New Name",
            "image": "https://example.com/avatar.jpg",
            "emailVerified": True,
        }
    )

    resp = authed_client.put(
        "/auth/profile",
        json={"name": "New Name", "image": "https://example.com/avatar.jpg"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["image"] == "https://example.com/avatar.jpg"


def test_get_sessions_returns_list(authed_client, mock_pool):
    mock_pool.fetch = AsyncMock(
        return_value=[
            {
                "id": "sess-1",
                "token": "tok-1",
                "ipAddress": "127.0.0.1",
                "userAgent": "Mozilla/5.0",
                "createdAt": "2026-01-01T00:00:00+00:00",
                "expiresAt": "2026-02-01T00:00:00+00:00",
            }
        ]
    )

    resp = authed_client.get("/auth/sessions")

    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) == 1
    assert sessions[0]["id"] == "sess-1"
    assert sessions[0]["ipAddress"] == "127.0.0.1"


def test_delete_session_revokes_it(authed_client, mock_pool):
    mock_pool.execute = AsyncMock()

    resp = authed_client.delete("/auth/sessions/tok-abc")

    assert resp.status_code == 204
    mock_pool.execute.assert_called_once()
    call_args = mock_pool.execute.call_args[0]
    assert "DELETE" in call_args[0]
    assert "tok-abc" in call_args


def test_delete_account_removes_user(authed_client, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value=None)  # no tenant row
    mock_pool.execute = AsyncMock()

    resp = authed_client.delete("/auth/account")

    assert resp.status_code == 204
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/adam/Code/arasfeld/ai-native-core
uv run pytest apps/server/tests/test_auth_profile.py -v
```

Expected: FAIL — endpoints don't exist yet

- [ ] **Step 3: Update AuthUser in deps.py**

```python
# apps/server/src/api/auth/deps.py
"""FastAPI dependencies for authentication."""

from __future__ import annotations

from typing import Annotated

import asyncpg
import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: str
    email: str
    name: str | None = None
    image: str | None = None
    email_verified: bool = False


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> AuthUser:
    """Resolve the authenticated user by validating the better-auth session directly in Postgres."""
    pool: asyncpg.Pool = request.app.state.db_pool
    token = credentials.credentials if credentials else request.cookies.get("better-auth.session_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        session_token = token.split(".")[0]
        row = await pool.fetchrow(
            """
            SELECT u.id, u.email, u.name, u.image, u."emailVerified"
            FROM "user" u
            JOIN "session" s ON s."userId" = u.id
            WHERE s.token = $1 AND s."expiresAt" > NOW()
            """,
            session_token,
        )
    except Exception as exc:
        log.error("auth.db_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal authentication error",
        ) from exc

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    return AuthUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        email_verified=row["emailVerified"],
    )


async def get_optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> AuthUser | None:
    """Like get_current_user but returns None instead of raising on missing auth."""
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
OptionalUser = Annotated[AuthUser | None, Depends(get_optional_user)]
```

- [ ] **Step 4: Replace auth.py with expanded endpoints**

```python
# apps/server/src/api/routers/auth.py
"""Auth routes — user info, profile management, session management, account deletion."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import CurrentUser

log = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Models ────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    name: str | None = None
    image: str | None = None
    emailVerified: bool = False


class ProfileUpdate(BaseModel):
    name: str | None = None
    image: str | None = None


class SessionOut(BaseModel):
    id: str
    token: str
    ipAddress: str | None = None
    userAgent: str | None = None
    createdAt: str
    expiresAt: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    """Return the currently authenticated user."""
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        image=current_user.image,
        emailVerified=current_user.email_verified,
    )


@router.get("/profile", response_model=UserOut)
async def get_profile(request: Request, current_user: CurrentUser) -> UserOut:
    """Return the current user's full profile."""
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        'SELECT id, email, name, image, "emailVerified" FROM "user" WHERE id = $1',
        current_user.id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        emailVerified=row["emailVerified"],
    )


@router.put("/profile", response_model=UserOut)
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    current_user: CurrentUser,
) -> UserOut:
    """Update the current user's name and/or image."""
    pool = request.app.state.db_pool

    fields: list[str] = []
    values: list[str | None] = []
    idx = 1

    if body.name is not None:
        fields.append(f'"name" = ${idx}')
        values.append(body.name)
        idx += 1
    if body.image is not None:
        fields.append(f'"image" = ${idx}')
        values.append(body.image)
        idx += 1

    if fields:
        values.append(current_user.id)
        await pool.execute(
            f'UPDATE "user" SET {", ".join(fields)}, "updatedAt" = NOW() WHERE id = ${idx}',
            *values,
        )

    row = await pool.fetchrow(
        'SELECT id, email, name, image, "emailVerified" FROM "user" WHERE id = $1',
        current_user.id,
    )
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        emailVerified=row["emailVerified"],
    )


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(request: Request, current_user: CurrentUser) -> list[SessionOut]:
    """List all active sessions for the current user."""
    pool = request.app.state.db_pool
    rows = await pool.fetch(
        """
        SELECT id, token, "ipAddress", "userAgent",
               "createdAt"::text, "expiresAt"::text
        FROM "session"
        WHERE "userId" = $1 AND "expiresAt" > NOW()
        ORDER BY "createdAt" DESC
        """,
        current_user.id,
    )
    return [
        SessionOut(
            id=row["id"],
            token=row["token"],
            ipAddress=row["ipAddress"],
            userAgent=row["userAgent"],
            createdAt=row["createdAt"],
            expiresAt=row["expiresAt"],
        )
        for row in rows
    ]


@router.delete("/sessions/{token}", status_code=204)
async def revoke_session(
    token: str,
    request: Request,
    current_user: CurrentUser,
) -> Response:
    """Revoke a specific session by its token. Only revokes sessions owned by the current user."""
    pool = request.app.state.db_pool
    await pool.execute(
        'DELETE FROM "session" WHERE token = $1 AND "userId" = $2',
        token,
        current_user.id,
    )
    return Response(status_code=204)


@router.delete("/account", status_code=204)
async def delete_account(request: Request, current_user: CurrentUser) -> Response:
    """Permanently delete the current user's account, cancelling any Stripe subscription first."""
    pool = request.app.state.db_pool

    # Cancel Stripe subscription if one exists
    tenant = await pool.fetchrow(
        "SELECT stripe_subscription_id FROM tenants WHERE id = $1",
        current_user.id,
    )
    if tenant and tenant["stripe_subscription_id"]:
        try:
            import stripe  # type: ignore[import-untyped]
            from ..config import settings

            stripe.api_key = settings.stripe_secret_key
            stripe.Subscription.cancel(tenant["stripe_subscription_id"])
            log.info("billing.subscription.cancelled_on_account_delete", user_id=current_user.id)
        except Exception as exc:
            log.warning("billing.subscription.cancel_failed", user_id=current_user.id, error=str(exc))

    # Delete tenant row (no FK cascade from user → tenants)
    await pool.execute("DELETE FROM tenants WHERE id = $1", current_user.id)

    # Delete user — cascades to session, account tables
    await pool.execute('DELETE FROM "user" WHERE id = $1', current_user.id)

    log.info("auth.account.deleted", user_id=current_user.id)
    return Response(status_code=204)
```

- [ ] **Step 5: Run tests — should pass now**

```bash
uv run pytest apps/server/tests/test_auth_profile.py -v
```

Expected: all 5 tests PASS

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
uv run pytest apps/server/tests/ -v
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/auth/deps.py apps/server/src/api/routers/auth.py apps/server/tests/test_auth_profile.py
git commit -m "feat(auth): add profile, session management, and account deletion endpoints"
```

---

## Task 9: Create Next.js Proxy Route for Account Deletion

**Files:**
- Create: `apps/web/src/app/api/proxy/auth/account/route.ts`

The profile page calls this Next.js route, which forwards the DELETE to FastAPI with the session cookie for auth.

- [ ] **Step 1: Check how other proxy routes are structured**

Look at `apps/web/src/app/api/proxy/billing/plan/route.ts` to confirm the proxy pattern. It should look something like:

```typescript
import { env } from "@repo/env/web";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const hdrs = await headers();
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/billing/plan`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create the DELETE proxy route**

```typescript
// apps/web/src/app/api/proxy/auth/account/route.ts
import { env } from "@repo/env/web";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function DELETE() {
  const hdrs = await headers();
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/account`, {
    method: "DELETE",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to delete account" }, { status: res.status });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/proxy/auth/account/route.ts
git commit -m "feat(auth): add Next.js proxy route for account deletion"
```

---

## Task 10: Create ProfilePage Component

**Files:**
- Create: `apps/web/src/features/profile/components/ProfilePage.tsx`
- Create: `apps/web/src/features/profile/index.ts`

- [ ] **Step 1: Create ProfilePage.tsx**

```typescript
// apps/web/src/features/profile/components/ProfilePage.tsx
"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionItem = {
  id: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};

export function ProfilePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  // Profile edit state
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    setSessions((data as SessionItem[]) ?? []);
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
      const res = await fetch("/api/proxy/auth/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Request failed");
      await authClient.signOut();
      router.push("/");
    } catch {
      setDeleteError("Failed to delete account. Please try again.");
      setDeleting(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!session?.user) return null;

  const email = session.user.email ?? "";
  const initials = (session.user.name ?? email.split("@")[0] ?? "").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      <h1 className="font-semibold text-2xl">Profile</h1>

      {/* Avatar + email display */}
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

      {/* Profile edit form */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="font-medium text-lg">Edit profile</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="profile-name" className="font-medium text-sm">
              Display name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="profile-image" className="font-medium text-sm">
              Avatar URL
            </label>
            <input
              id="profile-image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
          {saveSuccess && <p className="text-green-600 text-sm">Changes saved.</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {/* Active sessions */}
      <section className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-lg">Active sessions</h2>
          {!sessionsLoaded && (
            <button
              type="button"
              onClick={loadSessions}
              disabled={loadingSessions}
              className="text-sm text-primary underline underline-offset-4 disabled:opacity-50"
            >
              {loadingSessions ? "Loading…" : "Load sessions"}
            </button>
          )}
        </div>
        {sessionsLoaded && sessions.length === 0 && (
          <p className="text-muted-foreground text-sm">No other active sessions.</p>
        )}
        {sessions.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium">
                {s.userAgent ? s.userAgent.slice(0, 60) : "Unknown device"}
              </p>
              <p className="text-muted-foreground text-xs">
                IP: {s.ipAddress ?? "unknown"} · Created: {new Date(s.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRevokeSession(s.token)}
              className="shrink-0 text-sm text-destructive hover:underline"
            >
              Revoke
            </button>
          </div>
        ))}
      </section>

      {/* Delete account */}
      <section className="space-y-4 rounded-lg border border-destructive/30 p-6">
        <h2 className="font-medium text-lg text-destructive">Delete account</h2>
        <p className="text-muted-foreground text-sm">
          This permanently deletes your account, all conversations, and cancels any active
          subscription. This action cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-destructive px-4 py-2 text-destructive text-sm hover:bg-destructive hover:text-destructive-foreground"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Type <strong>delete my account</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="delete my account"
            />
            {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "delete my account" || deleting}
                className="rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground text-sm hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm deletion"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                  setDeleteError("");
                }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create feature index**

```typescript
// apps/web/src/features/profile/index.ts
export { ProfilePage } from "./components/ProfilePage";
```

- [ ] **Step 3: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/profile/
git commit -m "feat(profile): add ProfilePage with editing, sessions, and account deletion"
```

---

## Task 11: Create Profile Route

**Files:**
- Create: `apps/web/src/app/profile/page.tsx`

- [ ] **Step 1: Create the thin RSC shell**

```typescript
// apps/web/src/app/profile/page.tsx
import { ProfilePage } from "@/features/profile";
export default ProfilePage;
```

- [ ] **Step 2: Type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Verify proxy.ts already protects /profile**

Open `apps/web/src/proxy.ts` and confirm `"/profile"` is in `PROTECTED_PATHS`. It already is (confirmed during exploration).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/profile/page.tsx
git commit -m "feat(profile): add /profile route"
```

---

## Task 12: Final Integration Check and Auth Feature Index

**Files:**
- Check/update: `apps/web/src/features/auth/index.ts`

- [ ] **Step 1: Confirm all auth feature exports exist**

Open `apps/web/src/features/auth/index.ts`. If it doesn't exist, check how auth pages are imported in the route files (e.g., `apps/web/src/app/login/page.tsx`). The route files import directly from `@/features/auth`. Ensure the index exports all components added in this phase:

```typescript
// apps/web/src/features/auth/index.ts
export { LoginPage } from "./components/LoginPage";
export { RegisterPage } from "./components/RegisterPage";
export { ForgotPasswordPage } from "./components/ForgotPasswordPage";
export { ResetPasswordPage } from "./components/ResetPasswordPage";
export { OAuthButtons } from "./components/OAuthButtons";
export { EmailVerificationBanner } from "./components/EmailVerificationBanner";
```

- [ ] **Step 2: Run full type-check**

```bash
pnpm check-types
```

Expected: no errors

- [ ] **Step 3: Run full Python test suite**

```bash
uv run pytest apps/server/tests/ -v
```

Expected: all tests PASS

- [ ] **Step 4: Run TypeScript tests**

```bash
pnpm test
```

Expected: all tests PASS (or no tests for the new components, which is fine)

- [ ] **Step 5: Final commit**

```bash
git add apps/web/src/features/auth/index.ts
git commit -m "feat(auth): export EmailVerificationBanner from auth feature index"
```

---

## Verification

To test the full Phase 14 flow end-to-end:

1. **Middleware** — navigate to `/profile` without being logged in; should redirect to `/login`
2. **OAuth** — set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env.local`; click "Continue with Google" on `/login`; should redirect to Google consent screen and back
3. **Email verification** — register a new account with `RESEND_API_KEY` set; check that a verification email arrives; clicking the link should set `emailVerified = true` in the DB
4. **Profile page** — log in and navigate to `/profile`; edit name; verify it persists after reload
5. **Session management** — click "Load sessions"; should see at least the current session; clicking "Revoke" should remove it from the list
6. **Account deletion** — type `delete my account` and confirm; should redirect to `/`

### Quick smoke test (no OAuth credentials needed):

```bash
# Start the stack
docker compose up -d
pnpm dev

# In a separate terminal, verify middleware is active:
curl -I http://localhost:3000/profile
# Expected: HTTP 307 redirect to /login

# Verify new backend endpoints (with a valid session token):
curl http://localhost:8000/auth/profile \
  -H "Authorization: Bearer <token>"
# Expected: 200 with user JSON
```
