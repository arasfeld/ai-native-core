# AI Native Core

A production-ready monorepo template for building AI-native multi-platform applications. Clone it, remove apps you don't need, configure your LLM provider, and ship.

## Stack

| Layer | Technology |
|-------|-----------|
| Web | Next.js (App Router) + Tailwind v4 + shadcn/ui + Vercel AI SDK |
| Mobile | Expo + React Native |
| Desktop | Tauri |
| API | FastAPI (Python) with SSE streaming |
| AI orchestration | LangGraph agents |
| Model abstraction | `services/ai` — OpenAI, Anthropic, OpenRouter, Ollama |
| Multi-modal | Image input (vision), image generation (DALL-E), transcription (Whisper), TTS |
| RAG | pgvector + `services/rag` |
| Memory | `services/memory` — session + long-term memory |
| Background jobs | ARQ worker |
| Database | Postgres + pgvector (Drizzle ORM for migrations) |
| Auth | better-auth — session-based; guest mode (IP identity) included |
| Multi-tenancy | Per-tenant monthly token budgets; auto-created on first chat |
| Monorepo | Turborepo + pnpm (TS) + uv (Python) |
| Git hooks | Lefthook — biome + ruff on pre-commit; `check-types` on pre-push |

## Features

Everything you need to ship an AI product — included and working:

- **Multi-platform** — web (Next.js), mobile (Expo + React Native), desktop (Tauri), browser extension (WXT)
- **Auth** — email/password, Google + GitHub OAuth, email verification, 2FA/TOTP, session management, account deletion
- **RBAC** — roles, permissions, admin panel with user + tenant management, audit log
- **Organizations** — create/join orgs, member invitations, org roles (owner/admin/member), context switcher
- **Chat** — persistent conversation history, sidebar navigation, custom system instructions (global + per-conversation)
- **AI** — streaming chat (SSE), RAG (pgvector), multi-modal (image input, DALL-E, Whisper, TTS), tool calling, LangGraph agents
- **Billing** — Stripe subscriptions, per-tenant monthly token budgets, guest mode with 10k-token cap
- **Notifications** — transactional email (React Email + Resend), in-app notification center, budget alerts
- **User settings** — theme (dark/light/system), chat defaults, personal API key management
- **Background jobs** — ARQ worker for document ingestion and scheduled agent runs

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d
ollama pull llama3.2 && ollama pull nomic-embed-text

# 2. Configure environment
cp .env.example .env
# Default: LLM_PROVIDER=ollama — no API keys needed

# 3. Install dependencies and git hooks
pnpm install && uv sync
pnpm exec lefthook install

# 4. Run migrations
pnpm --filter @repo/db migrate

# 5. Start everything
pnpm dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Playground | http://localhost:3001 |

## Providers

Switch models by setting `LLM_PROVIDER` in `.env`:

| Value | Provider | Requires |
|-------|----------|---------|
| `ollama` | Local (Ollama) | Docker + Ollama |
| `openai` | OpenAI | `OPENAI_API_KEY` |
| `anthropic` | Anthropic | `ANTHROPIC_API_KEY` |
| `openrouter` | OpenRouter | `OPENROUTER_API_KEY` |

## Structure

```
apps/
  web/        Next.js frontend + Tauri desktop shell (src-tauri/)
  mobile/     Expo + React Native
  server/     FastAPI server
  worker/     ARQ background jobs
  playground/ AI development sandbox
  extension/  Browser extension (WXT — Chrome + Firefox)

packages/     Shared TypeScript / frontend code
  ui/         Shared React components (shadcn/ui)
  types/      TypeScript types (generated from OpenAPI)
  auth/       better-auth config + shared client
  emails/     React Email templates (Resend)
  env/        Shared env schema + validation
  tokens/     Token counting utilities
  prompts/    Shared Jinja2 prompt templates
  db/         Postgres schema + migrations

services/     Python AI services
  ai/         LLM provider abstraction
  agents/     LangGraph agent workflows
  rag/        Chunking + pgvector retrieval
  tools/      Reusable agent tools
  memory/     Session + long-term memory
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.
