import { createHash } from "node:crypto";
import { pool } from "../db.js";

export const COOKIE = "tm_session";
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function currentStaff(req: any) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.id, u.full_name, u.role
       from auth_sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()
        and u.role in ('professor', 'admin')`,
    [sha(token)],
  );
  return rows[0] ?? null;
}

export async function requireStaff(req: any, reply: any) {
  const user = await currentStaff(req);
  if (!user) return reply.code(401).send({ error: "not_logged_in" });
  req.user = user;
}

export const staffFor = (kind: "course" | "session") => async (req: any, reply: any) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && req.headers["x-admin-token"] === adminToken) return;

  const user = await currentStaff(req);
  if (!user) return reply.code(401).send({ error: "unauthorized" });
  req.user = user;
  if (user.role === "admin") return;

  const sql =
    kind === "course"
      ? "select 1 from courses where id = $1 and professor_id = $2"
      : `select 1 from class_sessions s join courses c on c.id = s.course_id
          where s.id = $1 and c.professor_id = $2`;
  const ok = await pool.query(sql, [req.params.id, user.id]);
  if (!ok.rowCount) return reply.code(403).send({ error: "forbidden" });
};
