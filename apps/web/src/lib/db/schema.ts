import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
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
  "aa",
  "alaskaair",
  "amex",
  "bilt",
  "cathay",
  "chase",
  "capitalone",
  "citi",
  "delta",
  "hilton",
  "hyatt",
  "jal",
  "jetblue",
  "marriott",
  "qatar",
  "rove",
  "southwest",
  "united",
]);

export const programTypeEnum = pgEnum("program_type", [
  "bank_rewards",
  "airline",
  "hotel",
  "reward_program",
]);

export const balanceTypeEnum = pgEnum("balance_type", [
  "total",
  "ytd_earned_on_card",
]);

export const syncStatusEnum = pgEnum("sync_status", ["ok", "failed"]);

/** Admin workflow states for user-submitted failure reports. */
export const syncReportStatusEnum = pgEnum("sync_report_status", [
  "new",
  "triaged",
  "fixed",
  "dismissed",
]);

// --- NextAuth tables ---

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Full-name string written by NextAuth on OAuth sign-in; kept for
   *  backwards compat with the adapter. Prefer `firstName`/`lastName`
   *  for display since those are user-edited in the welcome flow. */
  name: text("name"),
  /** Collected in the `/welcome` onboarding form. Gates access to the
   *  dashboard/accounts/settings pages — users without a `firstName`
   *  are redirected into onboarding. Editable in Settings. */
  firstName: text("first_name"),
  lastName: text("last_name"),
  /** "Do you manage finances with a partner?" — null = not asked /
   *  answered, true/false = their choice. Captured for a future
   *  partner-accounts feature; no behavior attached yet. */
  hasPartner: boolean("has_partner"),
  /** Birthday as a calendar date (`YYYY-MM-DD`). Optional in both
   *  onboarding and Settings — stored in PG's `date` type so it has
   *  no timezone semantics. */
  birthday: date("birthday", { mode: "string" }),
  /** IANA timezone string, e.g. "America/New_York". Captured in the
   *  welcome form (pre-filled to the browser's detected zone) and
   *  editable in Settings. */
  timezone: text("timezone"),
  /** Profile picture stored as a base64 data URL (`data:image/...`).
   *  Good enough for the alpha — upgrade to object storage (R2 / Vercel
   *  Blob) once deployed so the DB doesn't inflate with large blobs. */
  profileImage: text("profile_image"),
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
    /** Failed verification attempts for the row's `(identifier, token)`.
     *  Used by our custom `useVerificationToken` wrapper to lock the
     *  6-digit code after 5 wrong tries — small enough to make brute
     *  force infeasible without aggressive rate limiting. NextAuth's
     *  default email provider doesn't read this column; only our
     *  wrapper does. */
    attempts: integer("attempts").notNull().default(0),
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
    /** Scraped identifier for the external account (loyalty number,
     *  email, id, display-name/card last-four, name, or default). */
    externalAccountId: text("external_account_id").notNull(),
    /** Display label for the owner ("Logan"). Nullable — falls back to
     *  the loyalty number for airline/hotel programs, or nothing at all. */
    ownerLabel: text("owner_label"),
    programType: programTypeEnum("program_type").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    /** Denormalized sync-status fields. Populated by `/api/balances`:
     *  - success path stamps `lastSyncAt` + `lastSyncStatus='ok'` on every
     *    program id that received data in the payload.
     *  - failure path stamps `lastSyncStatus='failed'` + the error on
     *    every program whose `externalAccountId` matches the failed scrape
     *    (best-effort — may miss programs whose id has been upgraded to
     *    `loyalty:...`; that's acceptable for a v1 indicator).
     *  UI reads these directly from the program row instead of joining
     *  through `scrape_events`, which is keyed only by provider. */
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    lastSyncStatus: syncStatusEnum("last_sync_status"),
    lastSyncError: text("last_sync_error"),
  },
  (t) => [
    // One row per external account in a program. Direct loyalty scrapes
    // use `loyalty:<membership-number>` when available; issuer/bank
    // scrapes fall back to email / customer id / display-name + one
    // card last-four / greeting / "default" in that order. This is
    // imperfect for banks that expose no stable account identifier, but
    // including it in the key lets known identifiers support multiple
    // same-program accounts.
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

/**
 * User-submitted failure reports. Generated by clicking "Report issue"
 * in the extension's sync widget when a scrape fails. The client
 * redacts the payload (strips numeric runs > 4 digits, strips the
 * user's own name) and caps size before POSTing — so `htmlFragment`
 * holds a sanitized DOM subtree rather than the raw page.
 *
 * Retention: sensitive-ish (failed banking DOM), delete ~30 days after
 * the linked scraper is marked `fixed`. Separate from `scrape_events`
 * so we can apply a different retention policy without touching the
 * telemetry table.
 */
export const syncReports = pgTable("sync_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  provider: providerEnum("provider").notNull(),
  /** Which scraper module + mode, e.g. "chase:account-selector",
   *  "amex:overview", "united:api". Free text — content scripts set it. */
  scraperId: text("scraper_id"),
  /** Page URL at the time of failure. The client is expected to pass a
   *  cleaned URL (path, optional query) — server stores as sent. */
  url: text("url"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  /** Redacted DOM subtree the user saw in the preview and confirmed. */
  htmlFragment: text("html_fragment").notNull(),
  userAgent: text("user_agent"),
  extensionVersion: text("extension_version"),
  status: syncReportStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
