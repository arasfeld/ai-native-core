# AI Native Core — Roadmap

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

---

## Completed

- Monorepo (Turborepo + pnpm + uv)
- `packages/ai` — BaseLLM protocol + provider factory (OpenAI, Anthropic, OpenRouter, Ollama)
- `packages/agents` — LangGraph `ChatAgent` and `RAGAgent`
- `packages/rag` — chunking, pgvector retriever, document loaders
- `packages/tools` — tool registry, web search tool
- `packages/prompts` — Jinja2 template engine, system prompt templates
- `apps/api` — FastAPI server with `/chat` (SSE), `/ingest`, `/health`
- `apps/worker` — ARQ background job processor
- `packages/db` — Postgres + pgvector schema, Drizzle ORM migrations
- `packages/types` — TypeScript types (generated from FastAPI OpenAPI spec)

---

## Phase 4 — Frontend Upgrade

Goal: Upgrade the Next.js frontend with Tailwind v4 + shadcn/ui + React Query.

| Priority | Item | Notes |
|----------|------|-------|
| 10 | **Tailwind v4 migration** | Replace vanilla CSS with Tailwind v4 in `apps/web` |
| 11 | **shadcn/ui integration** | Add shadcn/ui components to `packages/ui` |
| 12 | **React Query provider** | Replace raw fetch with `@tanstack/react-query` |
| 13 | **Chat UI components** | Proper Chat, Message, Thinking indicator components |
| 14 | **`packages/types` generation** | `openapi-typescript` from FastAPI spec → TS types |

---

## Phase 5 — Observability and Robustness

| Priority | Item | Notes |
|----------|------|-------|
| 15 | **LangSmith tracing** | Optional; set `LANGCHAIN_TRACING_V2=true` |
| 16 | **Structured logging** | `structlog` in Python, consistent JSON log format |
| 17 | **Token budget enforcement** | Per-session limits; alert on overage |
| 18 | **Prompt versioning** | Formalize prompt naming/versioning in `packages/prompts` |

---

## Phase 6 — Scale and Product

| Priority | Item | Notes |
|----------|------|-------|
| 19 | **Authentication** | NextAuth.js (frontend) + FastAPI-Users (backend) |
| 20 | **Multi-tenancy** | `tenant_id` on all DB tables, row-level security |
| 21 | **Billing** | Stripe integration, token usage → cost tracking |
| 22 | **Long-term memory** | Episode memory, summary compression |
| 23 | **Background agents** | ARQ task queue for async agent runs |
| 24 | **Multi-modal** | Image + audio support via vision-capable models |

---

## Maintenance

- Keep `ARCHITECTURE.md` updated as the stack evolves.
- `AGENTS.md` is AI-assistant guidance — update when conventions change.
- All SQL migrations go in `packages/db/migrations/` and are usable from both TS and Python.
