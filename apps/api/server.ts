import { fileURLToPath } from "url";
import Fastify from "fastify";
import {
  OpenAIAdapter,
  OpenAIEmbeddingAdapter,
  runAgent,
  registerWeatherTool,
  getAllTools,
  IMemoryStore,
  buildRAGSystemPrompt,
} from "@repo/ai-core";
import { PgMemoryStore, PgVectorStore, PgVectorRetriever, migrate } from "@repo/db";
import { z } from "zod";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatBodySchema = z.object({
  message: z.string(),
  systemPrompt: z.string().optional(),
  history: z.array(chatMessageSchema).optional(),
  sessionId: z.string().optional(),
});

export const ingestBodySchema = z.object({
  text: z.string(),
  source: z.string().optional(),
});

function getMemory(sessionId: string): IMemoryStore {
  return new PgMemoryStore(sessionId);
}

function createModel() {
  const baseURL = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  console.log(`[API] createModel: model=${model ?? "(default)"} baseURL=${baseURL ?? "(default)"} apiKey=${apiKey ? apiKey.slice(0, 8) + "..." : "(missing!)"}`);
  return new OpenAIAdapter({
    model: model || undefined,
    baseURL: baseURL || undefined,
    apiKey: apiKey || undefined,
  });
}

function createEmbedder() {
  return new OpenAIEmbeddingAdapter({
    apiKey: process.env.OPENAI_API_KEY || undefined,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  // Ensure DB schema exists
  await migrate();

  // Register tools on startup
  registerWeatherTool();

  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "http://localhost:3000");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });

  fastify.options("*", async (_request, reply) => reply.send());

  fastify.get("/", async () => {
    return { hello: "world" };
  });

  fastify.post("/ingest", async (request) => {
    const { text, source } = ingestBodySchema.parse(request.body);
    const embedder = createEmbedder();
    const store = new PgVectorStore();
    const embedding = await embedder.embed(text);
    await store.insert(text, embedding, source);
    return { ok: true };
  });

  fastify.post("/chat", async (request, reply) => {
    const { message, systemPrompt, history, sessionId } = chatBodySchema.parse(request.body);
    console.log(`[API] /chat sessionId=${sessionId ?? "none"} historyLen=${history?.length ?? 0} message="${message.slice(0, 80)}"`);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "http://localhost:3000",
    });

    const sendEvent = (event: string, data: object) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const model = createModel();
    const messages = [
      ...(history ?? []),
      { role: "user" as const, content: message },
    ];
    const memory = sessionId ? getMemory(sessionId) : undefined;

    const retriever = new PgVectorRetriever(new PgVectorStore(), createEmbedder());
    const chunks = await retriever.retrieve(message, 3);
    // Build RAG-augmented base prompt (empty memory — runAgent will hydrate memory on top)
    const ragSystemPrompt = buildRAGSystemPrompt(chunks, [], systemPrompt);

    try {
      await runAgent(
        model,
        {
          messages,
          tools: getAllTools(),
          systemPrompt: ragSystemPrompt || undefined,
        },
        {
          onChunk: (text) => sendEvent("text", { content: text }),
          memory,
        },
      );
      sendEvent("done", {});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[API] /chat error:`, err);
      sendEvent("error", { message });
    } finally {
      reply.raw.end();
    }
  });

  return fastify;
}

async function start() {
  const server = await buildServer();
  try {
    await server.listen({ port: Number(process.env.PORT ?? 3001) });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Only start the server when run directly, not when imported by tests
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
