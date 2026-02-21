# AI Native Core

AI Native Core is a production-ready, AI-native monorepo template
designed for building intelligent web and mobile applications.

It provides:

- AI orchestration infrastructure
- Typed tool execution system
- Retrieval (RAG) foundations
- Memory persistence architecture
- Streaming-first API design
- Multi-model abstraction support
- Turborepo monorepo structure

---

## Monorepo Structure

    ai-native-core/
      apps/
        web/        # Next.js frontend
        api/        # Fastify AI orchestration server
      packages/
        ai-core/    # Reusable AI runtime
        db/         # Database schema + client
        types/      # Shared TypeScript types

---

## Philosophy

AI Native Core is built on the belief that:

- Intelligence should be a system primitive.
- Models influence control flow.
- Tool execution must be typed and observable.
- Memory should persist and evolve.
- Streaming is first-class.

This repository is meant to serve as a reusable foundation for any
AI-native product going forward.

---

## Development

Install dependencies:

pnpm install

Run all apps in development:

pnpm dev

---

## Testing with Ollama (no paid API)

The API uses an OpenAI-compatible adapter. To test without an OpenAI/Anthropic key:

1. Start Ollama: `docker compose up -d ollama`
2. Pull a model: `docker compose exec ollama ollama run llama3.2`
3. Copy `.env.example` to `.env` and set:
   - `OPENAI_BASE_URL=http://localhost:11434/v1`
   - `OPENAI_MODEL=llama3.2` (optional; matches the model you pulled)
4. Run the API: `pnpm --filter api dev` (or `pnpm dev` from root). The `/chat` endpoint will use Ollama.

For real OpenAI, set `OPENAI_API_KEY` in `.env` and omit `OPENAI_BASE_URL`.

---

## Roadmap

See **[ROADMAP.md](./ROADMAP.md)** for the full prioritized roadmap. Next focus: real model adapter, streaming `/chat`, and wiring context + memory into the agent runtime.
