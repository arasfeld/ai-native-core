import { fileURLToPath } from "url";
import Fastify from "fastify";
import {
  OpenAIAdapter,
  runAgent,
  registerWeatherTool,
  getAllTools,
} from "@repo/ai-core";
import { z } from "zod";

export const chatBodySchema = z.object({
  message: z.string(),
  systemPrompt: z.string().optional(),
});

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

  fastify.get("/", async () => {
    return { hello: "world" };
  });

  fastify.post("/chat", async (request, reply) => {
    const { message, systemPrompt } = chatBodySchema.parse(request.body);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: object) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const model = createModel();
    try {
      await runAgent(
        model,
        {
          messages: [{ role: "user", content: message }],
          tools: getAllTools(),
          systemPrompt,
        },
        { onChunk: (text) => sendEvent("text", { content: text }) },
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
    await server.listen({ port: 3000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Only start the server when run directly, not when imported by tests
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
