import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { adminOnly } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/users", { preHandler: adminOnly }, async (req) => {
    const { role } = req.query as { role?: string };
    const { rows } = await pool.query(
      `select id, university_id, full_name, role from users
        where ($1::text is null or role = $1) order by university_id`,
      [role ?? null],
    );
    return { users: rows };
  });

  app.post("/admin/people", { preHandler: adminOnly }, async (req, reply) => {
    const { universityId, fullName, role, password } = (req.body ?? {}) as any;
    const uid = String(universityId ?? "").trim();
    const name = String(fullName ?? "").trim();
    if (!uid || !name || !["student", "professor", "admin"].includes(role)) {
      return reply.code(400).send({ error: "bad_request" });
    }
    if (role !== "student" && (typeof password !== "string" || password.length < 8)) {
      return reply.code(400).send({ error: "weak_password" });
    }
    const hash = role === "student" ? null : await hashPassword(password);
    try {
      const { rows } = await pool.query(
        `insert into users (university_id, full_name, role, password_hash)
         values ($1, $2, $3, $4) returning id`,
        [uid, name, role, hash],
      );
      return rows[0];
    } catch (e: any) {
      if (e.code === "23505") return reply.code(409).send({ error: "duplicate_university_id" });
      throw e;
    }
  });

  app.get("/admin/courses", { preHandler: adminOnly }, async () => {
    const { rows } = await pool.query(
      `select c.id, c.code, c.title, c.room_capacity, u.full_name as professor,
              (select count(*) from enrollments e where e.course_id = c.id)::int as students
         from courses c join users u on u.id = c.professor_id
        order by c.created_at`,
    );
    return { courses: rows };
  });

  app.get("/admin/courses/:id/students", { preHandler: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `select u.id, u.university_id, u.full_name,
              exists(select 1 from credentials c
                      where c.user_id = u.id and c.active) as has_device,
              exists(select 1 from enrollment_codes k
                      where k.user_id = u.id and k.used_at is null
                        and k.expires_at > now()) as has_pending_code
         from enrollments e join users u on u.id = e.student_id
        where e.course_id = $1 order by u.university_id`,
      [id],
    );
    return { students: rows };
  });

  app.post("/admin/courses/:id/import", { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { students } = (req.body ?? {}) as {
      students?: { universityId: string; fullName: string }[];
    };
    if (!Array.isArray(students) || students.length === 0 || students.length > 2000) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const course = await pool.query("select 1 from courses where id = $1", [id]);
    if (!course.rowCount) return reply.code(404).send({ error: "unknown_course" });

    const result = { created: 0, existing: 0, enrolled: 0, skipped: [] as string[] };
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const s of students) {
        const uid = String(s.universityId ?? "").trim();
        const name = String(s.fullName ?? "").trim();
        if (!uid || !name) {
          result.skipped.push(uid || "(empty)");
          continue;
        }
        let r = await client.query(
          `insert into users (university_id, full_name, role) values ($1, $2, 'student')
           on conflict (university_id) do nothing returning id`,
          [uid, name],
        );
        if (r.rowCount) {
          result.created++;
        } else {
          r = await client.query(
            "select id from users where university_id = $1 and role = 'student'",
            [uid],
          );
          if (!r.rowCount) {
            result.skipped.push(uid); // this id belongs to a non-student account
            continue;
          }
          result.existing++;
        }
        const e = await client.query(
          "insert into enrollments (course_id, student_id) values ($1, $2) on conflict do nothing",
          [id, r.rows[0].id],
        );
        result.enrolled += e.rowCount ?? 0;
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    return result;
  });

  // One enrollment code for every student of the course who has no active device yet
  app.post("/admin/courses/:id/enrollment-codes", { preHandler: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `select u.id, u.university_id, u.full_name
         from enrollments e join users u on u.id = e.student_id
        where e.course_id = $1
          and not exists (select 1 from credentials c where c.user_id = u.id and c.active)
        order by u.university_id`,
      [id],
    );
    const codes: { universityId: string; fullName: string; code: string }[] = [];
    for (const u of rows) {
      const code = randomBytes(6).toString("hex");
      await pool.query(
        `update enrollment_codes set expires_at = now()
          where user_id = $1 and used_at is null and expires_at > now()`,
        [u.id],
      );
      await pool.query(
        `insert into enrollment_codes (code, user_id, expires_at)
         values ($1, $2, now() + interval '7 days')`,
        [code, u.id],
      );
      codes.push({ universityId: u.university_id, fullName: u.full_name, code });
    }
    return { codes };
  });
}
