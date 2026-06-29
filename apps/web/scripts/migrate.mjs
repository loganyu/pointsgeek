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
import pg from "pg";

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
