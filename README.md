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
| RAG | pgvector + `services/rag` |
| Memory | `services/memory` — session + long-term memory |
| Background jobs | ARQ worker |
| Database | Postgres + pgvector (Drizzle ORM for migrations) |
| Monorepo | Turborepo + pnpm (TS) + uv (Python) |

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d
ollama pull llama3.2 && ollama pull nomic-embed-text

# 2. Configure environment
cp .env.example .env
# Default: LLM_PROVIDER=ollama — no API keys needed

# 3. Install dependencies
pnpm install && uv sync

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
  web/        Next.js frontend
  mobile/     Expo + React Native
  desktop/    Tauri desktop app
  api/        FastAPI server
  worker/     ARQ background jobs
  playground/ AI development sandbox

packages/     Shared TypeScript / frontend code
  ui/         Shared React components
  types/      TypeScript types (generated from OpenAPI)
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
