import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { drizzle as drizzleAurora } from "drizzle-orm/aws-data-api/pg";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const auroraKeys = [
  "AURORA_RESOURCE_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
] as const;

function createDatabase(): Database {
  const usesAurora = auroraKeys.some((key) => process.env[key]);

  if (usesAurora) {
    const missing = auroraKeys.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Incomplete Aurora Data API configuration; missing ${missing.join(", ")}`
      );
    }

    const region = process.env.AURORA_REGION ?? process.env.AWS_REGION;
    const client = new RDSDataClient(region ? { region } : {});

    return drizzleAurora(client, {
      database: process.env.AURORA_DATABASE!,
      resourceArn: process.env.AURORA_RESOURCE_ARN!,
      secretArn: process.env.AURORA_SECRET_ARN!,
      schema,
    });
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Database configuration is required: set DATABASE_URL locally or all AURORA_* variables on AWS"
    );
  }

  return drizzlePostgres(process.env.DATABASE_URL, { schema });
}

export const db = createDatabase();
