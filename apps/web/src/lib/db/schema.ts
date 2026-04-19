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
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// --- Enums ---

export const providerEnum = pgEnum("provider", [
  "amex",
  "chase",
  "capitalone",
  "delta",
]);

export const programTypeEnum = pgEnum("program_type", [
  "bank_rewards",
  "airline",
  "hotel",
]);

export const balanceTypeEnum = pgEnum("balance_type", [
  "total",
  "ytd_earned_on_card",
]);

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

/**
 * A loyalty program *instance* for a user. One row per (user, program_key,
 * external_account_id) — so a user with two Amex logins gets two `amex_mr`
 * rows, each scoped by the Amex account identifier we scraped.
 */
export const pointsPrograms = pgTable(
  "points_programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stable program identifier from shared/programs.ts PROGRAM_CATALOG. */
    programKey: text("program_key").notNull(),
    /** Scraped identifier for the external account (email, customer id, or fingerprint). */
    externalAccountId: text("external_account_id").notNull(),
    /** Display label for the owner ("Logan"). Nullable — falls back to
     *  the loyalty number for airline/hotel programs, or nothing at all. */
    ownerLabel: text("owner_label"),
    programType: programTypeEnum("program_type").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("uniq_user_program_external_account").on(
      t.userId,
      t.programKey,
      t.externalAccountId
    ),
  ]
);

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  programId: uuid("program_id")
    .notNull()
    .references(() => pointsPrograms.id, { onDelete: "cascade" }),
  cardName: text("card_name").notNull(),
  lastFour: text("last_four"),
  /** Bank/issuer slug (amex, chase, capitalone). Distinct from program brand. */
  issuer: text("issuer").notNull(),
  /**
   * Local card-art override keyed by filename — resolves to
   * `/logos/cards/{slug}.png`. Set by the user in settings, takes
   * precedence over `image_url` when both exist.
   */
  imageSlug: text("image_slug"),
  /**
   * Scraped card-art CDN URL (Amex `aexp-static.com`, Chase, Cap One).
   * Captured during normal scrapes; renders when no `image_slug` override
   * is set. Null means we haven't seen the card's art yet.
   */
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const balanceSnapshots = pgTable("balance_snapshots", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull(),
  programId: uuid("program_id").references(() => pointsPrograms.id, {
    onDelete: "set null",
  }),
  cardId: uuid("card_id").references(() => cards.id, {
    onDelete: "set null",
  }),
  balance: bigint("balance", { mode: "bigint" }).notNull(),
  balanceType: balanceTypeEnum("balance_type").notNull().default("total"),
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
