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
- `apps/api` — FastAPI server with `/chat` (SSE), `/ingest`, `/auth`, `/billing`, `/jobs`
- `apps/worker` — ARQ background job processor (`ingest_document`, `run_agent`)
- `apps/web` — Next.js + Tailwind v4 + shadcn/ui + Vercel AI SDK + NextAuth v5
- `apps/mobile` — Expo + React Native
- `apps/desktop` — Tauri
- `apps/playground` — AI dev sandbox
- **Phase 7** — Structured logging (structlog), token budget, prompt versioning
- **Phase 8** — Auth (JWT + NextAuth v5), multi-tenancy (tenants table), Stripe billing, long-term memory, background agents

---

## Phase 9 — Multi-modal

Goal: Add image and audio support so agents can see, hear, and speak.

| Priority | Item | Notes |
|----------|------|-------|
| 36 | **Image input** | Accept image uploads in chat; pass to vision-capable models (GPT-4o, Claude 3.5) |
| 37 | **Image generation** | DALL-E / Stable Diffusion tool in `services/tools` |
| 38 | **Audio transcription** | Whisper (OpenAI or local) for voice-to-text input |
| 39 | **Text-to-speech** | Stream TTS audio back via SSE for voice responses |

---

## Phase 10 — Location and Ambient Context

Goal: Let agents be aware of where the user is and surface location-relevant information.

| Priority | Item | Notes |
|----------|------|-------|
| 40 | **Web geolocation** | Browser `navigator.geolocation` → send lat/lng with each chat request |
| 41 | **Mobile location** | Expo `expo-location` → same lat/lng contract, foreground + background |
| 42 | **Reverse geocoding** | lat/lng → human-readable place (city, neighbourhood) via OSM Nominatim or Google |
| 43 | **Weather tool** | LangGraph tool in `services/tools`: current weather + forecast via Open-Meteo (free) or OpenWeatherMap |
| 44 | **Location-aware system prompt** | Inject resolved place + weather into system prompt when location is available |
| 45 | **Nearby POI tool** | Overpass API (OSM) or Google Places — "restaurants near me", "pharmacies open now" |
| 46 | **Location history** | Optionally store locations in episodic memory ("User is usually in NYC") |

---

## Phase 11 — Evaluation Pipelines

Goal: Measure and improve agent quality continuously.

| Priority | Item | Notes |
|----------|------|-------|
| 47 | **Golden-answer test suite** | `pytest` fixtures with reference Q&A pairs; assert semantic similarity |
| 48 | **LangSmith evals** | Push eval datasets + runs to LangSmith for dataset-level scoring |
| 49 | **Regression CI** | Run eval suite on every PR; fail if score drops below threshold |
| 50 | **Prompt A/B testing** | Use prompt versioning registry to compare v1 vs v2 on same dataset |

---

## Maintenance

- Keep `ARCHITECTURE.md` updated as the stack evolves.
- `AGENTS.md` is AI-assistant guidance — update when conventions change.
- All SQL migrations go in `packages/db/migrations/` and are usable from both TS and Python.
