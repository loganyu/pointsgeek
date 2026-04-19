import { extLogger } from "../lib/logger";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * united.com scraper — reads United's own JSON APIs directly.
 *
 *   /api/user/accountStatus
 *     → MileagePlus number, miles balance, first/last name, tier
 *
 *   /xapi/myunited/CardMemberBenefits/myunited-card-details
 *     → Chase-issued United co-brands (name, last-four)
 *
 * Content scripts inherit the tab's cookies, so same-origin fetches are
 * automatically authenticated. This replaces the previous DOM scraping
 * (nav-bar drawer + /myunited heading parse) — strict upgrade:
 *   • no drawer click / UI flicker
 *   • resilient to United's hashed class names
 *   • always gets the MileagePlus number as a stable loyalty id
 *
 * Exits silently when the account-status call returns no data — that's
 * how United signals "not signed in" (the endpoint may respond 200 with
 * empty payload rather than 401).
 */
const ACCOUNT_STATUS_URL = "https://www.united.com/api/user/accountStatus";
const CARD_DETAILS_URL =
  "https://www.united.com/xapi/myunited/CardMemberBenefits/myunited-card-details";

export default defineContentScript({
  matches: ["https://www.united.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "united", url });

    const [accountStatus, cardDetails] = await Promise.all([
      fetchJson(ACCOUNT_STATUS_URL),
      fetchJson(CARD_DETAILS_URL),
    ]);

    const mp = accountStatus?.MileagePlus;
    const mileagePlusId: string | undefined = mp?.MileagePlusId;
    const rawBalance = mp?.AccountBalance;

    if (!mileagePlusId || rawBalance == null) {
      extLogger.info("scrape.skipped", {
        provider: "united",
        reason: "not_authenticated",
      });
      return;
    }

    const balance = Math.round(Number(rawBalance));
    if (!Number.isFinite(balance) || balance < 0) {
      extLogger.warn("scrape.failed", {
        provider: "united",
        reason: "balance_not_parsed",
        raw: rawBalance,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse AccountBalance: ${rawBalance}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [ACCOUNT_STATUS_URL],
      });
      return;
    }

    const firstName =
      typeof mp.FirstName === "string" ? titleCase(mp.FirstName) : "";
    const lastName =
      typeof mp.LastName === "string" ? titleCase(mp.LastName) : "";
    const ownerLabel = [firstName, lastName].filter(Boolean).join(" ") || null;

    const discoveredCards = extractCards(cardDetails);

    const balances: BalanceRecord[] = [
      {
        programKey: "united_mileageplus",
        balance,
        balanceType: "total",
        externalAccountId: `loyalty:${mileagePlusId}`,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "united",
      balance,
      mileagePlusId,
      ownerLabel,
      cardCount: discoveredCards.length,
    });

    send({
      success: true,
      externalAccountId: `loyalty:${mileagePlusId}`,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: discoveredCards,
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [ACCOUNT_STATUS_URL, CARD_DETAILS_URL],
      matchedSelector: ACCOUNT_STATUS_URL,
    });
  },
});

/**
 * Map cards from CardMemberBenefits/myunited-card-details:
 *
 *   {
 *     "cardNameDescription": "0261-United Gateway card",
 *     "cardNumber": "**8072"
 *   }
 *
 * → { cardName: "United Gateway", lastFour: "8072", issuer: "chase", programKey }
 *
 * The endpoint has no card-art URL; we leave `imageUrl` undefined and
 * rely on the Chase-side scraper (secure.chase.com) to supply it.
 */
function extractCards(payload: unknown): DiscoveredCard[] {
  if (!payload || typeof payload !== "object") return [];
  const cards = (payload as { cards?: unknown[] }).cards;
  if (!Array.isArray(cards)) return [];

  const out: DiscoveredCard[] = [];
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as {
      cardNameDescription?: unknown;
      cardNumber?: unknown;
    };
    const desc =
      typeof c.cardNameDescription === "string" ? c.cardNameDescription : "";
    // "0261-United Gateway card" → "United Gateway"
    const cardName = desc
      .replace(/^\d+\s*-\s*/, "")
      .replace(/\s*card\s*$/i, "")
      .trim();
    if (!cardName) continue;
    const cardNumber =
      typeof c.cardNumber === "string" ? c.cardNumber : "";
    const digits = cardNumber.replace(/[^0-9]/g, "");
    const lastFour = digits.length >= 4 ? digits.slice(-4) : undefined;

    out.push({
      cardName,
      lastFour,
      issuer: "chase",
      programKey: "united_mileageplus",
    });
  }
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const resp = await fetch(url, { credentials: "same-origin" });
    if (!resp.ok) {
      extLogger.warn("scrape.fetch_non_ok", { url, status: resp.status });
      return null;
    }
    return await resp.json();
  } catch (err) {
    extLogger.warn("scrape.fetch_error", { url, error: String(err) });
    return null;
  }
}

function send(payload: ScrapeResult) {
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "united",
    payload,
  });
}

function titleCase(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
