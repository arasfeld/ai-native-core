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
        ai-core/    # Reusable AI runtime (coming next)
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

## Roadmap

- AI runtime engine (ai-core package)
- Tool registry system
- RAG implementation with pgvector
- Memory system
- Background agents
- Observability + token tracking
