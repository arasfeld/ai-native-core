import Fastify from "fastify";

async function buildServer() {
  const fastify = Fastify({ logger: true });

  fastify.get("/", async () => {
    return { hello: "world" };
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
