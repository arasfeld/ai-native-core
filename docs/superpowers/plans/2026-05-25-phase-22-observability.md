# Phase 22 — Analytics & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four Phase 22 items — health metrics endpoint, Sentry, PostHog, and PostHog-backed analytics — as outlined in `specs/2026-05-25-phase-22-observability-design.md`.

**Order rationale:** Task 1 (health) needs no external credentials and can ship today. Tasks 2–3 (Sentry) need a `SENTRY_DSN`. Tasks 4–6 (PostHog) need a project key. Task 7 depends on PostHog being live.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/server/src/api/routers/health.py` | Add `/health/detailed` |
| Create | `apps/server/tests/test_health.py` | Coverage for the new probe |
| Modify | `apps/server/pyproject.toml` | Add `sentry-sdk[fastapi]`, `posthog` |
| Modify | `apps/server/src/api/main.py` | Initialize Sentry before FastAPI |
| Create | `apps/server/src/api/services/analytics.py` | PostHog wrapper |
| Modify | `apps/server/src/api/services/chat_service.py` | Emit `chat_message_sent` |
| Modify | `apps/server/src/api/routers/auth.py` | Emit `user_signup` |
| Modify | `apps/server/src/api/routers/billing.py` | Emit `subscription_created` |
| Modify | `apps/server/src/api/config.py` | New env vars |
| Modify | `apps/web/package.json` | `@sentry/nextjs`, `posthog-js` |
| Create | `apps/web/sentry.client.config.ts` | Sentry browser init |
| Create | `apps/web/sentry.server.config.ts` | Sentry server init |
| Create | `apps/web/sentry.edge.config.ts` | Sentry edge init |
| Create | `apps/web/instrumentation.ts` | Next.js instrumentation hook |
| Modify | `apps/web/next.config.js` | Wrap with `withSentryConfig` |
| Create | `apps/web/src/components/posthog-provider.tsx` | PostHog provider |
| Modify | `apps/web/src/components/providers.tsx` | Mount PostHogProvider |
| Modify | `packages/env/src/web.ts` | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*` |
| Modify | `packages/env/src/server.ts` | `SENTRY_DSN`, `POSTHOG_*` |
| Modify | `apps/mobile/package.json` | `@sentry/react-native`, `posthog-react-native` |
| Modify | `apps/mobile/app/_layout.tsx` | Init Sentry + PostHog |
| Create | `apps/web/src/app/api/proxy/admin/retention/route.ts` | PostHog retention query |
| Create | `apps/web/src/features/admin/components/RetentionCard.tsx` | UI card |
| Create | `apps/web/src/features/admin/components/FunnelCard.tsx` | UI card |
| Modify | `apps/web/src/app/admin/analytics/page.tsx` | Mount new cards |
| Modify | `ROADMAP.md` | Mark items 108–111 ✅ when shipped |
| Modify | `AGENTS.md` | Add Observability bullet to "What's Already Built" |

---

## Task 1: Health metrics endpoint (#110)

**Files:**
- Modify: `apps/server/src/api/routers/health.py`
- Create: `apps/server/tests/test_health.py`

- [ ] **Step 1: Add detailed response models**

  In `health.py`, add `Literal` and `asyncio` imports, then define:

  ```python
  class DependencyHealth(BaseModel):
      name: str
      status: Literal["ok", "degraded", "down"]
      latency_ms: float | None = None
      detail: str | None = None

  class DetailedHealthResponse(BaseModel):
      status: Literal["ok", "degraded", "down"]
      version: str
      checks: list[DependencyHealth]
  ```

- [ ] **Step 2: Implement individual probes**

  Each probe wraps a coroutine in `asyncio.wait_for()`, catches `(asyncio.TimeoutError, Exception)`, and returns a `DependencyHealth`. Timeouts: db=2s, redis=1s, queue=1s, llm=3s.

- [ ] **Step 3: Add `/health/detailed` handler**

  Inject `Request` to read `request.app.state.db_pool`, `request.app.state.arq`. Use the existing `require_admin` dependency (import from `..auth.deps`). Aggregate status: `"down"` beats `"degraded"` beats `"ok"`.

- [ ] **Step 4: Tests**

  Use `httpx.AsyncClient` against the FastAPI `app` with overridden dependencies. Cover:
  - Healthy stack → 200, all checks ok
  - DB pool unavailable → status `down`, db check `down`
  - LLM provider raises → status `degraded`, llm check `down`
  - Non-admin caller → 403

- [ ] **Step 5: Run tests, format, commit**

  `uv run pytest apps/server/tests/test_health.py` then `uv run ruff check --fix . && uv run ruff format .`. Commit message:
  `feat(server): add /health/detailed probe for db/redis/queue/llm`

---

## Task 2: Sentry server (#109 part 1)

**Files:**
- Modify: `apps/server/pyproject.toml`, `apps/server/src/api/main.py`, `apps/server/src/api/config.py`, `apps/server/.env.example` (if present)

- [ ] **Step 1: Add `sentry-sdk[fastapi]` and run `uv sync`**

- [ ] **Step 2: Add Sentry settings to `config.py`**

  ```python
  sentry_dsn: str = ""
  sentry_environment: str = "development"
  sentry_traces_sample_rate: float = 0.1
  sentry_profiles_sample_rate: float = 0.1
  ```

- [ ] **Step 3: Initialize before FastAPI**

  At the top of `main.py` after `configure_logging(...)`:
  ```python
  if settings.sentry_dsn:
      sentry_sdk.init(
          dsn=settings.sentry_dsn,
          environment=settings.sentry_environment,
          traces_sample_rate=settings.sentry_traces_sample_rate,
          profiles_sample_rate=settings.sentry_profiles_sample_rate,
          send_default_pii=False,
          release="0.1.0",
      )
  ```

- [ ] **Step 4: Attach user id from auth middleware**

  Where `AuthUser` is resolved (likely `auth/deps.py`), call `sentry_sdk.set_user({"id": user.id})` for non-guest users.

- [ ] **Step 5: Smoke test, commit**

  Raise a synthetic exception from a test route, verify Sentry receives it (manual). Commit:
  `feat(server): add Sentry SDK initialization`

---

## Task 3: Sentry web + mobile (#109 part 2)

**Files:** see File Map.

- [ ] **Step 1: Install `@sentry/nextjs` in `apps/web`**
- [ ] **Step 2: Add `sentry.{client,server,edge}.config.ts` and `instrumentation.ts`** — Use the latest Sentry Next.js 16 template from their docs (do not run the interactive wizard inside the repo).
- [ ] **Step 3: Wrap `next.config.js` in `withSentryConfig` with `tunnelRoute: "/api/monitoring"` and `silent: true` in CI.**
- [ ] **Step 4: Add `NEXT_PUBLIC_SENTRY_DSN` to `packages/env/src/web.ts`.**
- [ ] **Step 5: Install `@sentry/react-native` in `apps/mobile`.**
- [ ] **Step 6: Initialize Sentry at the top of `apps/mobile/app/_layout.tsx`, wrap `RootLayout` with `Sentry.wrap()`.**
- [ ] **Step 7: Add `EXPO_PUBLIC_SENTRY_DSN` to mobile env (where it's read).**
- [ ] **Step 8: Smoke test from a throwaway button in dev, then commit.**

  Commit: `feat(web,mobile): add Sentry SDK integration`

---

## Task 4: PostHog server (#108 part 1)

**Files:** see File Map.

- [ ] **Step 1: Add `posthog` dep, `uv sync`.**
- [ ] **Step 2: Create `services/analytics.py`** with module-level `_client` initialized when `POSTHOG_API_KEY` is set:

  ```python
  _client: Posthog | None = None

  def init_analytics() -> None:
      global _client
      if settings.posthog_api_key:
          _client = Posthog(settings.posthog_api_key, host=settings.posthog_host)

  def track(event: str, distinct_id: str, properties: dict | None = None) -> None:
      if _client:
          _client.capture(distinct_id, event, properties or {})
  ```

- [ ] **Step 3: Call `init_analytics()` in `main.py` lifespan.**
- [ ] **Step 4: Emit `chat_message_sent` from `ChatService.stream()`** after the message is persisted, with `model`, `provider`, `tokens_in`, `tokens_out`, `conversation_id`, `is_guest`.
- [ ] **Step 5: Emit `user_signup` and `subscription_created` from `auth.py` and `billing.py` respectively.**
- [ ] **Step 6: Tests** — mock `_client` and assert `capture` calls.
- [ ] **Step 7: Commit.**

  Commit: `feat(server): add PostHog event tracking for chat, signup, subscription`

---

## Task 5: PostHog web (#108 part 2)

**Files:** see File Map.

- [ ] **Step 1: Install `posthog-js` in `apps/web`.**
- [ ] **Step 2: Create `posthog-provider.tsx`** that initializes `posthog-js` on mount, identifies on session, resets on sign-out.
- [ ] **Step 3: Wrap inside `Providers` so it's available everywhere.**
- [ ] **Step 4: Add envs to `packages/env/src/web.ts`.**
- [ ] **Step 5: Commit.**

  Commit: `feat(web): add PostHog browser SDK with identify/reset lifecycle`

---

## Task 6: PostHog mobile (#108 part 3)

**Files:** see File Map.

- [ ] **Step 1: Install `posthog-react-native`.**
- [ ] **Step 2: Init at top of `app/_layout.tsx`, wrap with `<PostHogProvider client={...}>`.**
- [ ] **Step 3: Identify/reset from auth lifecycle.**
- [ ] **Step 4: Commit.**

  Commit: `feat(mobile): add PostHog React Native SDK`

---

## Task 7: Admin analytics expansion (#111)

**Files:** see File Map.

- [ ] **Step 1: Add `apps/web/src/app/api/proxy/admin/retention/route.ts`** — server-side fetch to PostHog Query API using `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID`. Falls back to a `disabled: true` payload when env is unset.
- [ ] **Step 2: Add `funnel/route.ts` similarly.**
- [ ] **Step 3: Build `RetentionCard` + `FunnelCard` shadcn-styled components.**
- [ ] **Step 4: Mount them in `app/admin/analytics/page.tsx` below the existing KPI/charts.**
- [ ] **Step 5: Commit.**

  Commit: `feat(web): add retention + funnel cards to admin analytics`

---

## Closing

- [ ] **Update `ROADMAP.md`** — mark 108–111 ✅
- [ ] **Update `AGENTS.md` "What's Already Built"** — add an "Observability: Sentry, PostHog, detailed health endpoint" bullet
- [ ] **Final commit:** `docs: mark Phase 22 (observability) complete in ROADMAP`
