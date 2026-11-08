import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { adminOnly } from "../lib/auth.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.post("/admin/courses/:id/capacity", { preHandler: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { roomCapacity } = req.body as { roomCapacity: number };
    await pool.query("update courses set room_capacity = $1 where id = $2", [roomCapacity, id]);
    return { ok: true };
  });

  app.get("/admin/sessions/:id/summary", { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await pool.query("select 1 from class_sessions where id = $1", [id]);
    if (!exists.rowCount) return reply.code(404).send({ error: "unknown_session" });

    const { rows } = await pool.query(
      `select
         (select count(*) from enrollments e
            join class_sessions s on s.course_id = e.course_id
           where s.id = $1)::int as enrolled,
         (select count(distinct student_id) from attendance_records
           where class_session_id = $1)::int as present,
         (select count(distinct student_id) from attendance_records
           where class_session_id = $1 and mode = 'offline')::int as offline_students,
         (select count(*) from attendance_records
           where class_session_id = $1)::int as records,
         (select c.room_capacity from courses c
            join class_sessions s on s.course_id = c.id
           where s.id = $1) as room_capacity,
         (select ended_at from class_sessions where id = $1) as ended_at`,
      [id],
    );
    const r = rows[0];
    return { ...r, overCapacity: r.room_capacity != null && r.present > r.room_capacity };
  });
}
