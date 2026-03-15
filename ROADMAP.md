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

## Maintenance

- Keep `ARCHITECTURE.md` updated as the stack evolves.
- `AGENTS.md` is AI-assistant guidance — update when conventions change.
- All SQL migrations go in `packages/db/migrations/` and are usable from both TS and Python.
