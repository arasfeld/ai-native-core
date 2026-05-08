# AGENTS.md

Canonical project context for all AI coding assistants (Claude Code, Gemini CLI, Cursor, Copilot, Windsurf, etc.).

> For the full system architecture, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Project Overview

AI Native Core is a production-ready monorepo template for building AI-native multi-platform applications. It uses a hybrid TypeScript + Python stack with LangGraph as the AI orchestration layer.

- **Monorepo Manager:** [Turborepo](https://turbo.build/)
- **Package Managers:** [pnpm](https://pnpm.io/) (TypeScript) + [uv](https://docs.astral.sh/uv/) (Python)
- **Web:** [Next.js](https://nextjs.org/) (React 19) + Tailwind v4 + shadcn/ui + Vercel AI SDK
- **Mobile:** [Expo](https://expo.dev/) + React Native
- **Desktop:** [Tauri](https://tauri.app/)
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **AI Orchestration:** [LangGraph](https://www.langchain.com/langgraph)
- **Model Abstraction:** `services/ai` — BaseLLM protocol with OpenAI, Anthropic, OpenRouter, and Ollama providers
- **Type Safety:** [Zod](https://zod.dev/) (TypeScript) + [Pydantic](https://docs.pydantic.dev/) (Python)

## Monorepo Structure

For the full directory tree and dependency rules, see **[ARCHITECTURE.md §2](./ARCHITECTURE.md#2-monorepo-structure)**.

```
apps/
  extension/  — Browser extension (WXT, Chrome + Firefox)
  mobile/     — Expo + React Native mobile app
  playground/ — AI development sandbox (prompt testing, agent debugging)
  server/     — FastAPI server
  web/        — Next.js frontend (Vercel AI SDK) + Tauri desktop shell (src-tauri/)
  worker/     — ARQ background job processor

packages/     — Shared code (primarily TypeScript / frontend)
  auth/       — better-auth config + shared client
  db/         — Database schema + SQL migrations (Drizzle ORM)
  emails/     — React Email templates (Resend)
  env/        — Shared env schema + validation
  prompts/    — Shared Jinja2 prompt templates
  tokens/     — Token counting utilities
  types/      — Shared TypeScript types (generated from OpenAPI spec)
  ui/         — Shared React components (shadcn/ui)

services/     — Python AI service layer
  agents/     — LangGraph agent workflows
  ai/         — Model abstraction (BaseLLM, provider factory)
  memory/     — Session + long-term memory
  rag/        — Ingestion + retrieval pipeline
  tools/      — Reusable agent tools
```

## Building and Running

### Prerequisites

- Node.js >= 18, pnpm >= 9
- Python >= 3.11, uv (latest)
- Docker + Ollama

### Commands

```bash
# Install all dependencies
pnpm install && uv sync

# Start infrastructure (Postgres + Ollama)
docker compose up -d

# Development mode (all apps)
pnpm dev

# Build all projects
pnpm build

# Type checking (TypeScript)
pnpm check-types

# Lint + format (TypeScript/JSON/CSS — auto-fixes and re-stages)
pnpm check

# Lint + format (Python — auto-fixes and re-stages)
uv run ruff check --fix . && uv run ruff format .

# Run tests
pnpm test           # TypeScript (Vitest)
uv run pytest       # Python (pytest)
```

To run a specific app or package:

```bash
pnpm --filter <package-name> <command>          # TypeScript
uv run --package <package-name> <command>       # Python
```

## Development Conventions

### AI Logic

- **No direct SDK imports in app code.** All LLM access goes through `services/ai`.
- **Provider selection via env var:** set `LLM_PROVIDER=ollama|openai|anthropic|openrouter`.
- **Agents as StateGraphs:** define all agents using LangGraph `StateGraph` in `services/agents`.
- **Pydantic-validated tools:** every tool must define an input `BaseModel` and a `description`.
- **Streaming-first:** design all agent interfaces to support SSE streaming.
- **Prompts in `packages/prompts`:** no inline f-string prompts in agent or router code.
- **Memory via `services/memory`:** don't manage session or long-term memory directly in agent or router code.
- **Multi-modal content:** use `str | list[dict]` for message content; image parts use `{"type": "image_url", "image_url": {"url": ...}}` (OpenAI format — providers convert internally).
- **Audio/image endpoints:** transcription and TTS live in `apps/server/src/api/routers/media.py`; only `OpenAIProvider` implements these — other providers raise `NotImplementedError`.

### TypeScript

- Strict mode, no `any`.
- Zod for all external data validation.
- `@repo/` prefix for internal workspace packages.
- Prefer `type` over `interface` for unions.

### Python

- Python 3.11+, type hints required everywhere.
- Pydantic `BaseModel` for all data models.
- Ruff for lint/format.
- `async def` for all I/O-bound functions.
- snake_case for variables/functions, PascalCase for classes.

### Shared

- **Naming:** kebab-case folders, PascalCase components (TS), snake_case modules (Python).
- **API contract:** FastAPI OpenAPI spec → `openapi-typescript` → `packages/types/src/api.ts`.
- **Database:** SQL migrations in `packages/db/migrations/` (used by both TS and Python).
- **Git hooks (lefthook):** pre-commit runs biome + ruff on staged files (auto-fixes and re-stages); pre-push runs `pnpm check-types`. Run `pnpm exec lefthook install` after cloning.

### Auth + Guest Mode

- **Auth is optional for `/` and `/chat`.** Unauthenticated users get a guest `AuthUser` derived from their IP (`guest:{ip}`), governed by a 10,000-token monthly budget.
- **Protected paths** (`/billing`, `/profile`, `/settings`) still require a session — enforced in `apps/web/src/proxy.ts`.
- **Tenant auto-creation:** `ChatService.stream()` calls `get_or_create_tenant()` on the first message from any registered user (idempotent upsert). Guests never get a tenant row.
- **Token budget:** monthly, per-tenant — `TenantMonthlyBudget` in `services/memory` sums `session_token_usage.tokens` for the current calendar month across all sessions for a `tenant_id`.

## What's Already Built

Before scaffolding anything new, confirm it doesn't already exist:

**Auth:** email/password, Google + GitHub OAuth, email verification, 2FA/TOTP, session management, account deletion
**Access control:** RBAC with roles/permissions, admin panel (user management, tenant management, audit log)
**Organizations:** create/join orgs, member invitations, org roles (owner/admin/member), context switcher
**Chat:** persistent conversation history with sidebar, custom system instructions (global + per-conversation)
**User settings:** theme (dark/light/system), chat defaults, personal API key management
**Billing:** Stripe subscriptions, per-tenant monthly token budgets, guest mode with 10k-token cap
**Notifications:** transactional email (React Email + Resend), in-app notification center, budget alerts
**AI:** streaming chat (SSE), RAG (pgvector), multi-modal (image input, DALL-E, Whisper, TTS), tool calling, LangGraph agents
**Infrastructure:** rate limiting middleware, audit logging, ARQ background jobs, structured logging

## Roadmap

See **[ROADMAP.md](./ROADMAP.md)** for the migration path and upcoming work.
