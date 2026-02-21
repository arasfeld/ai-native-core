import Fastify from "fastify";
import {
  OpenAIAdapter,
  runAgent,
  registerWeatherTool,
  getAllTools,
} from "@repo/ai-core";
import { z } from "zod";

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

async function buildServer() {
  const fastify = Fastify({ logger: true });

  // Register tools on startup
  registerWeatherTool();

  fastify.get("/", async () => {
    return { hello: "world" };
  });

  const chatBodySchema = z.object({
    message: z.string(),
  });

  fastify.post("/chat", async (request, reply) => {
    const { message } = chatBodySchema.parse(request.body);

    const model = createModel();
    const result = await runAgent(model, {
      messages: [{ role: "user", content: message }],
      tools: getAllTools(),
    });

    return result;
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

start();
