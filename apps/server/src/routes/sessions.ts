import { staffFor } from "../lib/guard.js";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { adminOnly } from "../lib/auth.js";
import { makeToken } from "../lib/token.js";

export async function sessionRoutes(app: FastifyInstance) {
  app.post("/admin/courses", { preHandler: adminOnly }, async (req) => {
    const { code, title, professorId } = req.body as {
      code: string;
      title: string;
      professorId: string;
    };
    const { rows } = await pool.query(
      "insert into courses (code, title, professor_id) values ($1, $2, $3) returning id",
      [code, title, professorId],
    );
    return rows[0];
  });

  app.post("/admin/courses/:id/students", { preHandler: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { studentId } = req.body as { studentId: string };
    await pool.query(
      "insert into enrollments (course_id, student_id) values ($1, $2) on conflict do nothing",
      [id, studentId],
    );
    return { ok: true };
  });

  app.post("/admin/courses/:id/sessions", { preHandler: staffFor("course") }, async (req) => {
    const { id } = req.params as { id: string };
    const shortId = randomBytes(3).toString("hex");
    const key = randomBytes(32);
    const { rows } = await pool.query(
      "insert into class_sessions (course_id, session_key, short_id, started_at) values ($1, $2, $3, now()) returning id",
      [id, key, shortId],
    );
    return { id: rows[0].id, shortId, sessionKey: key.toString("base64") };
  });

  app.get("/admin/sessions/:id/token", { preHandler: staffFor("session") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      "select short_id, session_key from class_sessions where id = $1 and ended_at is null",
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "no_active_session" });
    return { token: makeToken(rows[0].session_key, rows[0].short_id) };
  });

  app.post("/admin/sessions/:id/end", { preHandler: staffFor("session") }, async (req) => {
    const { id } = req.params as { id: string };
    await pool.query("update class_sessions set ended_at = now() where id = $1", [id]);
    return { ok: true };
  });

  app.get("/admin/sessions/:id/attendance", { preHandler: staffFor("session") }, async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `select u.university_id, u.full_name, a.mode, a.received_at
         from attendance_records a join users u on u.id = a.student_id
        where a.class_session_id = $1 order by a.received_at`,
      [id],
    );
    return { count: rows.length, records: rows };
  });
}
