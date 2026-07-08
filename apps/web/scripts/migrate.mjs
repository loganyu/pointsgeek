// Verbose migration runner — replaces `drizzle-kit migrate` in the build.
//
// drizzle-kit's CLI renders a spinner that SWALLOWS the underlying Postgres
// error, so a failed migration on Vercel just shows "applying migrations... "
// then ELIFECYCLE with no cause. This runs the same drizzle migrator (same
// `drizzle/__drizzle_migrations` ledger, same journal) but logs the real
// error: message, SQLSTATE code, detail, hint, and where.
//
// Migrations must run over a DIRECT (non-pooled) connection — the pooled Neon
// endpoint (pgBouncer transaction pooling) breaks drizzle's session-level
// migration lock and hangs. The Neon/Vercel integration injects the direct URL
// as DATABASE_URL_UNPOOLED (older integrations: POSTGRES_URL_NON_POOLING).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

loadLocalEnv();

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.error("[migrate] no database URL (DATABASE_URL_UNPOOLED or DATABASE_URL)");
  process.exit(1);
}

try {
  console.log(`[migrate] host: ${new URL(url).host}`);
} catch {
  /* unparseable url — let the pool surface the real connection error */
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.query(`
    UPDATE "points_programs"
    SET "program_type" = 'reward_program'::"program_type"
    WHERE "program_key" = 'bilt_rewards'
      AND "program_type" <> 'reward_program'::"program_type"
  `);
  console.log("[migrate] all migrations applied");
} catch (err) {
  console.error("\n[migrate] FAILED");
  console.error("  message:", err?.message);
  console.error("  code:   ", err?.code); // Postgres SQLSTATE
  console.error("  detail: ", err?.detail);
  console.error("  hint:   ", err?.hint);
  console.error("  where:  ", err?.where);
  console.error("  routine:", err?.routine);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  await pool.end();
}

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    if (process.env[key] !== undefined) continue;

    const rawValue = trimmed.slice(equalsAt + 1).trim();
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}
