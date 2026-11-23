import Fastify from "fastify";
import { registerApp } from "./create-app.js";

const app = registerApp(Fastify({ logger: true }));
const port = Number(process.env.PORT ?? 3000);

await app.listen({ port, host: "0.0.0.0" });
