# AI Native Core — Roadmap

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

---

## Completed

- Monorepo (Turborepo + pnpm + uv)
- `services/ai` — BaseLLM protocol + provider factory (OpenAI, Anthropic, OpenRouter, Ollama)
- `services/agents` — LangGraph `ChatAgent` and `RAGAgent`
- `services/rag` — chunking, pgvector retriever, document loaders
- `services/tools` — tool registry, web search tool
- `services/memory` — session memory, episodic memory, summary compression, token budget
- `packages/prompts` — Jinja2 template engine, versioned prompt registry
- `packages/db` — Postgres + pgvector schema, Drizzle ORM migrations
- `packages/types` — TypeScript types (generated from FastAPI OpenAPI spec)
- `apps/mobile` — Expo + React Native
- `apps/playground` — AI dev sandbox
- `apps/server` — FastAPI server with `/chat` (SSE), `/ingest`, `/auth`, `/billing`, `/jobs`
- `apps/web` — Next.js + Tailwind v4 + shadcn/ui + Vercel AI SDK + NextAuth v5
- `apps/worker` — ARQ background job processor (`ingest_document`, `run_agent`)
- **Phase 7** — Structured logging (structlog), token budget, prompt versioning
- **Phase 8** — Auth (JWT + NextAuth v5), multi-tenancy (tenants table), Stripe billing, long-term memory, background agents
- **Phase 9** — Multi-modal: image input (vision), image generation (DALL-E tool), audio transcription (Whisper), TTS streaming (`POST /media/transcribe`, `POST /media/tts`)
- **Phase 22 (partial)** — Observability: `/health/detailed` probe (db/redis/queue/llm); Sentry SDK wired into server, web, and mobile; PostHog product analytics on web and mobile (identify on session, pageview/lifecycle capture)

---

## Phase 9 — Multi-modal ✅

Goal: Add image and audio support so agents can see, hear, and speak.

| Priority | Item                    | Status | Notes                                                                            |
| -------- | ----------------------- | ------ | -------------------------------------------------------------------------------- |
| 36       | **Image input**         | ✅     | Web UI ready; Anthropic/OpenAI/Ollama providers handle `image_url` parts         |
| 37       | **Image generation**    | ✅     | `GenerateImageTool` (DALL-E) in `services/tools`                                 |
| 38       | **Audio transcription** | ✅     | `POST /media/transcribe` via Whisper; `llm.transcribe()` on `OpenAIProvider`     |
| 39       | **Text-to-speech**      | ✅     | `POST /media/tts` streams MP3 audio; `llm.synthesize()` on `OpenAIProvider`      |

---

## Phase 10 — Location and Ambient Context ✅

Goal: Let agents be aware of where the user is and surface location-relevant information.

| Priority | Item                             | Status | Notes                                                                                                  |
| -------- | -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 40       | **Web geolocation**              | ✅     | `useGeolocation()` hook → coords sent via `DefaultChatTransport` body                                  |
| 41       | **Mobile location**              | ✅     | `expo-location` + `useLocation()` hook → same lat/lng contract as web                                  |
| 42       | **Reverse geocoding**            | ✅     | `ReverseGeocodeTool` + `reverse_geocode()` via OSM Nominatim (free, no key)                            |
| 43       | **Weather tool**                 | ✅     | `WeatherTool` + `get_weather()` via Open-Meteo (free, no key)                                          |
| 44       | **Location-aware system prompt** | ✅     | Chat router injects `get_location_context(lat, lng)` as system message when coords present             |
| 45       | **Nearby POI tool**              | ✅     | `NearbyPOITool` via Overpass API (OSM) — restaurants, pharmacies, hotels, etc. (free, no key)          |
| 46       | **Location history**             | ✅     | Chat router stores `"On {date}, the user was in {place}."` in episodic memory per session               |

---

## Phase 11 — Evaluation Pipelines ✅

Goal: Measure and improve agent quality continuously.

| Priority | Item                         | Status | Notes                                                                                    |
| -------- | ---------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| 47       | **Golden-answer test suite** | ✅     | `services/agents/tests/evals/` — JSON fixtures, keyword scoring, `RUN_EVALS=1` to run   |
| 48       | **LangSmith evals**          | ✅     | `langsmith_runner.py` — pushes dataset + scored runs; enabled when `LANGCHAIN_API_KEY` set |
| 49       | **Regression CI**            | ✅     | `.github/workflows/test.yml` (unit, always) + `eval.yml` (evals, on main push)           |
| 50       | **Prompt A/B testing**       | ✅     | `PromptRegistry.versions()` + `render_prompt(name, version=N)` — swap in eval runner    |

---

## Phase 12 — Architecture Refactor ✅

Goal: Clean 3-layer backend (Router → Service → Repository), tool calling in ChatAgent, per-feature runtime AI config, RAG connection pooling, SaaS schema isolation, and feature-based frontend structure.

| Priority | Item                              | Status | Notes                                                                                                   |
| -------- | --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 51       | **SessionRepository**             | ✅     | Wraps `SessionStore` + `TokenBudget`; SQL token limit lookup; `scope(user_id, session_id)` helper       |
| 52       | **ContextService**                | ✅     | Assembles history, episodic facts, location context; returns `tuple[list[BaseMessage], str | None]`     |
| 53       | **ChatService**                   | ✅     | Orchestrates full chat turn; no FastAPI imports; yields SSE tokens; saves messages after streaming      |
| 54       | **Thin chat router**              | ✅     | `POST /chat` → `StreamingResponse(chat_service.stream(...))` — ~10 lines                               |
| 55       | **Tool calling in BaseLLM**       | ✅     | `bind_tools()` + `tool_calls` on `LLMResponse`/`Message`; OpenAI and Anthropic implement it            |
| 56       | **Tool loop in ChatAgent**        | ✅     | Manual `while True` loop: call LLM → execute tools → feed results → repeat until no tool calls        |
| 57       | **Per-feature AI config**         | ✅     | `ai_feature_configs` DB table; `AgentFactory._get_llm(feature)` selects provider/model at runtime      |
| 58       | **RAG connection pooling**        | ✅     | `PgVectorRetriever` accepts `asyncpg.Pool`; `_conn()` context manager avoids per-query connects        |
| 59       | **SaaS schema isolation**         | ✅     | `tenants` → `packages/db/src/schema/saas.ts`; `ai_feature_configs` table added                        |
| 60       | **Feature-based frontend**        | ✅     | `apps/web/src/features/{chat,auth,billing}/` — components + index; route files are thin re-export shells |
| 61       | **Admin AI config endpoint**      | ✅     | `GET/PUT /admin/ai-config` — reads/writes `ai_feature_configs`; hot-reloads `app.state.ai_config`      |

---

## Phase 13 — Auth-Optional + SaaS-Ready ✅

Goal: Allow guests to chat without signing up, enforce monthly per-tenant token budgets, auto-create tenants on registration, and replace the root route with a marketing landing page.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 62 | **Guest chat mode** | ✅ | Unauthenticated users get `guest:{ip}` identity; `proxy.ts` only gates `/billing`, `/profile`, `/settings` |
| 63 | **Monthly tenant budget** | ✅ | `TenantMonthlyBudget` in `services/memory` — sums `session_token_usage` for current month per `tenant_id` |
| 64 | **Guest token cap** | ✅ | `guest:` prefix → 10,000-token monthly cap enforced without a DB row |
| 65 | **Tenant auto-creation** | ✅ | `get_or_create_tenant()` upsert in `SessionRepository`; called on first chat turn for registered users |
| 66 | **Landing page at `/`** | ✅ | `features/landing/LandingPage` with "Try for Free" (→ `/chat`) and "Create an account" CTAs |
| 67 | **Chat moved to `/chat`** | ✅ | `apps/web/src/app/chat/page.tsx`; login/register redirect to `/chat` after auth |
| 68 | **Lefthook git hooks** | ✅ | pre-commit: biome + ruff on staged files (auto-fix + re-stage); pre-push: `pnpm check-types` |

---

## Phase 14 — Auth Completion ✅

Goal: Complete the authentication system with OAuth providers, email verification, profile management, and account lifecycle.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 69 | **Google OAuth** | ✅ | better-auth OAuth plugin; button on login/register pages |
| 70 | **GitHub OAuth** | ✅ | same plugin; useful for dev-tool positioning |
| 71 | **Email verification** | ✅ | Resend verify link on signup; banner until verified |
| 72 | **Profile page** | ✅ | Edit name, email, avatar; `/profile` route on web |
| 73 | **Session management** | ✅ | View active sessions (device, IP, last seen); revoke individual sessions |
| 74 | **Account deletion** | ✅ | Self-service delete with confirmation modal; cancels Stripe subscription |

---

## Phase 15 — RBAC & Security Hardening

Goal: Add role-based access control, properly gate the admin panel, rate limit the API, and add 2FA and audit logging.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 75 | **App-level roles** | ✅ | `isAdmin` flag + full permissions/roles/user_roles/user_permissions tables; `seed_rbac()` seeds built-in permissions |
| 76 | **Admin route gating** | ✅ | `require_permission()` FastAPI dependency on all admin routes; `isAdmin` gate in Next.js proxy + middleware |
| 77 | **Rate limiting middleware** | ✅ | Global 60/min per IP; chat 20/min (session) or 5/min (guest); auth bootstrap 5/min per IP; pure ASGI, SSE-safe |
| 78 | **2FA / TOTP** | ✅ | Authenticator app support (better-auth `twoFactor` plugin); backup codes; Security settings tab; login challenge flow |
| 79 | **Audit log** | ✅ | `audit_logs` table; fire-and-forget helper; admin actions (ban/unban/delete user, tenant plan/limit, account deletion); admin viewer at `/admin/audit-log` |

---

## Phase 16 — Admin Dashboard ✅

Goal: Give operators full visibility and control — user management, tenant management, global analytics, and an audit log viewer.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 80 | **User management UI** | ✅ | ag-grid DataGrid; search, ban/unban, reset password, delete with typed confirmation |
| 81 | **Tenant/org management UI** | ✅ | ag-grid DataGrid; plan + token_limit override modal; token usage rollup per tenant |
| 82 | **Global analytics** | ✅ | `/admin/analytics` — KPI cards (users, Pro subs, MRR, DAU, tokens) + recharts area/line charts; configurable lookback (7/30/90/180d); MRR derived from `PRO_PLAN_MONTHLY_USD` × active Stripe subs |
| 83 | **Audit log viewer** | ✅ | `/admin/audit-log` — ag-grid DataGrid with filters (actor email, action, resource type, since/until); paginated with total count; row click → metadata modal |

---

## Phase 17 — Organizations & Teams

Goal: Support the GitHub model — users have a personal account AND can create/join organizations with shared billing and roles.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 84 | **Organization creation + settings** | ✅ | Name, slug, logo, description; org settings page |
| 85 | **Member invitation flow** | ✅ | Invite by email → accept link → join org; resend/revoke invites |
| 86 | **Org roles + permission checks** | ✅ | `owner`, `admin`, `member`; enforced in API and UI |
| 87 | **Org-level Stripe billing** | ⬜ | Org gets its own Stripe customer; seats-based or flat-rate org plan |
| 88 | **Personal/org context switcher** | ✅ | Header switcher (like GitHub); routes scoped to active context |

---

## Phase 18 — Chat History & Conversations

Goal: Make chat state persistent and manageable — named sessions, sidebar navigation, search, and export.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 89 | **Conversation persistence** | ✅ | Named sessions stored in DB (`conversations` table); title auto-generated from first 60 chars |
| 90 | **Conversation sidebar + switcher** | ✅ | Left sidebar on web listing all conversations grouped by date; click to load |
| 91 | **Conversation management** | ✅ | Inline rename, delete with confirmation dialog |
| 92 | **Full-text search** | ✅ | `GET /conversations/search?q=…` — Postgres FTS over titles + messages (`websearch_to_tsquery`); GIN indexes on `chat_sessions.content` and `conversations.title`; `ts_headline` snippets with `\x02/\x03` highlight sentinels; debounced search box in sidebar |
| 93 | **Conversation export** | ✅ | `GET /conversations/{id}/export?format=markdown\|json` streams a file download; Export submenu in the sidebar dropdown (PDF intentionally deferred — users can print the Markdown if needed) |
| 94 | **Custom system instructions** | ✅ | Global via user_preferences + per-conversation on conversations table; additive resolution in ChatService; AiTab in settings + ConversationInstructions panel in chat |

---

## Phase 19 — User Settings & Preferences

Goal: Give users control over their experience — theme, chat defaults, language, privacy, and programmatic access.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 95 | **Settings page** | ✅ | Theme, chat defaults (model, streaming), language/locale, privacy; web + mobile |
| 96 | **Dark/light/system theme** | ✅ | Web: Tailwind class strategy; mobile: Expo `useColorScheme` |
| 97 | **User API key management** | ✅ | Generate, name, rotate, revoke personal API keys for programmatic access |

---

## Phase 20 — Email & Notifications

Goal: Keep users informed with transactional emails, in-app notifications, budget alerts, and mobile push.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 98 | **Transactional email templates** | ✅ | Welcome, invoice receipt, payment failed, subscription renewed (React Email + Resend) |
| 99 | **In-app notification center** | ✅ | Bell icon + drawer; mark read/unread; system + billing notifications |
| 100 | **Budget warning notifications** | ✅ | Email + in-app alert at 80% and 100% of monthly token budget |
| 101 | **Security alerts** | ✅ | better-auth `session.create.after` hook fires `maybeAlertOnNewLogin`: if the new session's IP is unseen across the user's other sessions (and they have ≥1 prior session), insert a `security_alert` in-app notification and send a `SecurityAlertEmail` (React Email + Resend) with device, IP, time, and a deep link to `/settings?tab=profile`. Best-effort — never throws. Signup is skipped because the first session has no priors. |
| 102 | **Mobile push notifications** | ⬜ | Expo Notifications + push token management |

---

## Phase 21 — Billing Expansion

Goal: Provide full billing transparency, support org seat pricing, free trials, and automated dunning.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 103 | **Invoice history** | ✅ | `GET /billing/invoices` proxies `stripe.Invoice.list` for the tenant's customer; `InvoiceHistory` table on `/billing` shows date, number, amount, status, and links to the hosted receipt and PDF |
| 104 | **Usage analytics charts** | ✅ | `GET /billing/usage` returns daily tokens for the current tenant over a 7/30/90-day window; `UsageChart` (recharts area chart) on `/billing` shows the total and gap-filled time series. Breakdown by feature/model deferred — requires `feature`/`model` columns on `session_token_usage` |
| 105 | **Per-seat pricing for orgs** | ⬜ | `seats` on org plan; enforce seat limit on member invites |
| 106 | **Free trial support** | ⬜ | 14-day trial before charge; trial expiry emails and banners |
| 107 | **Dunning management** | ⬜ | Payment failed → 3-day retry email sequence → downgrade to free |

---

## Phase 22 — Analytics & Observability

Goal: Instrument the product with PostHog, Sentry, health metrics, and an admin analytics dashboard.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 108 | **PostHog integration** | ✅ | `posthog-js` (Next.js App Router) + `posthog-react-native` (Expo); both gated on a key env var so they no-op locally. Web captures `$pageview` on route changes; mobile enables lifecycle autocapture. Both call `posthog.identify(user.id, …)` when a better-auth session is present and `posthog.reset()` on logout. |
| 109 | **Sentry integration** | ✅ | Error tracking + performance monitoring across FastAPI (`sentry-sdk[fastapi]`), Next.js (`@sentry/nextjs` with tunnel route + sourcemap upload), and Expo (`@sentry/react-native`); all gated on a DSN env var so it no-ops in local dev |
| 110 | **Health metrics endpoint** | ✅ | `GET /health/detailed` (admin-gated) — DB `SELECT 1`, ARQ Redis ping, queued_jobs probe, `llm.embed` with bounded timeouts; aggregates ok/degraded/down |
| 111 | **Admin analytics dashboard** | ⬜ | MRR, retention, DAU, token usage trends; built on PostHog or direct DB queries |

---

## Phase 23 — Mobile Parity ✅

Goal: Bring the mobile app to feature parity with web — conversation history, profile, settings, attachments, voice, and push.

Built on a new `@repo/ui-native` component library (ported from `chapters/packages/ui-native`, based on HeroUI Native) and a session-gated `(auth)` / `(drawer)` route split that requires sign-in before reaching chat. Auth UI (login, register, Google + GitHub OAuth, email verification, 2FA challenge, forgot password) shipped as part of this phase even though not listed as a numbered item — without it, mobile had no in-app sign-in path.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 112 | **Mobile conversation history** | ✅ | `app/(drawer)/history.tsx` — `GET /conversations`, debounced search via `/conversations/search`, rename + delete dialogs, pull-to-refresh. Tap row → chat hydrates from `?conversation=<id>` |
| 113 | **Mobile profile page** | ✅ | `app/(drawer)/profile.tsx` — name + email edit via `authClient.updateUser` / `changeEmail`. Avatar render only; upload deferred until the server `upload-avatar` contract is confirmed for multipart |
| 114 | **Mobile full settings** | ✅ | Nested `settings/` stack: Appearance (theme via `Uniwind.setTheme` + SecureStore), API keys (list/create/revoke against `/user/api-keys`, one-time secret + `expo-clipboard`), Account (typed-DELETE confirmation → `authClient.deleteUser`). 2FA enable UI deferred — needs `react-native-qrcode-svg` |
| 115 | **Mobile image attachment** | ✅ | `📎` button → `@expo/react-native-action-sheet` (library / camera) → `expo-image-picker` (`base64: true`, `quality: 0.8`) → preview row → data-URL `file` parts via `useChat({ files })`. Assistant-generated images render via `expo-image` |
| 116 | **Mobile voice I/O** | ✅ | `🎤` → `expo-audio` `useAudioRecorder` → `expo-file-system/legacy.uploadAsync` to `/media/transcribe` → fills input (user can edit before send). `🔊` on completed assistant messages → POST `/media/tts` → cache MP3 via `writeAsStringAsync` → `useAudioPlayer` |
| 117 | **Mobile push notifications** | ✅ | `0015_push_tokens.sql` + Drizzle `pushTokens` table; `POST/DELETE /auth/push-tokens`; `services/push_notifications.send_expo_push` helper (best-effort, prunes `DeviceNotRegistered`); wired into `budget_notifications._notify`. Mobile `usePushRegistration` registers on session; root layout sets a foreground handler + deep-link tap router. Security-alert push (TS side) deferred |

---

## Phase 24 — Onboarding, Legal & Growth

Goal: Ship a polished first-run experience, satisfy legal requirements, and add a referral loop.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 118 | **Onboarding wizard** | ✅ | 3-step web flow at `/onboarding` (Welcome → try a prompt → upgrade CTA) rendered by `features/onboarding/OnboardingWizard`; skip link visible on every step. Tracked via new `user.onboardingCompletedAt` column exposed as a better-auth additional field; `GET/POST /auth/onboarding` (FastAPI) is COALESCE-idempotent. Registration redirects to `/onboarding`; the `/chat` server page redirects there too until the flag is set, so OAuth signups land in the wizard on first login. |
| 119 | **Legal pages** | ✅ | `/terms` and `/privacy` rendered by `features/legal` with a shared `LegalLayout` (top nav back to `/`, `@tailwindcss/typography` prose styling, legal-link footer); content is a reviewable template covering accounts, acceptable use, AI-generated output, billing, retention, sub-processors, and user rights. Footer links added to the landing page. |
| 120 | **GDPR compliance** | ✅ | `GET /auth/export` returns a per-user JSON download (profile, tenant, sessions, conversations, messages, token usage, notifications, audit log, API keys, org memberships) with an `account.exported` audit entry. Account deletion cascades user-owned tables via `ON DELETE CASCADE` and now also wipes `chat_sessions` / `session_token_usage` rows (which had no FK on `"user"`). Cookie consent banner gates PostHog initialization; a Privacy tab in `/settings` lets users re-consent and download their data |
| 121 | **Referral system** | ✅ | `GET/POST /referrals` issues a unique code per user; `/r/{code}` drops a `pending_referral_code` cookie that the register page (and onboarding wizard, for OAuth) POSTs to `/referrals/accept` after auth. Acceptance grants `REFERRAL_BONUS_TOKENS` (50k) to both tenants via a `referral_bonus_tokens` column on `tenants`, added to the monthly limit by `SessionRepository.get_token_limit`. Idempotent (one accept per user), self-referral blocked, audit-logged. New `Referrals` tab in `/settings` shows the share link, accepted count, and bonus amount |

---

## Phase 25 — Developer Platform

Goal: Let developers build on top of the platform with API key auth, webhooks, public API docs, and SDK examples.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 122 | **API key auth middleware** | ✅ | `ak_`-prefixed bearer tokens authenticate any `get_current_user`-protected route (including `POST /chat`); SHA-256 hash lookup in `user_api_keys`, `last_used_at` touched on hit, revoked keys rejected |
| 123 | **Webhook system** | ⬜ | Subscribe to events (message, usage_alert, subscription_change); HMAC-signed payloads |
| 124 | **Public API docs page** | ✅ | `/api-reference` renders Scalar's OpenAPI explorer; spec proxied via `/api/openapi` from FastAPI's `/openapi.json`; dark-mode synced with `next-themes`; linked from the API Keys settings tab |
| 125 | **SDK examples** | ⬜ | Python + TypeScript snippets; auto-generated from OpenAPI spec |

---

## Phase 26 — Document & Knowledge Management

Goal: Expose the existing RAG pipeline through a user-facing UI — upload, manage, and scope knowledge bases.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 126 | **Document upload UI** | ⬜ | Drag-drop + file list + delete; triggers existing `ingest_document` worker job |
| 127 | **Knowledge base scoping** | ⬜ | Per-user and per-org knowledge bases; RAG toggle per conversation |
| 128 | **URL/web ingestion** | ⬜ | Submit a URL → crawl + chunk + embed |
| 129 | **Document status + source attribution** | ⬜ | Processing status indicator in UI; inline source citations in chat |

---

## Maintenance

- Keep `ARCHITECTURE.md` updated as the stack evolves.
- `AGENTS.md` is AI-assistant guidance — update when conventions change.
- All SQL migrations go in `packages/db/migrations/` and are usable from both TS and Python.
