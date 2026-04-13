import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  bigint,
  serial,
  boolean,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// --- Enums ---

export const providerEnum = pgEnum("provider", ["amex_mr"]);

// --- NextAuth tables ---

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// --- App tables ---

export const balanceSnapshots = pgTable("balance_snapshots", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull(),
  balance: bigint("balance", { mode: "bigint" }).notNull(),
  scrapedAt: timestamp("scraped_at", { mode: "date" }).notNull(),
  receivedAt: timestamp("received_at", { mode: "date" }).defaultNow().notNull(),
  metadata: text("metadata"),
});

export const scrapeEvents = pgTable("scrape_events", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  provider: providerEnum("provider").notNull(),
  success: boolean("success").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  extensionVersion: text("extension_version"),
  matchedSelector: text("matched_selector"),
  selectorsAttempted: text("selectors_attempted"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
