import { adminOnly } from "../lib/auth.js";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { pool } from "../db.js";
import { rpID, rpName, origins } from "../config.js";

async function loadCode(code: string) {
  const { rows } = await pool.query(
    `select c.code, c.user_id, c.challenge, u.university_id, u.full_name
       from enrollment_codes c join users u on u.id = c.user_id
      where c.code = $1 and c.used_at is null and c.expires_at > now()`,
    [code],
  );
  return rows[0];
}

export async function enrollmentRoutes(app: FastifyInstance) {
  const admin = async (req: any, reply: any) => {
    if (!process.env.ADMIN_TOKEN || req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };

  app.post("/admin/users", { preHandler: adminOnly }, async (req) => {
    const { universityId, fullName, role } = req.body as {
      universityId: string;
      fullName: string;
      role: string;
    };
    const { rows } = await pool.query(
      "insert into users (university_id, full_name, role) values ($1, $2, $3) returning id",
      [universityId, fullName, role],
    );
    return rows[0];
  });

  app.post("/admin/users/:id/enrollment-code", { preHandler: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const code = randomBytes(4).toString("hex");
    await pool.query(
      "insert into enrollment_codes (code, user_id, expires_at) values ($1, $2, now() + interval '24 hours')",
      [code, id],
    );
    return { code };
  });

  app.post("/enroll/options", async (req, reply) => {
    const { code } = req.body as { code: string };
    const row = await loadCode(code);
    if (!row) return reply.code(400).send({ error: "invalid_code" });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: row.university_id,
      userDisplayName: row.full_name,
      userID: new TextEncoder().encode(row.user_id),
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "discouraged",
        userVerification: "required",
      },
    });
    await pool.query("update enrollment_codes set challenge = $1 where code = $2", [
      options.challenge,
      code,
    ]);
    return options;
  });

  app.post("/enroll/verify", async (req, reply) => {
    const { code, response } = req.body as { code: string; response: any };
    const row = await loadCode(code);
    if (!row || !row.challenge) return reply.code(400).send({ error: "invalid_code" });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: row.challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      return reply.code(400).send({ error: "verification_failed" });
    }
    if (!verification.verified) return reply.code(400).send({ error: "not_verified" });

    const { credential } = verification.registrationInfo;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("update credentials set active = false where user_id = $1 and active", [
        row.user_id,
      ]);
      await client.query(
        "insert into credentials (user_id, credential_id, public_key, sign_count) values ($1, $2, $3, $4)",
        [row.user_id, credential.id, Buffer.from(credential.publicKey), credential.counter],
      );
      await client.query(
        "update enrollment_codes set used_at = now(), challenge = null where code = $1",
        [code],
      );
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    return { verified: true };
  });
}
