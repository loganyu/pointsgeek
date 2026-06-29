import { defineConfig } from "drizzle-kit";

// Migrations must run over a DIRECT (non-pooled) connection. drizzle-kit's
// session-level migration lock doesn't work through Neon's pooled endpoint
// (pgBouncer transaction pooling) — it hangs the `migrate` step on Vercel.
//
// The Neon/Vercel integration injects the direct URL as DATABASE_URL_UNPOOLED
// (older Vercel-Postgres integrations use POSTGRES_URL_NON_POOLING). Prefer
// those; fall back to DATABASE_URL, which locally points at a plain direct
// Postgres anyway. The app's *runtime* keeps using the pooled DATABASE_URL.
const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "A database URL (DATABASE_URL_UNPOOLED or DATABASE_URL) is required for drizzle-kit",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});