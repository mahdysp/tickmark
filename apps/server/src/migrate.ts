import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "./db.js";

const dir = join(import.meta.dirname, "..", "migrations");

await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const applied = await pool.query("select name from schema_migrations");
const done = new Set(applied.rows.map((r) => r.name));

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  if (done.has(f)) continue;
  const sql = await readFile(join(dir, f), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log("applied", f);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
await pool.end();
