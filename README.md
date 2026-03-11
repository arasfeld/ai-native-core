# AI Native Core

A production-ready monorepo template for building AI-native applications. Fork it, configure your LLM provider, and ship.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router) + Tailwind v4 + shadcn/ui |
| API | FastAPI (Python) with SSE streaming |
| AI orchestration | LangGraph agents |
| Model abstraction | `packages/ai` — OpenAI, Anthropic, OpenRouter, Ollama |
| RAG | pgvector + `packages/rag` |
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
  web/       Next.js frontend
  api/       FastAPI server
  worker/    ARQ background jobs
packages/
  ai/        Python: LLM provider abstraction
  agents/    Python: LangGraph agent workflows
  rag/       Python: chunking + pgvector retrieval
  tools/     Python: reusable agent tools
  prompts/   Shared Jinja2 prompt templates
  db/        Postgres schema + migrations
  ui/        Shared React components
  types/     TypeScript types (generated from OpenAPI)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.
