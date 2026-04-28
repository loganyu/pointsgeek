import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * www.bilt.com scraper — calls Bilt's REST API at api.biltrewards.com.
 *
 *   GET /loyalty/user/basic
 *     → { availablePoints, currentTierName, tierPoints, tierSpend }
 *
 *   GET /bilt-card/cards/{cardId}
 *     → { cardProduct, nameOnCard, cardNumberLast4, cardArtUrl, ... }
 *
 * Auth is Bearer-JWT in the Authorization header. The JWT is issued by
 * Bilt's Keycloak (issuer `https://www.bilt.com/realms/BILT`). Bilt's
 * SPA stores it in localStorage (Keycloak's JS adapter default), so we
 * scan local + sessionStorage for any JWT whose `iss` matches Bilt and
 * whose `exp` hasn't elapsed.
 *
 * The token rotates on a ~15 min cadence; we read it fresh on each
 * scrape and silently skip when missing or expired (signed-out tab).
 *
 * Card discovery uses the wallet endpoint, filtered to Bilt-issued
 * cards (`isBiltCard: true`). Bilt's wallet also lists third-party
 * cards the user has linked for earning points on rent payments — we
 * skip those, they're not Bilt's own cards and their state lives with
 * the originating issuer.
 */
const LOYALTY_URL = "https://api.biltrewards.com/loyalty/user/basic";
const WALLET_URL =
  "https://api.biltrewards.com/wallet?refresh=true&includeHsaFsaCards=true&showBiltCards=true";

/** Bilt's Keycloak issuer — used to verify a localStorage JWT really
 *  is theirs and not some other token a coexisting widget left behind. */
const BILT_ISSUER_FRAGMENT = "bilt.com";

interface LoyaltyResponse {
  availablePoints?: number;
  currentTierName?: string;
  currentTierId?: number;
  tierPoints?: number;
  tierSpend?: number;
  tierGoodThrough?: string;
}

interface WalletResponse {
  creditCards?: WalletCreditCard[];
}

interface WalletCreditCard {
  uuid?: string;
  cardNumberLastFour?: string;
  brand?: string;
  cardProduct?: string;
  cardProductId?: string | null;
  imageUrl?: string;
  alias?: string;
  isBiltCard?: boolean;
}

interface JwtPayload {
  iss?: string;
  exp?: number;
  /** Token type — `"Bearer"` for the access token, `"ID"` for the OIDC
   *  id token, `"Refresh"` for the refresh token. We accept only Bearer. */
  typ?: string;
  email?: string;
  given_name?: string;
  firstName?: string;
  family_name?: string;
  preferred_username?: string;
  sub?: string;
}

export default defineContentScript({
  matches: ["https://www.bilt.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "bilt", url });

    // Wait for a fresh Bilt JWT to appear in storage. Like United, the
    // user might sign in mid-page-life — back off and retry for up to
    // 3 min before giving up. Don't mount the widget until we have
    // one, otherwise the marketing homepage flashes "Syncing Bilt…"
    // for the entire poll budget.
    const bearer = await waitForBearer();
    if (!bearer) {
      extLogger.info("scrape.skipped", {
        provider: "bilt",
        reason: "no_bearer_after_retries",
      });
      return;
    }
    syncWidget.start({ label: "Bilt" });

    // Fetch loyalty + wallet in parallel — independent calls, both
    // need the bearer.
    const [loyalty, wallet] = await Promise.all([
      fetchJson<LoyaltyResponse>(LOYALTY_URL, bearer),
      fetchJson<WalletResponse>(WALLET_URL, bearer),
    ]);
    if (!loyalty) {
      extLogger.warn("scrape.failed", {
        provider: "bilt",
        reason: "loyalty_request_failed",
      });
      send({
        success: false,
        error: {
          code: "API_ERROR",
          message: "Bilt loyalty request failed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [LOYALTY_URL],
      });
      return;
    }

    const rawBalance = loyalty.availablePoints;
    if (rawBalance == null) {
      // 200 OK but empty body — usually a stale JWT that got stripped
      // by Bilt's API. Treat as silent sign-out.
      extLogger.info("scrape.skipped", {
        provider: "bilt",
        reason: "no_loyalty_balance",
      });
      syncWidget.destroy();
      return;
    }

    const balance = Math.round(Number(rawBalance));
    if (!Number.isFinite(balance) || balance < 0) {
      extLogger.warn("scrape.failed", {
        provider: "bilt",
        reason: "balance_not_parsed",
        raw: rawBalance,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse availablePoints: ${rawBalance}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [LOYALTY_URL],
      });
      return;
    }

    // Pull identity off the JWT itself — Bilt's loyalty endpoint
    // doesn't echo the user, but the token's `sub` (Keycloak user UUID)
    // is a stable per-account id and `given_name` / `firstName` give us
    // the chip label.
    const payload = decodeJwt(bearer);
    const userId = payload?.sub;
    const ownerLabel = pickOwnerLabel(payload);

    if (!userId) {
      extLogger.warn("scrape.failed", {
        provider: "bilt",
        reason: "no_user_id_in_jwt",
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Bilt JWT missing `sub`",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [LOYALTY_URL],
      });
      return;
    }

    const balances: BalanceRecord[] = [
      {
        programKey: "bilt_rewards",
        balance,
        balanceType: "total",
        // Stamp the Keycloak user id so the row is stable even if a
        // future card-discovery scrape lands first or last.
        externalAccountId: `loyalty:${userId}`,
      },
    ];

    // Wallet failure isn't fatal — points balance is the primary
    // signal. Log and proceed with empty card list.
    if (!wallet) {
      extLogger.warn("scrape.wallet_failed", { provider: "bilt" });
    }
    const cards = extractBiltCards(wallet);

    extLogger.info("scrape.success", {
      provider: "bilt",
      balance,
      tier: loyalty.currentTierName,
      ownerLabel,
      cardCount: cards.length,
    });

    send({
      success: true,
      externalAccountId: `loyalty:${userId}`,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards,
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [LOYALTY_URL, WALLET_URL],
      matchedSelector: LOYALTY_URL,
    });
  },
});

/**
 * Walk the wallet response and return only Bilt-issued cards. The
 * wallet endpoint also surfaces third-party cards the user has linked
 * to earn Bilt points on outside spend (Amex, Sapphire Reserve, etc.) —
 * those belong to their originating issuer, not Bilt. Filter via
 * `isBiltCard: true`.
 *
 * Card name precedence:
 *  1. User-set `alias` (e.g. "Bilt Palladium Card") — they renamed it
 *     in Bilt's UI, respect that.
 *  2. Derived from `cardProductId` slug (e.g.
 *     `cpt_bilt_aspen_mastercard_credit_card` → "Bilt Aspen Mastercard").
 *  3. Hard fallback: "Bilt Mastercard".
 */
function extractBiltCards(wallet: WalletResponse | null): DiscoveredCard[] {
  if (!wallet?.creditCards) return [];
  const out: DiscoveredCard[] = [];
  for (const card of wallet.creditCards) {
    if (!card.isBiltCard) continue;
    const cardName =
      cleanAlias(card.alias) ??
      productIdToName(card.cardProductId) ??
      "Bilt Mastercard";
    out.push({
      cardName,
      lastFour: card.cardNumberLastFour ?? undefined,
      issuer: "bilt",
      programKey: "bilt_rewards",
      imageUrl: card.imageUrl ?? undefined,
    });
  }
  return out;
}

/**
 * Strip whitespace and reject obviously-empty alias strings. Bilt
 * sometimes leaves `alias` as a generic brand name like "Mastercard"
 * for unconfigured cards — we treat those as no-alias and fall through
 * to the product-derived name.
 */
function cleanAlias(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  // Generic brand-only aliases aren't useful as card names.
  if (/^(mastercard|visa|amex|american\s+express)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Map a Bilt cardProductId slug to a human-readable card name.
 * Slugs follow the pattern `cpt_<descriptor>_credit_card` —
 * snake_case_words separated by underscores.
 */
function productIdToName(productId: string | null | undefined): string | null {
  if (!productId) return null;
  // Drop the `cpt_` prefix and `_credit_card` suffix.
  const stem = productId
    .replace(/^cpt_/i, "")
    .replace(/_credit_card$/i, "");
  if (!stem) return null;
  return stem
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
    .trim();
}

async function fetchJson<T>(url: string, bearer: string): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${bearer}`,
      },
    });
    if (!resp.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "bilt",
        url,
        status: resp.status,
      });
      return null;
    }
    return (await resp.json()) as T;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "bilt",
      url,
      error: String(err),
    });
    return null;
  }
}

/**
 * Find a non-expired Bilt-issued access token in local-/session-storage.
 *
 * Two-stage lookup:
 *  1. Fast path — read the redux-persist `persist:auth` slice directly,
 *     which we know holds `{ accessToken, idToken, refreshToken }` with
 *     each value individually JSON-encoded inside the slice's own JSON
 *     (so the access token is double-quoted). This is the actual shape
 *     Bilt's SPA uses today.
 *  2. Fallback — scan every storage key looking for any Bilt-issued
 *     Bearer-typed JWT. Lets us survive a redux-persist key rename or
 *     the SPA migrating to a different state library, without a code
 *     change.
 *
 * Both paths reject ID tokens (`typ === "ID"`) and refresh tokens —
 * only Bearer-typed access tokens belong in the Authorization header.
 */
function findBearerInStorage(): string | null {
  const targeted = readReduxPersistAuthSlice();
  if (targeted) return targeted;

  const storages: Storage[] = [];
  try {
    storages.push(window.localStorage);
  } catch {
    /* private mode */
  }
  try {
    storages.push(window.sessionStorage);
  } catch {
    /* private mode */
  }

  for (const storage of storages) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key);
      if (!value) continue;
      const found = findJwtInValue(value);
      if (found && isValidBiltJwt(found)) return found;
    }
  }
  return null;
}

/**
 * Targeted reader for Bilt's redux-persist auth slice.
 *
 *   localStorage["persist:auth"] = JSON.stringify({
 *     accessToken: JSON.stringify("eyJ…"),    // ← double-encoded!
 *     idToken:     JSON.stringify("eyJ…"),
 *     refreshToken: JSON.stringify("eyJ…"),
 *     // …other state
 *   })
 *
 * So we parse twice: once for the slice, once for each token value.
 * Returns the access token if it's a valid Bilt-issued Bearer JWT.
 */
function readReduxPersistAuthSlice(): string | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem("persist:auth");
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const slice = JSON.parse(raw) as Record<string, unknown>;
    const innerJson = slice.accessToken;
    if (typeof innerJson !== "string") return null;
    const token = JSON.parse(innerJson);
    if (typeof token !== "string" || !looksLikeJwt(token)) return null;
    if (!isValidBiltJwt(token)) return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * Recursively walk a stored value (raw string, or JSON string that
 * decodes to a structure) looking for a Bilt Bearer JWT. Handles
 * arbitrary nesting and the double-encoded-string pattern (where a
 * value is itself JSON like `"\"eyJ…\""` rather than a plain JWT).
 */
function findJwtInValue(raw: string): string | null {
  if (looksLikeJwt(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return findJwtInUnknown(parsed);
  } catch {
    return null;
  }
}

function findJwtInUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    if (looksLikeJwt(value)) return value;
    // Unwrap double-encoded strings (redux-persist stores each slice
    // field as JSON.stringify'd inside an already-stringified slice,
    // so values arrive as `"\"eyJ…\""` after the first parse).
    try {
      const inner = JSON.parse(value);
      if (typeof inner === "string" && looksLikeJwt(inner)) return inner;
    } catch {
      /* not JSON; fall through */
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJwtInUnknown(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = findJwtInUnknown(v);
      if (found) return found;
    }
  }
  return null;
}

/** Three base64url segments separated by dots, header begins with `eyJ`. */
function looksLikeJwt(s: string): boolean {
  return /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

function isValidBiltJwt(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload) return false;
  // Issuer check — Bilt's Keycloak realm URL contains the apex domain.
  if (typeof payload.iss !== "string" || !payload.iss.includes(BILT_ISSUER_FRAGMENT)) {
    return false;
  }
  // Reject ID and refresh tokens — only Bearer-typed access tokens
  // belong in the Authorization header. Keycloak stamps `typ` on the
  // payload itself; if it's missing entirely, fall through (older
  // Keycloak builds didn't always set it).
  if (payload.typ && payload.typ !== "Bearer") return false;
  // Expiry check with 5s safety margin.
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now() + 5_000) {
    return false;
  }
  return true;
}

function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const b64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    return JSON.parse(atob(b64)) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Bilt's JWT carries first/last name in several flavours (Keycloak
 * standard claims `given_name` / `family_name`, plus their custom
 * `firstName` / `lastName`). Prefer the explicit first-name claims so
 * we get just the user's first name, not "first last".
 */
function pickOwnerLabel(payload: JwtPayload | null): string | null {
  if (!payload) return null;
  const first = payload.given_name?.trim() || payload.firstName?.trim();
  if (first) return titleCase(first);
  // Fall back to the email local-part if no name claim is present.
  if (payload.preferred_username?.includes("@")) {
    return titleCase(payload.preferred_username.split("@")[0]);
  }
  return null;
}

/**
 * Wait for a valid Bilt bearer to appear in storage, with exponential
 * backoff. Mirrors the United/AA pattern: immediate → 1s → 2s → 4s →
 * 8s → 16s → 30s/step, capped at ~3 min total budget.
 */
async function waitForBearer(): Promise<string | null> {
  const MAX_TOTAL_MS = 3 * 60_000;
  const MAX_STEP_MS = 30_000;
  const startedAt = Date.now();
  let delayMs = 1_000;
  let attempt = 0;

  while (true) {
    const bearer = findBearerInStorage();
    if (bearer) {
      if (attempt > 0) {
        extLogger.info("scrape.bearer_acquired", {
          provider: "bilt",
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
        provider: "bilt",
        attempts: attempt + 1,
        elapsedMs: elapsed,
      });
      return null;
    }

    if (attempt === 0) {
      extLogger.info("scrape.awaiting_bearer", {
        provider: "bilt",
        reason: "no_bearer_yet",
      });
    }

    const wait = Math.min(delayMs, remaining);
    await sleep(wait);
    delayMs = Math.min(delayMs * 2, MAX_STEP_MS);
    attempt++;
  }
}

function titleCase(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Points synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "bilt",
    payload,
  });
}
