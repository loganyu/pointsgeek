import type { ProgramKey } from "./programs";

/**
 * Data-source a scrape comes from. Usually the issuer's website (e.g.
 * americanexpress.com → "amex"). One provider can report balances for
 * several programs — the Amex overview reports amex_mr, delta, marriott_bonvoy,
 * and amex_reward_dollars in a single scrape.
 */
export const PROVIDERS = [
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
] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROGRAM_TYPES = [
  "bank_rewards",
  "airline",
  "hotel",
  "reward_program",
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

/**
 * - `total`: true loyalty program balance. Summed into dashboard totals.
 * - `ytd_earned_on_card`: year-to-date points earned through one specific
 *   card (e.g. the Marriott Brilliant tile on Amex shows YTD earnings, not
 *   the Marriott account balance). Never rolled into program totals.
 */
export const BALANCE_TYPES = ["total", "ytd_earned_on_card"] as const;
export type BalanceType = (typeof BALANCE_TYPES)[number];

export interface PointsProgram {
  id: string;
  userId: string;
  programKey: ProgramKey;
  externalAccountId: string;
  ownerLabel: string | null;
  programType: ProgramType;
  /** Calendar date (`YYYY-MM-DD`) when the current balance expires. */
  expirationDate: string | null;
  active: boolean;
}

export interface Card {
  id: string;
  programId: string;
  cardName: string;
  lastFour?: string;
  issuer: string;
  imageSlug?: string;
  imageUrl?: string;
  active: boolean;
}

/** Card seen on a scraped page (to be upserted by the API). */
export interface DiscoveredCard {
  cardName: string;
  lastFour?: string;
  issuer: string;            // bank slug: amex, chase, capitalone
  programKey?: ProgramKey;   // primary program this card earns into
  /** Scraped CDN URL for the card's art (Amex NUS URL, Chase picker image, etc.). */
  imageUrl?: string;
  /** Local-asset override keyed by filename — `/logos/cards/{slug}.png`. */
  imageSlug?: string;
}

export interface BalanceRecord {
  programKey: ProgramKey;
  balance: number;
  balanceType: BalanceType;
  /**
   * Calendar date (`YYYY-MM-DD`) when this program balance expires. Omit when
   * the page does not expose expiration information; use null only when the
   * page explicitly says the points do not expire.
   */
  expirationDate?: string | null;
  /** When set, the balance is for this card specifically (per-card). */
  linkedCard?: { cardName: string; lastFour?: string };
  /**
   * Program-specific stable identifier (e.g. "loyalty:9289872575" from a
   * SkyMiles number). When present, this overrides the scrape-wide
   * `externalAccountId` for this particular program so that the same
   * loyalty account resolves to one row across scrapers — e.g., Delta
   * reported via both amex.com and delta.com dedupe into one program.
   */
  externalAccountId?: string;
}

export interface ScrapeEventDetails {
  success: boolean;
  durationMs: number;
  extensionVersion: string;
  matchedSelector?: string;
  selectorsAttempted: string[];
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Minimal result from a single-balance extractor (one `scraper-X.ts` file).
 * Content scripts compose these into the richer `ScrapeResult` by adding
 * card discovery, identifier extraction, and per-program fan-out.
 */
export interface BalanceExtraction {
  success: boolean;
  balance?: number;
  /** Calendar date (`YYYY-MM-DD`) when the extracted balance expires. */
  expirationDate?: string | null;
  error?: { code: string; message: string };
  durationMs: number;
  selectorsAttempted: string[];
  matchedSelector?: string;
}

/**
 * What a page scraper emits. The background worker wraps this in a
 * BalancePayload by adding extension metadata and submits it to the API.
 */
export interface ScrapeResult {
  success: boolean;
  externalAccountId?: string;
  /** Null when we couldn't extract a name — UI renders nothing. */
  ownerLabel?: string | null;
  identifierSource?:
    | "email"
    | "customer_id"
    | "card_last_four"
    | "greeting_name"
    | "default";
  balances?: BalanceRecord[];
  cards?: DiscoveredCard[];
  error?: { code: string; message: string };
  durationMs: number;
  selectorsAttempted: string[];
  matchedSelector?: string;
}

export interface BalancePayload {
  provider: Provider;
  /**
   * Stable identifier for the *external* account we scraped (e.g. the Amex
   * login we were in). Enables multiple accounts per Provider per user
   * without collision. Required for successful scrapes; absent for failed
   * ones (the server just logs the scrape event in that case).
   */
  externalAccountId?: string;
  /**
   * Human-facing name for the chip (first name / "Logan"). Null when the
   * scraper couldn't extract one — UI renders nothing rather than a
   * generic "Account" placeholder.
   */
  ownerLabel?: string | null;
  scrapedAt: string;
  balances: BalanceRecord[];
  cards?: DiscoveredCard[];
  scrapeEvent: ScrapeEventDetails;
}

export interface ExtensionMessage {
  type: "BALANCE_SCRAPED" | "SCRAPE_FAILED" | "SYNC_NOW";
  provider?: Provider;
  payload?: ScrapeResult;
}

// Re-export program catalog types for convenience
export type { ProgramKey } from "./programs";
export { PROGRAM_CATALOG, PROGRAM_KEYS, getProgramMeta } from "./programs";
