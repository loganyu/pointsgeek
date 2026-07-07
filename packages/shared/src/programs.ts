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
    // /account-selector shows per-card balances + card art in a clean list,
    // no picker clicking required — strictly better than the UR home page.
    primarySyncUrl: "https://ultimaterewardspoints.chase.com/account-selector",
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
  jetblue_trueblue: {
    programType: "airline",
    brandSlug: "jetblue",
    currency: "points",
    displayName: "JetBlue TrueBlue",
    short: "B6",
    // The signed-in nav button on jetblue.com exposes the TrueBlue
    // balance directly, so the homepage is enough for the content script.
    primarySyncUrl: "https://www.jetblue.com/",
  },
  jal_mileage_bank: {
    // Japan Airlines Mileage Bank. Scraped from the signed-in JMB page,
    // which exposes the redeemable miles balance in the rendered DOM.
    programType: "airline",
    brandSlug: "jal",
    currency: "miles",
    displayName: "JAL Mileage Bank",
    short: "JL",
    primarySyncUrl: "https://www.jal.co.jp/arl/en/jmb/",
  },
  marriott_bonvoy: {
    programType: "hotel",
    brandSlug: "marriott",
    currency: "points",
    displayName: "Marriott Bonvoy",
    short: "MAR",
    // Home page — our content script opens the signed-in account drawer,
    // reads the points balance, then closes it again.
    primarySyncUrl: "https://www.marriott.com/default.mi",
  },
  world_of_hyatt: {
    programType: "hotel",
    brandSlug: "hyatt",
    currency: "points",
    displayName: "World of Hyatt",
    short: "WOH",
    // Scraped from www.hyatt.com via the member profile API
    // (/profile/api/member/profile), same same-origin cookie-auth pattern
    // as Marriott. Root URL — the content script runs on any hyatt.com
    // page, so we link to the homepage (always valid) and let the user
    // sign in there rather than guess a member-area path.
    primarySyncUrl: "https://www.hyatt.com",
  },
  united_mileageplus: {
    programType: "airline",
    brandSlug: "united",
    currency: "miles",
    displayName: "United MileagePlus",
    short: "UA",
    // /myunited surfaces account number, miles, and card info in one view,
    // and the content script can read all of them directly off the DOM.
    primarySyncUrl: "https://www.united.com/en/us/myunited",
  },
  amazon_rewards: {
    // Co-branded white-label points on the Chase Prime Visa; redeemable
    // on Amazon. Not a travel program, not an issuer bank — calling it
    // bank_rewards is a stretch but it's the closest bucket we have
    // today. Reclassify later if we add a "merchant" category.
    programType: "bank_rewards",
    brandSlug: "amazon",
    currency: "points",
    displayName: "Amazon Rewards",
    short: "AMZ",
    primarySyncUrl: "https://secure.chase.com/web/auth/dashboard",
  },
  bilt_rewards: {
    // Bilt Rewards. Earn-on-rent points that transfer to a wide set of
    // airline + hotel partners, similar to Amex MR / Chase UR. Scraped
    // from www.bilt.com via api.biltrewards.com (cross-origin, bearer
    // auth from a JWT stored in localStorage).
    programType: "bank_rewards",
    brandSlug: "bilt",
    currency: "points",
    displayName: "Bilt Rewards",
    short: "BILT",
    primarySyncUrl: "https://www.bilt.com/",
  },
  asia_miles: {
    // Cathay Asia Miles. Cathay Pacific's loyalty currency, also used
    // by oneworld partners. Scraped from www.cathaypacific.com via the
    // mpo-common-services profile API at api.cathaypacific.com — same
    // cookie-auth pattern as AA's GraphQL endpoint (no Authorization
    // header needed, cookies ride along on `credentials: "include"`).
    programType: "airline",
    brandSlug: "cathay",
    currency: "miles",
    displayName: "Asia Miles",
    short: "AM",
    primarySyncUrl: "https://www.cathaypacific.com/cx/en_US.html",
  },
  qatar_avios: {
    // Qatar Airways Privilege Club. Avios is the unified currency Qatar
    // shares with British Airways, Iberia, Aer Lingus, etc. — but each
    // airline has its own loyalty account. We track the Privilege Club
    // balance specifically (not the BA-combined "Total Avios for flights"
    // that Qatar's UI offers as a convenience). When we add a BA scraper
    // it'll feed a separate `british_airways_avios` program.
    programType: "airline",
    brandSlug: "qatar",
    // Avios is technically its own currency name across BA/Qatar/Iberia,
    // but it functions as airline mileage and our currency enum is
    // intentionally narrow ("points" | "miles" | "usd_cents"). Slot it
    // under "miles".
    currency: "miles",
    displayName: "Qatar Privilege Club",
    short: "QR",
    primarySyncUrl:
      "https://www.qatarairways.com/en/Privilege-Club/postLogin/dashboardqrpcuser/avios-balance.html",
  },
  aa_aadvantage: {
    // American Airlines AAdvantage. Two providers feed this programKey:
    //  - aa.com (authoritative, via /services/graphql)
    //  - online.citi.com (cobrand cards display the AAdvantage balance)
    // They dedupe by `loyalty:<advantageNumber>` — same dedupe pattern
    // as Delta SkyMiles via amex.com vs. delta.com.
    programType: "airline",
    brandSlug: "aa",
    currency: "miles",
    displayName: "AAdvantage",
    short: "AA",
    primarySyncUrl:
      "https://www.aa.com/aadvantage-program/profile/account-summary",
  },
  alaska_atmos: {
    // Alaska Airlines Atmos Rewards. Scraped from the signed-in account
    // overview page, which exposes both Rewards No. and Available Points
    // directly in the rendered DOM.
    programType: "airline",
    brandSlug: "alaskaair",
    currency: "points",
    displayName: "Atmos Rewards",
    short: "AS",
    primarySyncUrl: "https://www.alaskaair.com/atmosrewards/account/overview/",
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
