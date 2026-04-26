import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_NON_POOLING ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL (or DATABASE_URL_NON_POOLING) is required for drizzle-kit",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});