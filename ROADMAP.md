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
| 78 | **2FA / TOTP** | ⬜ | Authenticator app support (better-auth 2FA plugin); backup codes |
| 79 | **Audit log** | ⬜ | `audit_logs` DB table; record auth/billing/admin actions with actor + timestamp |

---

## Phase 16 — Admin Dashboard

Goal: Give operators full visibility and control — user management, tenant management, global analytics, and an audit log viewer.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 80 | **User management UI** | ✅ | ag-grid DataGrid; search, ban/unban, reset password, delete with typed confirmation |
| 81 | **Tenant/org management UI** | ✅ | ag-grid DataGrid; plan + token_limit override modal; token usage rollup per tenant |
| 82 | **Global analytics** | ⬜ | MRR, DAU, total token usage, signups/day charts |
| 83 | **Audit log viewer** | ⬜ | Browse + filter audit log with actor, action, timestamp, resource |

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
| 92 | **Full-text search** | ⬜ | Search messages by content across all conversations |
| 93 | **Conversation export** | ⬜ | Download as markdown, JSON, or PDF |
| 94 | **Custom system instructions** | ⬜ | Per-conversation OR global user setting for system prompt customization |

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
| 101 | **Security alerts** | ⬜ | Email on new login from unrecognized device/IP |
| 102 | **Mobile push notifications** | ⬜ | Expo Notifications + push token management |

---

## Phase 21 — Billing Expansion

Goal: Provide full billing transparency, support org seat pricing, free trials, and automated dunning.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 103 | **Invoice history** | ⬜ | Pull from Stripe API; list + download PDF links |
| 104 | **Usage analytics charts** | ⬜ | Time-series token usage graph; breakdown by feature/model |
| 105 | **Per-seat pricing for orgs** | ⬜ | `seats` on org plan; enforce seat limit on member invites |
| 106 | **Free trial support** | ⬜ | 14-day trial before charge; trial expiry emails and banners |
| 107 | **Dunning management** | ⬜ | Payment failed → 3-day retry email sequence → downgrade to free |

---

## Phase 22 — Analytics & Observability

Goal: Instrument the product with PostHog, Sentry, health metrics, and an admin analytics dashboard.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 108 | **PostHog integration** | ⬜ | Web + mobile event tracking, funnels, session recording, feature flags |
| 109 | **Sentry integration** | ⬜ | Error tracking + performance monitoring (server + web + mobile) |
| 110 | **Health metrics endpoint** | ⬜ | `GET /health/detailed` — DB, Redis, queue, LLM provider status |
| 111 | **Admin analytics dashboard** | ⬜ | MRR, retention, DAU, token usage trends; built on PostHog or direct DB queries |

---

## Phase 23 — Mobile Parity

Goal: Bring the mobile app to feature parity with web — conversation history, profile, settings, attachments, voice, and push.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 112 | **Mobile conversation history** | ⬜ | List + switch past conversations; matches web UX |
| 113 | **Mobile profile page** | ⬜ | View/edit name, email, avatar; linked from settings drawer |
| 114 | **Mobile full settings** | ⬜ | Theme, notifications, account deletion, API keys |
| 115 | **Mobile image attachment** | ⬜ | Expo ImagePicker; same image upload flow as web |
| 116 | **Mobile voice I/O** | ⬜ | STT via Whisper (record + transcribe); TTS playback of responses |
| 117 | **Mobile push notifications** | ⬜ | Expo Notifications; budget alerts, security alerts |

---

## Phase 24 — Onboarding, Legal & Growth

Goal: Ship a polished first-run experience, satisfy legal requirements, and add a referral loop.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 118 | **Onboarding wizard** | ⬜ | 3-step web flow: create account → try chat → upgrade CTA; skippable |
| 119 | **Legal pages** | ⬜ | `/terms`, `/privacy` — static MDX pages |
| 120 | **GDPR compliance** | ⬜ | Data export endpoint; account deletion wipes all PII; cookie consent banner |
| 121 | **Referral system** | ⬜ | Unique share links → both parties earn bonus tokens |

---

## Phase 25 — Developer Platform

Goal: Let developers build on top of the platform with API key auth, webhooks, public API docs, and SDK examples.

| Priority | Item | Status | Notes |
| -------- | ---- | ------ | ----- |
| 122 | **API key auth middleware** | ⬜ | User API keys (from Phase 19) authenticate `POST /chat` directly |
| 123 | **Webhook system** | ⬜ | Subscribe to events (message, usage_alert, subscription_change); HMAC-signed payloads |
| 124 | **Public API docs page** | ⬜ | In-app OpenAPI explorer at `/api-reference` |
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
