import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
  }));

  return app;
}
