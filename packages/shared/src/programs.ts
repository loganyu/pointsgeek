/**
 * Canonical catalog of every loyalty program we can track.
 *
 * Adding a new program:
 *   1. Add an entry here (choose a stable `program_key`-style id for the key).
 *   2. Make sure a brand logo exists at `/logos/brands/{brandSlug}.png` in the
 *      web app (or the `BrandLogo` component will fall back to a colored circle).
 *   3. Teach the relevant content-script scraper to report this `programKey`.
 *
 * `programKey` is the cross-scraper identifier — e.g. Marriott Bonvoy earned
 * through Amex, Chase, or Marriott.com all funnel into `marriott_bonvoy`.
 * Multiple `provider` sources can feed the same programKey.
 */
export const PROGRAM_CATALOG = {
  amex_mr: {
    programType: "bank_rewards",
    brandSlug: "amex",
    currency: "points",
    displayName: "Membership Rewards",
    short: "MR",
    primarySyncUrl: "https://global.americanexpress.com/overview",
  },
  amex_reward_dollars: {
    programType: "bank_rewards",
    brandSlug: "amex",
    currency: "usd_cents",
    displayName: "Reward Dollars",
    short: "Cash",
    primarySyncUrl: "https://global.americanexpress.com/overview",
  },
  chase_ur: {
    programType: "bank_rewards",
    brandSlug: "chase",
    currency: "points",
    displayName: "Ultimate Rewards",
    short: "UR",
    primarySyncUrl: "https://ultimaterewardspoints.chase.com",
  },
  capitalone_miles: {
    programType: "bank_rewards",
    brandSlug: "capitalone",
    currency: "miles",
    displayName: "Capital One Miles",
    short: "C1",
    primarySyncUrl: "https://myaccounts.capitalone.com",
  },
  delta: {
    programType: "airline",
    brandSlug: "delta",
    currency: "miles",
    displayName: "Delta SkyMiles",
    short: "DL",
    primarySyncUrl: "https://www.delta.com/myskymiles/overview",
  },
  marriott_bonvoy: {
    programType: "hotel",
    brandSlug: "marriott",
    currency: "points",
    displayName: "Marriott Bonvoy",
    short: "MAR",
    primarySyncUrl: "https://www.marriott.com",
  },
} as const satisfies Record<
  string,
  {
    programType: "bank_rewards" | "airline" | "hotel";
    brandSlug: string;
    currency: "points" | "miles" | "usd_cents";
    displayName: string;
    short: string;
    primarySyncUrl: string;
  }
>;

export type ProgramKey = keyof typeof PROGRAM_CATALOG;

export const PROGRAM_KEYS = Object.keys(PROGRAM_CATALOG) as [
  ProgramKey,
  ...ProgramKey[]
];

export function getProgramMeta(key: ProgramKey) {
  return PROGRAM_CATALOG[key];
}
