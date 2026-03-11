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

```
apps/
  web/        — Next.js frontend (Vercel AI SDK)
  mobile/     — Expo + React Native mobile app
  desktop/    — Tauri desktop app
  api/        — FastAPI server
  worker/     — ARQ background job processor
  playground/ — AI development sandbox (prompt testing, agent debugging)

packages/     — Shared code (primarily TypeScript / frontend)
  ui/         — Shared React components (shadcn/ui)
  types/      — Shared TypeScript types (generated from OpenAPI spec)
  prompts/    — Shared Jinja2 prompt templates
  db/         — Database schema + SQL migrations (Drizzle ORM)

services/     — Python AI service layer
  ai/         — Model abstraction (BaseLLM, provider factory)
  agents/     — LangGraph agent workflows
  rag/        — Ingestion + retrieval pipeline
  tools/      — Reusable agent tools
  memory/     — Session + long-term memory
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

# Lint + format (TypeScript)
pnpm lint && pnpm format

# Lint + format (Python)
uv run ruff check . && uv run ruff format .

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

## Roadmap

See **[ROADMAP.md](./ROADMAP.md)** for the migration path and upcoming work.
