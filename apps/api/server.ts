import { fileURLToPath } from "url";
import Fastify from "fastify";
import {
  OpenAIAdapter,
  runAgent,
  registerWeatherTool,
  getAllTools,
  MemoryStore,
} from "@repo/ai-core";
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

const sessionMemory = new Map<string, MemoryStore>();

function getOrCreateMemory(sessionId: string): MemoryStore {
  let store = sessionMemory.get(sessionId);
  if (!store) {
    store = new MemoryStore();
    sessionMemory.set(sessionId, store);
  }
  return store;
}

function createModel() {
  const baseURL = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  return new OpenAIAdapter({
    model: model || undefined,
    baseURL: baseURL || undefined,
    apiKey: apiKey || undefined,
  });
}

export async function buildServer() {
  const fastify = Fastify({ logger: true });

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

  fastify.post("/chat", async (request, reply) => {
    const { message, systemPrompt, history, sessionId } = chatBodySchema.parse(request.body);

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
    const memory = sessionId ? getOrCreateMemory(sessionId) : undefined;
    try {
      await runAgent(
        model,
        {
          messages,
          tools: getAllTools(),
          systemPrompt,
        },
        {
          onChunk: (text) => sendEvent("text", { content: text }),
          memory,
        },
      );
      sendEvent("done", {});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
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
