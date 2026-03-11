# AI Native Core — Roadmap

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

---

## Completed

- Monorepo (Turborepo + pnpm + uv)
- `packages/ai` → (target: `services/ai`) — BaseLLM protocol + provider factory (OpenAI, Anthropic, OpenRouter, Ollama)
- `packages/agents` → (target: `services/agents`) — LangGraph `ChatAgent` and `RAGAgent`
- `packages/rag` → (target: `services/rag`) — chunking, pgvector retriever, document loaders
- `packages/tools` → (target: `services/tools`) — tool registry, web search tool
- `packages/prompts` — Jinja2 template engine, system prompt templates
- `apps/api` — FastAPI server with `/chat` (SSE), `/ingest`, `/health`
- `apps/worker` — ARQ background job processor
- `packages/db` — Postgres + pgvector schema, Drizzle ORM migrations
- `packages/types` — TypeScript types (generated from FastAPI OpenAPI spec)

---

## Phase 4 — Frontend Upgrade

Goal: Upgrade the Next.js frontend with Tailwind v4 + shadcn/ui + Vercel AI SDK + React Query.

| Priority | Item | Notes |
|----------|------|-------|
| 10 | **Tailwind v4 migration** | Replace vanilla CSS with Tailwind v4 in `apps/web` |
| 11 | **shadcn/ui integration** | Add shadcn/ui components to `packages/ui` |
| 12 | **Vercel AI SDK** | Replace raw fetch with `ai` SDK for streaming + hooks |
| 13 | **React Query provider** | `@tanstack/react-query` for non-streaming data |
| 14 | **Chat UI components** | Proper Chat, Message, Thinking indicator components |
| 15 | **`packages/types` generation** | `openapi-typescript` from FastAPI spec → TS types |

---

## Phase 5 — Services Restructure

Goal: Move Python AI packages from `packages/` to `services/` and add the memory service.

| Priority | Item | Notes |
|----------|------|-------|
| 16 | **Move `packages/ai` → `services/ai`** | Update all imports in apps/api, apps/worker |
| 17 | **Move `packages/agents` → `services/agents`** | Update workspace pyproject.toml |
| 18 | **Move `packages/rag` → `services/rag`** | Update workspace pyproject.toml |
| 19 | **Move `packages/tools` → `services/tools`** | Update workspace pyproject.toml |
| 20 | **Add `services/memory`** | Session memory + episodic memory + summary compression |
| 21 | **Wire memory service into API** | Replace ad-hoc session handling with `services/memory` |

---

## Phase 6 — New Apps

Goal: Add mobile, desktop, and playground applications.

| Priority | Item | Notes |
|----------|------|-------|
| 22 | **`apps/playground`** | Next.js app for prompt testing, agent debugging, RAG experiments |
| 23 | **`apps/mobile`** | Expo + React Native; shares `packages/ui` and `packages/types` |
| 24 | **`apps/desktop`** | Tauri; wraps web app or standalone desktop UI |

---

## Phase 7 — Observability and Robustness

| Priority | Item | Notes |
|----------|------|-------|
| 25 | **LangSmith tracing** | Optional; set `LANGCHAIN_TRACING_V2=true` |
| 26 | **Structured logging** | `structlog` in Python, consistent JSON log format |
| 27 | **Token budget enforcement** | Per-session limits; alert on overage |
| 28 | **Prompt versioning** | Formalize prompt naming/versioning in `packages/prompts` |

---

## Phase 8 — Scale and Product

| Priority | Item | Notes |
|----------|------|-------|
| 29 | **Authentication** | NextAuth.js (frontend) + FastAPI-Users (backend) |
| 30 | **Multi-tenancy** | `tenant_id` on all DB tables, row-level security |
| 31 | **Billing** | Stripe integration, token usage → cost tracking |
| 32 | **Long-term memory** | Episode memory, summary compression (via `services/memory`) |
| 33 | **Background agents** | ARQ task queue for async agent runs |
| 34 | **Multi-modal** | Image + audio support via vision-capable models |
| 35 | **Evaluation pipelines** | Golden-answer tests, LangSmith evals |

---

## Maintenance

- Keep `ARCHITECTURE.md` updated as the stack evolves.
- `AGENTS.md` is AI-assistant guidance — update when conventions change.
- All SQL migrations go in `packages/db/migrations/` and are usable from both TS and Python.
