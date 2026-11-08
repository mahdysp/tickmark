import { staffFor } from "../lib/guard.js";
import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { adminOnly } from "../lib/auth.js";
import { reviewDelayMin } from "../config.js";

// A "pulse" = a group of token slots with gaps of at most 60 s between them.
const REPORT_SQL = `
with slots as (
  select distinct slot_time from attendance_records where class_session_id = $1
),
marked as (
  select slot_time,
         (lag(slot_time) over (order by slot_time) is null
          or slot_time - lag(slot_time) over (order by slot_time) > interval '60 seconds')::int as is_start
    from slots
),
pulses as (
  select slot_time, sum(is_start) over (order by slot_time)::int as pulse_no from marked
),
per_student as (
  select a.student_id,
         count(distinct p.pulse_no)::int as confirmed,
         count(*) filter (where a.mode = 'offline')::int as offline_records,
         coalesce(max(extract(epoch from (a.received_at - a.slot_time)))
                  filter (where a.mode = 'offline'), 0)::int as max_offline_delay_s
    from attendance_records a
    join pulses p on p.slot_time = a.slot_time
   where a.class_session_id = $1
   group by a.student_id
)
select u.university_id, u.full_name, ps.confirmed, ps.offline_records,
       ps.max_offline_delay_s,
       (select coalesce(max(pulse_no), 0) from pulses)::int as total_pulses
  from per_student ps join users u on u.id = ps.student_id
 order by u.university_id`;

export async function reportRoutes(app: FastifyInstance) {
  app.get("/admin/sessions/:id/report", { preHandler: staffFor("session") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await pool.query("select 1 from class_sessions where id = $1", [id]);
    if (!exists.rowCount) return reply.code(404).send({ error: "unknown_session" });

    const { rows } = await pool.query(REPORT_SQL, [id]);
    const totalPulses: number = rows[0]?.total_pulses ?? 0;
    const students = rows.map((r) => ({
      university_id: r.university_id,
      full_name: r.full_name,
      confirmed: r.confirmed,
      offline_records: r.offline_records,
      max_offline_delay_s: r.max_offline_delay_s,
      percent: totalPulses ? Math.round((100 * r.confirmed) / totalPulses) : 0,
      needsReview: r.max_offline_delay_s > reviewDelayMin * 60,
    }));
    return { totalPulses, students };
  });
}
