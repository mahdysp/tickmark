import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { adminOnly } from "../lib/auth.js";
import { COOKIE, requireStaff, sha } from "../lib/guard.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

const TTL_SECONDS = 12 * 3600;

export async function authRoutes(app: FastifyInstance) {
  app.post("/admin/users/:id/password", { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { password } = req.body as { password: string };
    if (typeof password !== "string" || password.length < 8) {
      return reply.code(400).send({ error: "weak_password" });
    }
    await pool.query("update users set password_hash = $1 where id = $2", [
      await hashPassword(password),
      id,
    ]);
    return { ok: true };
  });

  app.post("/auth/login", async (req, reply) => {
    const { universityId, password } = (req.body ?? {}) as {
      universityId?: string;
      password?: string;
    };
    if (typeof universityId !== "string" || typeof password !== "string") {
      return reply.code(400).send({ error: "bad_request" });
    }
    const { rows } = await pool.query(
      `select id, full_name, role, password_hash from users
        where university_id = $1 and role in ('professor', 'admin')`,
      [universityId],
    );
    const u = rows[0];
    let ok = false;
    if (u?.password_hash) ok = await verifyPassword(password, u.password_hash);
    else await hashPassword(password); // keep timing similar for unknown users
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });

    const token = randomBytes(32).toString("base64url");
    await pool.query(
      `insert into auth_sessions (token_hash, user_id, expires_at)
       values ($1, $2, now() + make_interval(secs => $3))`,
      [sha(token), u.id, TTL_SECONDS],
    );
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: TTL_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
    return { id: u.id, fullName: u.full_name, role: u.role };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = (req as any).cookies?.[COOKIE];
    if (token) await pool.query("delete from auth_sessions where token_hash = $1", [sha(token)]);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: requireStaff }, async (req: any) => ({
    id: req.user.id,
    fullName: req.user.full_name,
    role: req.user.role,
  }));

  app.get("/prof/courses", { preHandler: requireStaff }, async (req: any) => {
    const { rows } =
      req.user.role === "admin"
        ? await pool.query("select id, code, title, room_capacity from courses order by created_at")
        : await pool.query(
            "select id, code, title, room_capacity from courses where professor_id = $1 order by created_at",
            [req.user.id],
          );
    return { courses: rows };
  });
}
