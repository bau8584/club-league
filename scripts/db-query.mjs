/**
 * 읽기 전용 DB 조회. `.env.local`의 READONLY_DATABASE_URL(select만 되는 계정)로 붙는다.
 *
 *   bun scripts/db-query.mjs "select count(*) from matches"
 *   bun scripts/db-query.mjs path/to/query.sql
 */
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const url = env.READONLY_DATABASE_URL;
if (!url) { console.error("READONLY_DATABASE_URL이 .env.local에 없다."); process.exit(1); }

const arg = process.argv[2] ?? "select now()";
const sql = existsSync(arg) ? readFileSync(arg, "utf8") : arg;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const r = await client.query(sql);
  console.log(JSON.stringify(r.rows, null, 2));
  console.error(`${r.rowCount}행`);
} finally {
  await client.end();
}
