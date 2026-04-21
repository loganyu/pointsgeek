import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
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
 * These endpoints require BOTH a session cookie (which our content
 * script inherits for same-origin fetches) AND a short-lived bearer
 * token. United's SPA keeps the token in IndexedDB:
 *
 *   localforage / keyvaluepairs / reduxPersist:global
 *     → transit-js-encoded map containing
 *         "apiToken": { hash: "DAAAA…", expiresAt: ISO, isAuthenticated }
 *
 * The token rotates every ~30 min, so we read it fresh on each scrape
 * and skip when it's expired or missing (signed-out).
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

    // The page stores its API bearer in IndexedDB after the user signs
    // in. If the user's still on a signed-out page (or we just landed
    // before redux-persist hydrated), fall back to a polling retry
    // with exponential backoff — they might log in while we wait.
    const bearer = await waitForBearer();
    if (!bearer) {
      extLogger.info("scrape.skipped", {
        provider: "united",
        reason: "no_bearer_after_retries",
      });
      return;
    }

    // Only mount the widget once we know the user is signed in — the
    // bearer poll above can run for up to 3 min on a signed-out page,
    // and we don't want to show "Syncing United…" for that long on a
    // login screen.
    syncWidget.start({ label: "United" });

    const [accountStatus, cardDetails] = await Promise.all([
      fetchJson(ACCOUNT_STATUS_URL, bearer),
      fetchJson(CARD_DETAILS_URL, bearer),
    ]);

    const mp = accountStatus?.MileagePlus;
    const mileagePlusId: string | undefined = mp?.MileagePlusId;
    const rawBalance = mp?.AccountBalance;

    if (!mileagePlusId || rawBalance == null) {
      extLogger.info("scrape.skipped", {
        provider: "united",
        reason: "not_authenticated",
      });
      syncWidget.destroy();
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

async function fetchJson(url: string, bearer: string): Promise<unknown> {
  try {
    const resp = await fetch(url, {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "x-authorization-api": `bearer ${bearer}`,
      },
    });
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

/**
 * Wait for a valid bearer to appear in the page's redux-persist IDB,
 * with exponential backoff.
 *
 * - Immediate probe first — no wait when the user is already signed in.
 * - Then 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, … (capped at 30s/step).
 * - Total budget ≈ 3 minutes. Covers "user is about to log in" and
 *   "token just expired, page is refreshing it" without burning the
 *   tab indefinitely.
 *
 * The content script lives for the life of the page, so if the user
 * navigates away or closes the tab the timers die with it automatically.
 */
async function waitForBearer(): Promise<string | null> {
  const MAX_TOTAL_MS = 3 * 60_000;
  const MAX_STEP_MS = 30_000;
  const startedAt = Date.now();
  let delayMs = 1_000;
  let attempt = 0;

  while (true) {
    const bearer = await extractBearerFromReduxPersist();
    if (bearer) {
      if (attempt > 0) {
        extLogger.info("scrape.bearer_acquired", {
          provider: "united",
          attempts: attempt + 1,
          elapsedMs: Date.now() - startedAt,
        });
      }
      return bearer;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = MAX_TOTAL_MS - elapsed;
    if (remaining <= 0) {
      extLogger.warn("scrape.bearer_timeout", {
        provider: "united",
        attempts: attempt + 1,
        elapsedMs: elapsed,
      });
      return null;
    }

    if (attempt === 0) {
      extLogger.info("scrape.awaiting_bearer", {
        provider: "united",
        reason: "no_bearer_yet",
      });
    }

    const wait = Math.min(delayMs, remaining);
    await sleep(wait);
    delayMs = Math.min(delayMs * 2, MAX_STEP_MS);
    attempt++;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull the signed-in API bearer out of the redux-persist blob United
 * stores in IndexedDB. Structure (transit-js-encoded):
 *
 *   ["~#iM", [
 *     "flightStartDate", null,
 *     …
 *     "apiToken", ["^ ", "hash", "DAAAA…", "expiresAt", "…", "isAuthenticated", true],
 *   ]]
 *
 * "~#iM" = immutable Map; pairs are alternating key/value. "^ " on a
 * nested array means it's also a Map. We don't bring in a transit
 * library — the shape is stable enough to walk manually.
 *
 * Returns null when unauthenticated, missing, or past `expiresAt`.
 */
async function extractBearerFromReduxPersist(): Promise<string | null> {
  const raw = await readIdb("localforage", "keyvaluepairs", "reduxPersist:global");
  if (typeof raw !== "string") return null;

  let parsed: unknown = raw;
  for (let i = 0; i < 3 && typeof parsed === "string"; i++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed[0] !== "~#iM") return null;

  const entries = parsed[1];
  if (!Array.isArray(entries)) return null;

  for (let i = 0; i < entries.length - 1; i += 2) {
    if (entries[i] !== "apiToken") continue;
    const token = entries[i + 1];
    if (!Array.isArray(token) || token[0] !== "^ ") return null;

    let hash: string | null = null;
    let expiresAt: string | null = null;
    let isAuthenticated = false;
    for (let j = 1; j < token.length - 1; j += 2) {
      if (token[j] === "hash" && typeof token[j + 1] === "string") {
        hash = token[j + 1] as string;
      } else if (
        token[j] === "expiresAt" &&
        typeof token[j + 1] === "string"
      ) {
        expiresAt = token[j + 1] as string;
      } else if (token[j] === "isAuthenticated") {
        isAuthenticated = token[j + 1] === true;
      }
    }
    // Redux keeps the last token in storage even after sign-out, so we
    // MUST honour `isAuthenticated` — otherwise we'd send a stale bearer
    // and the server rejects the request with an unauthenticated reply.
    if (!hash || !isAuthenticated) return null;
    if (expiresAt) {
      const expMs = Date.parse(expiresAt);
      // 5-second safety margin; skip if the token is about to expire.
      if (Number.isFinite(expMs) && expMs <= Date.now() + 5_000) {
        return null;
      }
    }
    return hash;
  }
  return null;
}

function readIdb(
  dbName: string,
  storeName: string,
  key: string
): Promise<unknown> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(dbName);
    } catch {
      resolve(null);
      return;
    }
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains(storeName)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(storeName, "readonly");
        const getReq = tx.objectStore(storeName).get(key);
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result);
        };
        getReq.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Miles synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
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
