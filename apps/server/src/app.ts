import Fastify from "fastify";
import { pool } from "./db.js";
import cookie from "@fastify/cookie";
import { authRoutes } from "./routes/auth.js";
import { reportRoutes } from "./routes/report.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sessionRoutes } from "./routes/sessions.js";
import { attendanceRoutes } from "./routes/attendance.js";
import { enrollmentRoutes } from "./routes/enrollment.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
  }));

  app.get("/health/db", async () => {
    const { rows } = await pool.query("select now() as now");
    return { status: "ok", dbTime: rows[0].now };
  });

  app.register(cookie);
  app.register(enrollmentRoutes);
  app.register(sessionRoutes);
  app.register(attendanceRoutes);
  app.register(dashboardRoutes);
  app.register(reportRoutes);
  app.register(authRoutes);

  return app;
}
