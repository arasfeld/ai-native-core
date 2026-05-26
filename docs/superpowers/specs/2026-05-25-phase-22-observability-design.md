# Phase 22 — Analytics & Observability Design

**Goal:** Instrument the stack with error tracking (Sentry), product analytics (PostHog), a detailed health probe, and an expanded admin analytics dashboard so the template ships with the observability foundation a production app needs.

**Tech Stack:** Sentry SDK (`sentry-sdk` for Python, `@sentry/nextjs`, `@sentry/react-native`), PostHog SDK (`posthog-python`, `posthog-js`, `posthog-react-native`), FastAPI, Next.js 16, Expo

---

## Scope

| Roadmap # | Item | Status |
|-----------|------|--------|
| 108 | PostHog integration (web + mobile + server) | Designed |
| 109 | Sentry integration (server + web + mobile) | Designed |
| 110 | Health metrics endpoint (`GET /health/detailed`) | Designed |
| 111 | Admin analytics dashboard expansion (PostHog-backed retention, funnels) | Designed |

---

## Item 110 — Health Metrics Endpoint

Expand the trivial `GET /health` into a two-tier probe:

- `GET /health` — unchanged liveness probe; returns `{status: "ok", version}`. Cheap, no I/O.
- `GET /health/detailed` — readiness probe. Checks all critical dependencies and returns per-dependency status plus an aggregate.

### Response shape

```python
class DependencyHealth(BaseModel):
    name: str            # "database" | "redis" | "queue" | "llm_provider"
    status: Literal["ok", "degraded", "down"]
    latency_ms: float | None = None
    detail: str | None = None  # error message when not ok

class DetailedHealthResponse(BaseModel):
    status: Literal["ok", "degraded", "down"]  # worst across all checks
    version: str
    checks: list[DependencyHealth]
```

### Probes

| Dependency | How | Timeout |
|---|---|---|
| `database` | `await pool.fetchval("SELECT 1")` via `app.state.db_pool` | 2s |
| `redis` | `await arq.ping()` via `app.state.arq` (None → status="down") | 1s |
| `queue` | Same as redis (ARQ is queue + redis); reported separately to distinguish broker liveness from queue depth, which we report via `arq.queued_jobs()` count | 1s |
| `llm_provider` | `get_llm().embed("ok")` — small cheap call; on Ollama this hits the local container, on hosted providers it costs ~$0 | 3s |

Each probe is wrapped in `asyncio.wait_for()`; timeouts and exceptions degrade the dependency rather than failing the request. Aggregate status follows the worst dependency.

### Authorization

`/health/detailed` is admin-only. It returns dependency error strings which could leak internal addresses. Reuse the existing `require_admin` dependency.

### Files

- Modify `apps/server/src/api/routers/health.py` — add `/health/detailed`
- Add `apps/server/tests/test_health.py` — covers ok, db-down, llm-down paths via dependency overrides

---

## Item 109 — Sentry

### Server (`apps/server`)

- Add `sentry-sdk[fastapi]` to `apps/server/pyproject.toml`
- Initialize in `apps/server/src/api/main.py` **before** `FastAPI(...)` so the integration auto-wires
- Env var `SENTRY_DSN` (server); init is a no-op when empty
- Sample rates: `traces_sample_rate=0.1`, `profiles_sample_rate=0.1`, both overridable via env
- Tag every event with `release` (`API_VERSION`) and `environment` (`NODE_ENV` or `ENVIRONMENT`)
- PII: `send_default_pii=False`; we explicitly attach `user.id` in the request middleware where we already resolve `AuthUser`

### Web (`apps/web`)

- Add `@sentry/nextjs` to `apps/web/package.json`
- Run `npx @sentry/wizard@latest -i nextjs` outputs (manually checked in): `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `next.config.js` `withSentryConfig` wrap
- Env vars `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build-time), `SENTRY_ORG`, `SENTRY_PROJECT`
- `tunnelRoute: "/api/monitoring"` to evade ad blockers

### Mobile (`apps/mobile`)

- Add `@sentry/react-native`
- `Sentry.init(...)` in `app/_layout.tsx` top of file
- Env var `EXPO_PUBLIC_SENTRY_DSN`
- Wrap `RootLayout` with `Sentry.wrap()`

### Out of scope

- Source map upload from CI — documented in `.env.example` and ARCHITECTURE but not wired into CI in this phase
- Custom alert rules — provisioned by the operator in the Sentry UI, not in code

---

## Item 108 — PostHog

### Server (`apps/server`)

- Add `posthog` to `apps/server/pyproject.toml`
- Module `apps/server/src/api/services/analytics.py` exposes `track(event, distinct_id, properties)`; a noop when `POSTHOG_API_KEY` is empty
- Events emitted from the server:
  - `chat_message_sent` (after `ChatService.stream()` save), props: `model`, `provider`, `tokens_in`, `tokens_out`, `conversation_id`, `is_guest`
  - `user_signup` (in auth-account creation path)
  - `subscription_created` (Stripe webhook)
  - `budget_alert_triggered` (already a notification — also emit here)
- `distinct_id` = authenticated user id; for guests use the `guest:{ip}` identity to stay consistent with budgeting

### Web (`apps/web`)

- Add `posthog-js` to `apps/web/package.json`
- `apps/web/src/components/posthog-provider.tsx` wraps `app/layout.tsx` `Providers`
- `identify()` on session resolution, `reset()` on sign-out
- Autocapture enabled; session recording behind `NEXT_PUBLIC_POSTHOG_RECORDING=true` env opt-in
- Feature flags exposed via `usePostHog().getFeatureFlag()` — first use case: gating the `/admin/analytics` v2 retention card

### Mobile (`apps/mobile`)

- Add `posthog-react-native`
- Init in `app/_layout.tsx` alongside Sentry
- Same identify/reset lifecycle, hooked into the existing auth client session state

### Env vars

| Var | Where | Purpose |
|---|---|---|
| `POSTHOG_API_KEY` | server | Server-side event ingestion |
| `POSTHOG_HOST` | server (default `https://us.i.posthog.com`) | Self-host override |
| `NEXT_PUBLIC_POSTHOG_KEY` | web | Browser SDK |
| `NEXT_PUBLIC_POSTHOG_HOST` | web | Browser SDK |
| `NEXT_PUBLIC_POSTHOG_RECORDING` | web | Opt-in session recording |
| `EXPO_PUBLIC_POSTHOG_KEY` | mobile | RN SDK |
| `EXPO_PUBLIC_POSTHOG_HOST` | mobile | RN SDK |

---

## Item 111 — Admin Analytics Expansion

The existing `/admin/analytics` page (Phase 16 #82) already covers KPI cards + tokens/DAU/MRR charts driven by direct DB queries. Phase 22 adds two PostHog-backed cards:

- **Retention** — weekly cohort retention table, queried via PostHog Query API server-side from `apps/web/src/app/api/proxy/admin/retention/route.ts`
- **Funnel** — sign-up → first chat → upgrade, same Query API integration

Both cards are wrapped in `Suspense` with skeletons and degrade gracefully when `POSTHOG_API_KEY` is unset (card shows "Configure PostHog to enable").

---

## Deferred / Out of Scope

- Custom Sentry alert rules and dashboards (operator-configured)
- Source-map upload from CI (documented, not automated)
- LogRocket / DataDog alternatives
- Web vitals reporting beyond Sentry's built-in performance
- PostHog reverse proxy via Next.js rewrites (documented as a follow-up; not required for v1)

---

## Acceptance

- `GET /health/detailed` returns per-dependency JSON with sane statuses on a healthy local dev stack
- Throwing a synthetic exception on the server / in the web app / in the mobile app surfaces in Sentry within ~30s when DSNs are set
- Sending a chat message produces a `chat_message_sent` event in PostHog with correct properties
- Admin analytics page renders retention + funnel cards when PostHog is configured, falls back gracefully when not
