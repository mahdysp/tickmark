import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { adminOnly } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/users", { preHandler: adminOnly }, async (req) => {
    const { role } = req.query as { role?: string };
    const { rows } = await pool.query(
      `select id, university_id, full_name, role, (password_hash is not null) as has_password
         from users where ($1::text is null or role = $1)
        order by university_id limit 500`,
      [role ?? null],
    );
    return { users: rows };
  });

  app.post("/admin/professors", { preHandler: adminOnly }, async (req, reply) => {
    const { universityId, fullName, password } = (req.body ?? {}) as {
      universityId?: string;
      fullName?: string;
      password?: string;
    };
    if (!universityId?.trim() || !fullName?.trim()) {
      return reply.code(400).send({ error: "bad_request" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return reply.code(400).send({ error: "weak_password" });
    }
    try {
      const { rows } = await pool.query(
        `insert into users (university_id, full_name, role, password_hash)
         values ($1, $2, 'professor', $3) returning id`,
        [universityId.trim(), fullName.trim(), await hashPassword(password)],
      );
      return rows[0];
    } catch (e: any) {
      if (e.code === "23505") return reply.code(409).send({ error: "university_id_taken" });
      throw e;
    }
  });

  app.get("/admin/courses", { preHandler: adminOnly }, async () => {
    const { rows } = await pool.query(
      `select c.id, c.code, c.title, c.room_capacity, u.full_name as professor_name,
              (select count(*) from enrollments e where e.course_id = c.id)::int as enrolled
         from courses c join users u on u.id = c.professor_id
        order by c.created_at`,
    );
    return { courses: rows };
  });

  app.get("/admin/courses/:id/students", { preHandler: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `select u.id, u.university_id, u.full_name,
              exists (select 1 from credentials c where c.user_id = u.id and c.active) as has_device
         from enrollments e join users u on u.id = e.student_id
        where e.course_id = $1 order by u.university_id`,
      [id],
    );
    return { students: rows };
  });

  app.post("/admin/courses/:id/import-students", { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { students } = (req.body ?? {}) as {
      students?: { universityId: string; fullName: string }[];
    };
    if (!Array.isArray(students) || students.length === 0 || students.length > 1000) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const course = await pool.query("select 1 from courses where id = $1", [id]);
    if (!course.rowCount) return reply.code(404).send({ error: "unknown_course" });

    let created = 0;
    let enrolled = 0;
    let skipped = 0;
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const s of students) {
        const uid = String(s?.universityId ?? "").trim();
        const name = String(s?.fullName ?? "").trim();
        if (!uid || !name) {
          skipped++;
          continue;
        }
        const ins = await client.query(
          `insert into users (university_id, full_name, role) values ($1, $2, 'student')
           on conflict (university_id) do nothing returning id`,
          [uid, name],
        );
        let userId: string | undefined = ins.rows[0]?.id;
        if (userId) {
          created++;
        } else {
          const ex = await client.query("select id, role from users where university_id = $1", [uid]);
          if (ex.rows[0]?.role !== "student") {
            skipped++;
            continue;
          }
          userId = ex.rows[0].id;
        }
        const en = await client.query(
          "insert into enrollments (course_id, student_id) values ($1, $2) on conflict do nothing",
          [id, userId],
        );
        enrolled += en.rowCount ?? 0;
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    return { created, enrolled, skipped };
  });
}
