/**
 * Institution directory for the "Add program" modal.
 *
 * Currently constrained to institutions we have a working scraper for —
 * adding directory-only entries (e.g. Hilton, Southwest) without a way
 * to actually pull their balances feels half-finished, so we hide them
 * behind comments for now and uncomment them one at a time as their
 * scrapers ship.
 *
 * Each `url` points at the scraper's expected landing page so a click
 * on the institution opens the right place — the user logs in there
 * and the extension picks up the balance immediately.
 *
 * This list stays in code: it's visual-directory data, not pulled into
 * the hot path, and keeping it next to the catalog avoids a second
 * source of truth for programKey literals the extension relies on.
 */

export type InstitutionCategory = "bank" | "airline" | "hotel" | "reward";

export interface Institution {
  name: string;
  url: string;
  category: InstitutionCategory;
  /** Key into BRAND_META for a logo; letter fallback otherwise. */
  brandSlug?: string;
}

export const CATEGORY_LABELS: Record<InstitutionCategory, string> = {
  bank: "Banks & Credit Cards",
  airline: "Airline Loyalty",
  hotel: "Hotel Loyalty",
  reward: "Reward Programs",
};

export const CATEGORY_ORDER: InstitutionCategory[] = [
  "bank",
  "reward",
  "airline",
  "hotel",
];

export const INSTITUTIONS: Institution[] = [
  // ── Banks & credit cards — scraped ───────────────────────
  {
    name: "American Express",
    url: "https://global.americanexpress.com/overview",
    category: "bank",
    brandSlug: "amex",
  },
  {
    name: "Capital One",
    url: "https://myaccounts.capitalone.com/accountSummary",
    category: "bank",
    brandSlug: "capitalone",
  },
  {
    name: "Chase",
    url: "https://ultimaterewardspoints.chase.com/account-selector",
    category: "bank",
    brandSlug: "chase",
  },
  {
    name: "Citi",
    url: "https://online.citi.com/US/ag/dashboard",
    category: "bank",
    brandSlug: "citi",
  },

  // ── Reward programs — scraped ────────────────────────────
  {
    name: "Bilt Rewards",
    url: "https://www.bilt.com/",
    category: "reward",
    brandSlug: "bilt",
  },
  {
    name: "Rove Miles",
    url: "https://www.rove.com/home",
    category: "reward",
    brandSlug: "rove",
  },

  // ── Banks & credit cards — pending scrapers ──────────────
  // Uncomment as scrapers ship.
  // { name: "Bank of America", url: "https://www.bankofamerica.com", category: "bank" },
  // { name: "Wells Fargo", url: "https://www.wellsfargo.com", category: "bank" },
  // { name: "Discover", url: "https://www.discover.com", category: "bank" },
  // { name: "Barclays", url: "https://cards.barclaycardus.com", category: "bank" },
  // { name: "U.S. Bank", url: "https://www.usbank.com", category: "bank" },

  // ── Airline loyalty — scraped ────────────────────────────
  {
    name: "American AAdvantage",
    url: "https://www.aa.com/aadvantage-program/profile/account-summary",
    category: "airline",
    brandSlug: "aa",
  },
  {
    name: "Alaska Atmos Rewards",
    url: "https://www.alaskaair.com/atmosrewards/account/overview/",
    category: "airline",
    brandSlug: "alaskaair",
  },
  {
    name: "Cathay Asia Miles",
    url: "https://www.cathaypacific.com/cx/en_US.html",
    category: "airline",
    brandSlug: "cathay",
  },
  {
    name: "Delta SkyMiles",
    url: "https://www.delta.com/myskymiles/overview",
    category: "airline",
    brandSlug: "delta",
  },
  {
    name: "JetBlue TrueBlue",
    url: "https://www.jetblue.com/",
    category: "airline",
    brandSlug: "jetblue",
  },
  {
    name: "JAL Mileage Bank",
    url: "https://www.jal.co.jp/arl/en/jmb/",
    category: "airline",
    brandSlug: "jal",
  },
  {
    name: "Qatar Privilege Club",
    url: "https://www.qatarairways.com/en/Privilege-Club/postLogin/dashboardqrpcuser/avios-balance.html",
    category: "airline",
    brandSlug: "qatar",
  },
  {
    name: "United MileagePlus",
    url: "https://www.united.com/en/us/myunited",
    category: "airline",
    brandSlug: "united",
  },
  {
    name: "Southwest Rapid Rewards",
    url: "https://www.southwest.com/",
    category: "airline",
    brandSlug: "southwest",
  },

  // ── Airline loyalty — pending scrapers (US) ──────────────
  // Uncomment as scrapers ship.
  // { name: "Hawaiian HawaiianMiles", url: "https://www.hawaiianairlines.com", category: "airline" },
  // { name: "Frontier Miles", url: "https://www.flyfrontier.com", category: "airline" },

  // ── Airline loyalty — pending scrapers (international) ───
  // Top-ten frequent-flyer programs and the transfer partners of Amex
  // MR, Chase UR, Capital One Miles, Citi ThankYou, and Bilt. Order is
  // alphabetical so the list scans cleanly as it grows.
  // { name: "Aer Lingus AerClub", url: "https://www.aerlingus.com/aerclub", category: "airline" },
  // { name: "Air Canada Aeroplan", url: "https://www.aircanada.com/aeroplan", category: "airline" },
  // { name: "ANA Mileage Club", url: "https://www.ana.co.jp/en/us/amc", category: "airline" },
  // { name: "Avianca LifeMiles", url: "https://www.lifemiles.com", category: "airline" },
  // { name: "British Airways Avios", url: "https://www.britishairways.com/executiveclub", category: "airline" },
  // { name: "Emirates Skywards", url: "https://www.emirates.com/skywards", category: "airline" },
  // { name: "Etihad Guest", url: "https://www.etihad.com/etihadguest", category: "airline" },
  // { name: "Flying Blue (Air France/KLM)", url: "https://www.flyingblue.com", category: "airline" },
  // { name: "Iberia Plus", url: "https://www.iberia.com", category: "airline" },
  // { name: "Lufthansa Miles & More", url: "https://www.miles-and-more.com", category: "airline" },
  // { name: "Qantas Frequent Flyer", url: "https://www.qantas.com/frequent-flyer", category: "airline" },
  // { name: "Singapore KrisFlyer", url: "https://www.singaporeair.com/krisflyer", category: "airline" },
  // { name: "Turkish Miles&Smiles", url: "https://www.turkishairlines.com/en-int/miles-and-smiles", category: "airline" },
  // { name: "Virgin Atlantic Flying Club", url: "https://www.virginatlantic.com/flyingclub", category: "airline" },

  // ── Hotel loyalty — scraped ──────────────────────────────
  {
    name: "Marriott Bonvoy",
    url: "https://www.marriott.com/default.mi",
    category: "hotel",
    brandSlug: "marriott",
  },
  {
    name: "World of Hyatt",
    url: "https://www.hyatt.com",
    category: "hotel",
    brandSlug: "hyatt",
  },
  {
    name: "Hilton Honors",
    url: "https://www.hilton.com/en/",
    category: "hotel",
    brandSlug: "hilton",
  },

  // ── Hotel loyalty — pending scrapers ─────────────────────
  // Uncomment as scrapers ship.
  // { name: "IHG One Rewards", url: "https://www.ihg.com", category: "hotel" },
  // { name: "Wyndham Rewards", url: "https://www.wyndhamhotels.com", category: "hotel" },
  // { name: "Choice Privileges", url: "https://www.choicehotels.com", category: "hotel" },
  // { name: "Accor ALL", url: "https://all.accor.com", category: "hotel" },
];
