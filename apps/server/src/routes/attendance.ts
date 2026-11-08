import type { FastifyInstance } from "fastify";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { pool } from "../db.js";
import { rpID, origins } from "../config.js";
import { SLOT_SECONDS, checkMac, parseToken } from "../lib/token.js";

const ONLINE_MAX_MS = 2 * 60 * 1000;
const OFFLINE_MAX_MS = 60 * 60 * 1000;

export async function attendanceRoutes(app: FastifyInstance) {
  app.post("/attendance", async (req, reply) => {
    const { token, assertion } = req.body as { token: string; assertion: any };
    const bad = (error: string, code = 400) => reply.code(code).send({ error });

    const parsed = typeof token === "string" ? parseToken(token) : null;
    if (!parsed) return bad("bad_token");

    const s = await pool.query(
      "select id, course_id, session_key, started_at, ended_at from class_sessions where short_id = $1",
      [parsed.shortId],
    );
    const session = s.rows[0];
    if (!session) return bad("unknown_session");
    if (!checkMac(session.session_key, parsed.shortId, parsed.slot, parsed.mac)) {
      return bad("bad_mac");
    }

    const slotMs = parsed.slotTimeMs;
    const startedMs = new Date(session.started_at).getTime();
    const endedMs = session.ended_at ? new Date(session.ended_at).getTime() : Infinity;
    if (slotMs < startedMs - SLOT_SECONDS * 1000 || slotMs > endedMs) {
      return bad("token_outside_session");
    }
    const age = Date.now() - slotMs;
    if (age < -10_000) return bad("token_from_future");
    if (age > OFFLINE_MAX_MS) return bad("too_late");
    const mode = age <= ONLINE_MAX_MS ? "online" : "offline";

    const c = await pool.query(
      "select id, user_id, public_key, sign_count from credentials where credential_id = $1 and active",
      [assertion?.id],
    );
    const cred = c.rows[0];
    if (!cred) return bad("unknown_credential");

    const enrolled = await pool.query(
      "select 1 from enrollments where course_id = $1 and student_id = $2",
      [session.course_id, cred.user_id],
    );
    if (!enrolled.rowCount) return bad("not_enrolled", 403);

    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: Buffer.from(token).toString("base64url"),
        expectedOrigin: origins,
        expectedRPID: rpID,
        credential: {
          id: assertion.id,
          publicKey: new Uint8Array(cred.public_key),
          counter: Number(cred.sign_count),
        },
        requireUserVerification: true,
      });
    } catch {
      return bad("verification_failed");
    }
    if (!v.verified) return bad("not_verified");

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("update credentials set sign_count = $1 where id = $2", [
        v.authenticationInfo.newCounter,
        cred.id,
      ]);
      await client.query(
        `insert into attendance_records
           (class_session_id, student_id, credential_id, token, assertion, mode)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (class_session_id, student_id, token) do nothing`,
        [session.id, cred.user_id, cred.id, token, JSON.stringify(assertion), mode],
      );
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    return { ok: true, mode };
  });
}
