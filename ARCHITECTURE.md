# Architecture

AI Native Core is a production-ready monorepo template for building AI-native applications. It provides a complete multi-platform stack — web, mobile, desktop, API, and worker — designed to be forked and adapted for AI products.

---

## 1. System Overview

### Purpose

AI Native Core is a **reusable template** for rapidly building AI-powered applications. The goal is to handle the hard parts — model abstraction, agent orchestration, RAG pipelines, tool calling, streaming, multi-platform scaffolding — so teams can focus on business logic.

Typical workflow:

1. Clone the template
2. Remove apps not needed (`mobile`, `desktop`, `playground`, etc.)
3. Configure prompts and agents
4. Deploy

### Design Philosophy

- **Multi-platform by default** — web, mobile, and desktop apps are included; remove what you don't need.
- **Intelligence as a system primitive** — AI is not an add-on; it's wired into every layer of the stack.
- **Local-first development** — everything runs locally via Docker + Ollama, no cloud credentials needed to get started.
- **Provider-agnostic** — swap between OpenAI, Anthropic, OpenRouter, or Ollama via a single env var.
- **Abstraction over convenience** — no direct SDK calls in app code; all model access goes through `services/ai`.
- **AI logic separate from API** — the API is an orchestration layer; AI services live in `services/`.
- **Modularity** — packages and services have narrow responsibilities and clean dependency boundaries.

### Who It's For

Solo developers and small teams building AI-powered products: chatbots, copilots, document Q&A, autonomous agents, mobile AI assistants, and desktop productivity tools.

---

## 2. Monorepo Structure

```
ai-native-core/
├── apps/
│   ├── extension/              # Browser extension (WXT) — Chrome + Firefox
│   ├── mobile/                 # Expo + React Native — mobile AI assistant
│   ├── playground/             # AI development sandbox — prompt testing, agent debugging
│   ├── server/                 # FastAPI — AI orchestration server (Python)
│   ├── web/                    # Next.js (App Router) + Tailwind v4 + shadcn/ui + Vercel AI SDK
│   │   └── src-tauri/          # Tauri desktop shell (wraps the Next.js frontend)
│   └── worker/                 # ARQ background job processor (Python)
│
├── packages/                   # Shared code (primarily TypeScript / frontend)
│   ├── ui/                     # Shared React components (shadcn/ui base)
│   │   └── src/components/     # Button, Card, Chat, Message, etc.
│   │
│   ├── types/                  # Shared TypeScript types (generated from OpenAPI)
│   │   ├── src/api.ts          # API request/response types
│   │   └── openapi.yaml        # OpenAPI spec (source of truth for TS↔Python interop)
│   │
│   ├── prompts/                # Shared prompt library (Jinja2)
│   │   ├── src/prompts/
│   │   │   ├── system/         # Base system prompts
│   │   │   └── templates/      # Jinja2 templates
│   │   └── pyproject.toml
│   │
│   └── db/                     # Database schema + SQL migrations
│       ├── src/                # TypeScript Drizzle schema (for TS consumers)
│       ├── migrations/         # SQL files — usable from TS (Drizzle) and Python (raw SQL)
│       └── package.json
│
├── services/                   # Python AI service layer
│   ├── ai/                     # LLM abstraction layer
│   │   ├── src/ai/
│   │   │   ├── base.py         # BaseLLM protocol / ABC
│   │   │   ├── factory.py      # get_llm() — selects provider from LLM_PROVIDER env
│   │   │   └── providers/      # openai.py, anthropic.py, openrouter.py, ollama.py
│   │   └── pyproject.toml
│   │
│   ├── agents/                 # LangGraph agent workflows
│   │   ├── src/agents/
│   │   │   ├── base_agent.py   # Abstract StateGraph agent
│   │   │   ├── chat_agent.py   # Conversational agent
│   │   │   └── rag_agent.py    # RAG-augmented agent
│   │   └── pyproject.toml
│   │
│   ├── rag/                    # Ingestion + retrieval pipeline
│   │   ├── src/rag/
│   │   │   ├── ingest/         # Loaders (PDF, web, markdown, text)
│   │   │   ├── chunking.py     # Text splitters
│   │   │   ├── embeddings/     # Ollama (local) + OpenAI (hosted)
│   │   │   └── retriever.py    # PgVector retriever
│   │   └── pyproject.toml
│   │
│   ├── tools/                  # Reusable LangGraph-compatible tools
│   │   ├── src/tools/
│   │   │   ├── base.py             # Tool base class + registry
│   │   │   ├── web_search.py       # Tavily web search
│   │   │   ├── weather.py          # Open-Meteo weather + OSM reverse geocoding
│   │   │   ├── location.py         # Location context assembly (place + weather)
│   │   │   ├── poi.py              # Nearby POI search via Overpass API (OSM)
│   │   │   └── image_generation.py # DALL-E image generation
│   │   └── pyproject.toml
│   │
│   └── memory/                 # Conversation and long-term memory
│       ├── src/memory/
│       │   ├── session.py      # Session history (Postgres)
│       │   ├── episodic.py     # Episode memory (vector embeddings)
│       │   └── compression.py  # Summary compression for long sessions
│       └── pyproject.toml
│
├── infra/
│   ├── docker/                 # Docker configs (compose files, Dockerfiles)
│   └── scripts/                # Dev scripts: setup, seed, migrate
│
├── docs/
│   ├── ARCHITECTURE.md         # This file
│   ├── AI_DEVELOPMENT.md       # AI development guide (prompts, agents, tools)
│   └── PROJECT_CONTEXT.md      # Project context for AI assistants
│
├── config/
│   ├── eslint/                 # Shared ESLint config
│   └── typescript/             # Shared tsconfig bases
│
├── turbo.json                  # Task orchestration (TS + Python via uv run)
├── pnpm-workspace.yaml         # pnpm workspace config
├── pyproject.toml              # Root uv workspace (members: all Python packages)
└── .env.example
```

### Package / Service Dependency Rules

```
apps/extension  → packages/auth
apps/mobile     → packages/ui, packages/types
apps/playground → services/ai, services/agents, packages/prompts
apps/server     → services/ai, services/agents, services/rag, services/tools, services/memory, packages/prompts
apps/web        → packages/ui, packages/types, packages/auth
apps/worker     → services/agents, services/tools
services/agents → services/ai, services/tools, packages/prompts
services/ai     → (no internal deps — base layer)
services/memory → services/ai, services/rag
services/rag    → services/ai
services/tools  → services/ai (optional)
packages/db     → (no internal deps, SQL only)
packages/prompts → (no internal deps)
packages/types  → (no internal deps, generated)
packages/ui     → (no internal deps)
```

**Rules:**

- No circular dependencies.
- `services/ai` has no internal dependencies — it is the base layer.
- App code never imports directly from provider SDKs (`openai`, `anthropic`) — always via `services/ai`.
- Python services and TypeScript packages are independent; they communicate at runtime via HTTP (FastAPI ↔ Next.js).

### TypeScript ↔ Python Type Sharing

FastAPI auto-generates an OpenAPI spec at `/openapi.json`. The `packages/types` package uses `openapi-typescript` to generate TypeScript types from this spec. This is the source of truth for the API contract — no manual duplication.

```bash
# Regenerate types after API changes
pnpm --filter @repo/types generate
```

---

## 3. Applications

### Web (`apps/web`)

Next.js App Router + Tailwind v4 + shadcn/ui + Vercel AI SDK. The primary interface for AI systems.

- AI chat interface with streaming
- Admin dashboards
- Agent testing UI
- RAG debugging

### Mobile (`apps/mobile`)

Expo + React Native. Shares UI components with `apps/web` via `packages/ui` where possible.

- Mobile AI assistants
- Push notifications
- Mobile-first workflows

### Desktop (`apps/web/src-tauri`)

Tauri. The desktop app lives inside `apps/web` — Tauri wraps the Next.js frontend as a native window. Run with `pnpm --filter web desktop:dev`.

- Desktop productivity tools
- Offline-capable AI features
- Native file system access

### Extension (`apps/extension`)

WXT (Web eXtension Template) browser extension targeting Chrome and Firefox. Provides quick access to the AI system from the browser toolbar.

- Popup chat interface
- Background service worker
- Content scripts for page context

### Playground (`apps/playground`)

AI development sandbox — not intended for end users.

- Prompt testing and iteration
- Agent debugging
- RAG experiments
- Model comparisons

### Server (`apps/server`)

FastAPI + Pydantic + LangGraph. Thin orchestration layer — AI logic lives in `services/`.

- REST + SSE endpoints
- Authentication middleware
- Agent execution
- Request validation

### Worker (`apps/worker`)

ARQ background job processor. Handles long-running tasks that would block the API.

- Document ingestion and embedding
- Scheduled agent runs
- Automation pipelines

---

## 4. AI Architecture

### Model Abstraction Layer

All LLM access goes through `services/ai`. The `BaseLLM` protocol defines the interface:

```python
# services/ai/src/ai/base.py
from typing import Any, Protocol, AsyncIterator
from pydantic import BaseModel

class Message(BaseModel):
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str | list[dict[str, Any]]  # multi-modal: text or image/audio parts

class LLMResponse(BaseModel):
    content: str
    usage: Usage | None = None
    model: str | None = None

class BaseLLM(Protocol):
    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse: ...
    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]: ...
    async def embed(self, text: str) -> list[float]: ...
    async def transcribe(self, audio: bytes, filename: str = "audio.webm") -> str: ...
    async def synthesize(self, text: str, voice: str = "alloy") -> AsyncIterator[bytes]: ...
```

`transcribe` and `synthesize` are only implemented by `OpenAIProvider` (Whisper + TTS). Other providers raise `NotImplementedError`.

### Provider Factory

The active provider is selected via the `LLM_PROVIDER` environment variable:

```python
# services/ai/src/ai/factory.py
def get_llm() -> BaseLLM:
    provider = os.environ.get("LLM_PROVIDER", "openai")
    match provider:
        case "openai":     return OpenAIProvider()
        case "anthropic":  return AnthropicProvider()
        case "openrouter": return OpenRouterProvider()
        case "ollama":     return OllamaProvider()
        case _:            raise ValueError(f"Unknown provider: {provider}")
```

Supported providers:

| Provider       | `LLM_PROVIDER` | Required env vars    |
| -------------- | -------------- | -------------------- |
| OpenAI         | `openai`       | `OPENAI_API_KEY`     |
| Anthropic      | `anthropic`    | `ANTHROPIC_API_KEY`  |
| OpenRouter     | `openrouter`   | `OPENROUTER_API_KEY` |
| Ollama (local) | `ollama`       | _(none)_             |

### LangGraph Agents

Agents are defined as LangGraph `StateGraph`s. Each agent has:

- **State**: `TypedDict` with typed fields (messages, context, tool results, etc.)
- **Nodes**: Python async functions that transform state
- **Edges**: Conditional routing between nodes

```python
# services/agents/src/agents/chat_agent.py (simplified)
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage
import operator

class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    session_id: str

def build_chat_graph(llm: BaseLLM) -> StateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_use_tools, {
        "tools": "tools",
        END: END,
    })
    graph.add_edge("tools", "agent")
    return graph.compile()
```

### RAG Pipeline

```
Document Input
    ↓
[Loader] PDF / Web / Markdown / Text
    ↓
[Chunker] RecursiveCharacterTextSplitter (chunk_size=1000, overlap=200)
    ↓
[Embedder] Ollama (nomic-embed-text) or OpenAI (text-embedding-3-small)
    ↓
[PgVector Store] cosine similarity, 1536-dim vectors
    ↓
[Retriever] top-k chunks → context assembly
    ↓
[Agent] RAG-augmented system prompt
```

Embeddings are stored in the `document_chunks` table (Postgres + pgvector). The retriever uses cosine similarity search.

### Memory Service

`services/memory` provides three layers of memory:

- **Session memory**: per-conversation message history stored in Postgres
- **Episode memory**: conversation summaries stored as vector embeddings, retrieved by semantic similarity
- **Summary compression**: when session history exceeds token budget, older messages are summarized and compressed

### Tool System

Tools are Pydantic-validated, LangGraph-compatible functions. Each tool:

1. Has a `name` and `description` (used by the LLM to decide when to call it).
2. Accepts a Pydantic `BaseModel` as input (validated automatically).
3. Returns a string result consumed by the agent.

### Observability

- **LangSmith** tracing: set `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` to enable.
- **Structured logging**: all API requests/responses logged as JSON via Python `structlog`.
- **Token tracking**: usage metadata propagated through agent state and included in API responses.

---

## 5. Data Flow

### Chat (streaming)

```
User types message
    → Frontend sends POST /chat {message, session_id}
    → FastAPI router receives request
    → Loads session memory from Postgres (services/memory)
    → Retrieves RAG context (top-3 chunks)
    → Builds LangGraph ChatAgent with memory + context
    → Agent streams tokens via SSE (text/event-stream)
    → Frontend consumes SSE, updates UI incrementally
    → Final message saved to memory table
```

### RAG Ingestion

```
User uploads document (or API call with text)
    → POST /ingest {content, metadata}
    → FastAPI splits into chunks (or enqueues worker job)
    → Embedder converts chunks to vectors
    → PgVector stores chunks in document_chunks table
    → Returns {chunks_stored: N}
```

### Tool Call (within agent loop)

```
Agent receives LLM response with tool_call
    → LangGraph routes to tool node
    → Tool is looked up in ToolRegistry
    → Input validated via Pydantic
    → Tool executes (web search, DB query, etc.)
    → Result returned as tool message
    → Agent resumes with tool result in context
```

### Audio Transcription

```
Client sends POST /media/transcribe (multipart audio file)
    → FastAPI reads file bytes
    → llm.transcribe(bytes, filename) → OpenAI Whisper API
    → Returns {"text": "..."}
```

### Text-to-Speech

```
Client sends POST /media/tts {text, voice}
    → FastAPI calls llm.synthesize(text, voice)
    → OpenAI TTS API streams MP3 chunks
    → FastAPI streams audio/mpeg back to client
```

---

## 6. Local Development Workflow

### Prerequisites

| Tool    | Version | Install                                            |
| ------- | ------- | -------------------------------------------------- |
| Node.js | ≥ 18    | [nodejs.org](https://nodejs.org)                   |
| pnpm    | ≥ 9     | `npm i -g pnpm`                                    |
| Python  | ≥ 3.11  | [python.org](https://python.org)                   |
| uv      | latest  | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker  | latest  | [docker.com](https://docker.com)                   |
| Ollama  | latest  | [ollama.com](https://ollama.com)                   |

### Setup

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-org/ai-native-core
cd ai-native-core

# 2. Copy env file and configure
cp .env.example .env
# Edit .env: set LLM_PROVIDER=ollama for local dev (no API keys needed)

# 3. Start infrastructure
docker compose up -d

# 4. Pull Ollama models (for local LLM + embeddings)
ollama pull llama3.2
ollama pull nomic-embed-text

# 5. Install all dependencies
pnpm install   # TypeScript packages
uv sync        # Python packages (reads root pyproject.toml workspace)

# 6. Run database migrations
pnpm --filter @repo/db migrate

# 7. Start all apps in development mode
pnpm dev
```

### Services

| Service      | URL                        | Notes                    |
| ------------ | -------------------------- | ------------------------ |
| Web frontend | http://localhost:3000      | Next.js dev server       |
| API          | http://localhost:8000      | FastAPI with auto-reload |
| API docs     | http://localhost:8000/docs | Swagger UI               |
| Playground   | http://localhost:3001      | AI dev sandbox           |
| Ollama       | http://localhost:11434     | Local LLM inference      |
| Postgres     | localhost:5432             | pgvector enabled         |

### Environment Variables

See `.env.example` for all variables. Key ones:

```bash
# Choose your LLM provider
LLM_PROVIDER=ollama          # ollama | openai | anthropic | openrouter

# Provider API keys (only needed for non-Ollama providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aicore

# Observability (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
```

---

## 7. Deployment Architecture

### Recommended Production Setup

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Vercel        │────▶│  Railway / Fly    │────▶│  Neon / Supabase │
│   (Next.js)     │     │  (FastAPI + ARQ)  │     │  (Postgres)      │
│   (mobile PWA)  │     │                  │     │                  │
└─────────────────┘     └──────────────────┘     └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  OpenRouter      │
                         │  (multi-model)   │
                         └──────────────────┘
```

| Component        | Provider                                                      | Notes                                   |
| ---------------- | ------------------------------------------------------------- | --------------------------------------- |
| Web / Playground | [Vercel](https://vercel.com)                                  | Zero-config Next.js deployment          |
| Mobile           | App Store / Play Store                                        | Expo EAS build                          |
| Desktop          | Direct distribution                                           | Tauri generates platform binaries       |
| API + Worker     | [Railway](https://railway.app) or [Fly.io](https://fly.io)    | Dockerfile in `apps/server/`            |
| Database         | [Neon](https://neon.tech) or [Supabase](https://supabase.com) | pgvector supported on both              |
| LLM (prod)       | [OpenRouter](https://openrouter.ai)                           | Pay-per-use, access to all major models |
| LLM (local)      | [Ollama](https://ollama.com)                                  | Self-hosted, GPU optional               |

---

## 8. Coding Standards

### TypeScript

- Strict mode enabled; no `any`.
- Use `type` over `interface` for unions and mapped types; `interface` for object shapes extended by classes.
- Zod for all external data validation (API routes, tool inputs).
- `@repo/` prefix for internal workspace imports.
- camelCase for variables/functions, PascalCase for types/components.

### Python

- Python 3.11+ minimum; use `match` statements, `TypeAlias`, `Self`, etc.
- Type hints required on all function signatures.
- Pydantic `BaseModel` for all data models (request/response bodies, tool inputs, config).
- Ruff for linting and formatting (`ruff check . && ruff format .`).
- snake_case for variables/functions, PascalCase for classes.
- Async by default — use `async def` for all I/O-bound functions.

### Naming Conventions

| Context               | Convention           | Example           |
| --------------------- | -------------------- | ----------------- |
| Folders               | kebab-case           | `rag-pipeline/`   |
| React components      | PascalCase           | `ChatMessage.tsx` |
| Python modules        | snake_case           | `chat_agent.py`   |
| TypeScript variables  | camelCase            | `sessionId`       |
| Python variables      | snake_case           | `session_id`      |
| Environment variables | SCREAMING_SNAKE_CASE | `LLM_PROVIDER`    |

### Critical Rules

- **Never import `openai`, `anthropic`, or other AI SDKs directly in app code.** Use `services/ai`.
- **Never write raw SQL in agent/router code.** Use the Drizzle ORM (TS) or parameterized queries via `asyncpg`/`psycopg` (Python).
- **Never commit secrets.** Use `.env` locally; inject via platform env vars in production.

---

## 9. AI Development Standards

### Prompts

- All system prompts live in `packages/prompts/src/prompts/system/`.
- Use Jinja2 templates for variable injection — no inline f-strings in agent code.
- Version prompts by filename (e.g., `chat_v2.j2`); keep old versions until deprecated.

```python
# Good
from prompts.templates import render_template
system_prompt = render_template("system/chat.j2", {"user_name": user.name})

# Bad — inline prompt in agent code
system_prompt = f"You are a helpful assistant for {user.name}."
```

### Tools

- Must be Pydantic-validated: define `InputModel(BaseModel)` for every tool.
- Must have clear `name` and `description` strings — the LLM reads these to decide when to call.
- Should be idempotent where possible (especially for write operations).
- Must handle errors gracefully and return structured error messages (not raise exceptions).

### Agents

- Defined as LangGraph `StateGraph`s with `TypedDict` state.
- Test graph nodes in isolation before testing the full graph.
- Nodes should be pure functions where possible (state in → state out).
- Use `checkpointer` for long-running agents that need to pause/resume.

### Model Selection

- Default to cheapest capable model for each task:
  - Simple chat: `gpt-4o-mini` or `llama3.2` (Ollama)
  - Complex reasoning: `claude-sonnet-4-6` or `gpt-4o`
  - Embeddings: `nomic-embed-text` (Ollama) or `text-embedding-3-small` (OpenAI)
- Override per-task via agent config, not hardcoded in prompts.
- Set `temperature=0` for deterministic tool calls and classification.

### Cost Control

- Set token budget limits per session via agent config.
- Cache system prompts using provider prompt caching where available (Anthropic: `cache_control`).
- Log token usage on every response; alert if session exceeds budget.

---

## 10. Testing Strategy

### Python (pytest)

```bash
# Run all Python tests
uv run pytest

# Run specific package
uv run pytest services/agents/tests/

# With coverage
uv run pytest --cov=src --cov-report=html
```

- Use `pytest-asyncio` for async tests.
- Mock LLM responses with fixtures — never make real API calls in tests.
- Use `respx` to mock HTTP calls (e.g., external tool APIs).

```python
# Example: mock LLM in agent test
@pytest.fixture
def mock_llm():
    llm = AsyncMock(spec=BaseLLM)
    llm.chat.return_value = LLMResponse(content="Hello!")
    return llm
```

### TypeScript (Vitest)

```bash
# Run all TS tests
pnpm test

# Run specific package
pnpm --filter @repo/ui test
```

- Mock `fetch` for API calls.
- Test React components with `@testing-library/react`.

### Agent Testing Strategy

1. **Unit test each node**: pass mock state in, assert state out.
2. **Integration test full graph**: mock the LLM, run the graph end-to-end.
3. **Golden-answer tests**: run with `temperature=0`, assert exact output matches expected.

### Tool Testing

- Unit test each tool with mocked external APIs.
- Test input validation — confirm Pydantic raises on invalid input.
- Test error handling — confirm tools return error strings, not exceptions.

### Prompt Testing

- Golden-answer tests: fixed input → fixed expected output (temperature=0).
- Store expected outputs as `.txt` files in `tests/fixtures/`.
- Run prompt tests in CI on every PR that modifies `packages/prompts/`.

---

## 11. Future Extensions

### Multi-tenancy

Add `tenant_id` (UUID) to all database tables. Enable Postgres row-level security:

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Authentication

- **Frontend**: NextAuth.js (supports OAuth, email/password, magic links)
- **Backend**: FastAPI-Users or a custom JWT middleware
- Session tokens passed as `Authorization: Bearer <token>` headers

### Billing

- Integrate Stripe for subscription plans.
- Track token usage per user/session in the `usage_events` table.
- Map token counts to cost using provider pricing tables.
- Expose usage dashboard in the frontend.

### Long-term Memory

- **Episode memory**: store conversation summaries as vector embeddings, retrieve relevant episodes.
- **Summary compression**: when session history exceeds token budget, summarize and compress older messages.
- **User preferences**: extract and persist user preferences from conversations as structured data.

### Background Jobs

ARQ (async Redis Queue) is used for background tasks:

```python
# apps/worker/tasks/ingest.py
async def ingest_document(ctx, document_url: str, tenant_id: str):
    """Background task: download, chunk, embed, store a document."""
    ...
```

Tasks are enqueued from the API and processed by `apps/worker`.

### Multi-modal ✅

- **Image input**: send `image_url` content parts in chat messages; supported by OpenAI, Anthropic, and Ollama vision models. The web UI already handles file uploads and image rendering.
- **Image generation**: `GenerateImageTool` in `services/tools` (DALL-E 3); callable from any LangGraph agent.
- **Audio transcription**: `POST /media/transcribe` — upload an audio file, get back text (Whisper via `OpenAIProvider.transcribe()`).
- **Text-to-speech**: `POST /media/tts` — send text, receive a streamed MP3 audio response (`OpenAIProvider.synthesize()`).
- **Structured outputs**: use provider JSON mode or Instructor for reliable Pydantic extraction.

### Evaluation Pipelines ✅

- **Unit tests** (`pytest`, no API keys): agent logic, message conversion, weather tools, prompt registry — `uv run pytest`
- **Golden-answer evals** (`RUN_EVALS=1 uv run pytest services/agents/tests/evals/`): runs real LLM at temperature=0 against JSON Q&A fixtures, asserts keyword presence, enforces ≥80% pass threshold
- **LangSmith integration** (`langsmith_runner.py`): pushes datasets and scored runs to LangSmith when `LANGCHAIN_API_KEY` is set
- **CI** (`.github/workflows/`): `test.yml` runs unit tests + linting on every PR; `eval.yml` runs golden evals on main-branch pushes when `vars.RUN_EVALS == 'true'`
- **Prompt A/B testing**: use `render_prompt("chat", version=N)` with any version from the registry to compare prompt variants on the same eval dataset
