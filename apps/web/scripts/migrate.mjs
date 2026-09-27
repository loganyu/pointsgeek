// Run the Drizzle migration ledger with useful errors in local and AWS builds.
// Local development uses a direct PostgreSQL URL. Amplify uses Aurora's HTTP
// Data API so the SSR runtime does not need a VPC connection or connection pool.
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { sql } from "drizzle-orm";
import { drizzle as drizzleAurora } from "drizzle-orm/aws-data-api/pg";
import { migrate as migrateAurora } from "drizzle-orm/aws-data-api/pg/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

loadLocalEnv();

let cleanup = async () => {};

try {
  const aurora = readAuroraConfig();
  let db;
  let runMigrations;

  if (aurora) {
    const { region, ...databaseConfig } = aurora;
    const client = new RDSDataClient(region ? { region } : {});
    db = drizzleAurora(client, databaseConfig);
    runMigrations = () =>
      migrateAurora(db, { migrationsFolder: "./drizzle" });
    cleanup = async () => client.destroy();
    console.log(`[migrate] transport: Aurora Data API (${aurora.database})`);
  } else {
    const url = readPostgresUrl();
    if (!url) {
      throw new Error(
        "No database configured. Set DATABASE_URL locally or all AURORA_* variables on AWS."
      );
    }

    try {
      console.log(`[migrate] transport: PostgreSQL (${new URL(url).host})`);
    } catch {
      console.log("[migrate] transport: PostgreSQL");
    }

    const pool = new pg.Pool({ connectionString: url, max: 1 });
    db = drizzlePostgres(pool);
    runMigrations = () =>
      migratePostgres(db, { migrationsFolder: "./drizzle" });
    cleanup = async () => pool.end();
  }

  await runMigrations();
  await db.execute(sql.raw(`
    UPDATE "points_programs"
    SET "program_type" = 'reward_program'::"program_type"
    WHERE "program_key" = 'bilt_rewards'
      AND "program_type" <> 'reward_program'::"program_type"
  `));
  console.log("[migrate] all migrations applied");
} catch (error) {
  console.error("\n[migrate] FAILED");
  printError(error);
  process.exitCode = 1;
} finally {
  await cleanup();
}

function readAuroraConfig() {
  const keys = [
    "AURORA_DATABASE",
    "AURORA_RESOURCE_ARN",
    "AURORA_SECRET_ARN",
  ];
  if (!keys.some((key) => process.env[key])) return null;

  const missing = keys
    .filter((key) => !process.env[key])
    .join(", ");
  if (missing) {
    throw new Error(
      `Incomplete Aurora Data API configuration; missing ${missing}`
    );
  }

  return {
    database: process.env.AURORA_DATABASE,
    resourceArn: process.env.AURORA_RESOURCE_ARN,
    secretArn: process.env.AURORA_SECRET_ARN,
    region: process.env.AURORA_REGION ?? process.env.AWS_REGION,
  };
}

function readPostgresUrl() {
  return (
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL_NON_POOLING ??
    process.env.DATABASE_URL
  );
}

function printError(error) {
  const cause = error?.cause;
  console.error("  message:", error?.message ?? error);
  console.error("  code:   ", error?.code ?? cause?.code);
  console.error("  detail: ", error?.detail ?? cause?.detail);
  console.error("  hint:   ", error?.hint ?? cause?.hint);
  console.error("  where:  ", error?.where ?? cause?.where);
  console.error("  routine:", error?.routine ?? cause?.routine);
  if (error?.stack) console.error(error.stack);
  if (cause?.stack) console.error("Caused by:", cause.stack);
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
