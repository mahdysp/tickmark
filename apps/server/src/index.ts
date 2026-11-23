import Fastify from "fastify";
import { registerApp } from "./create-app.js";

const app = registerApp(Fastify({ logger: true }));

// Local dev: listen on a port. On Vercel the platform calls the handler instead.
if (!process.env.VERCEL) {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
}

export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit("request", req, res);
}
