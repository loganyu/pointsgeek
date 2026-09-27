import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { BalanceRecord, ScrapeResult } from "@points-geek/shared";

/**
 * rove.com scraper - calls Rove's miles API with the same bearer token
 * the logged-in web app uses.
 *
 *   GET https://api-v2.rove.com/api/v1/profiles/miles
 *     -> { data: { miles: { balance_available, balance_posted, ... } } }
 *
 * Auth is a Supabase access token stored by the SPA/SSR layer in
 * local/session storage or Supabase's chunked auth cookies. We scan those
 * browser-owned stores for a non-expired Rove Supabase JWT and never
 * commit the anon key or any captured bearer token.
 */
const MILES_URL = "https://api-v2.rove.com/api/v1/profiles/miles";
const ROVE_SUPABASE_PROJECT_REF = "gxwpiqhwrkqayzkpderc";
const ROVE_ISSUER_FRAGMENT = `${ROVE_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`;
const ROVE_AUTH_COOKIE_PREFIXES = [
  `sb-${ROVE_SUPABASE_PROJECT_REF}-auth-token`,
  "sb-api-auth-token",
];

interface MilesResponse {
  status_code?: number;
  success?: boolean;
  data?: {
    miles?: {
      balance_available?: number;
      balance_posted?: number;
      balance_pending?: number;
    };
  };
}

interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  email?: string;
  phone?: string;
  role?: string;
  user_metadata?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
}

export default defineContentScript({
  matches: ["https://www.rove.com/*", "https://rove.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "rove", url });

    const bearer = await waitForBearer();
    if (!bearer) {
      extLogger.info("scrape.skipped", {
        provider: "rove",
        reason: "no_bearer_after_retries",
      });
      return;
    }

    if (!(await syncWidget.start({ label: "Rove" }))) return;

    const stableId = findRoveStableId();
    const miles = await fetchMiles(bearer, stableId);
    if (!miles) {
      extLogger.warn("scrape.failed", {
        provider: "rove",
        reason: "miles_request_failed",
      });
      send({
        success: false,
        error: {
          code: "API_ERROR",
          message: "Rove miles request failed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [MILES_URL],
      });
      return;
    }

    const rawBalance =
      miles.data?.miles?.balance_available ??
      miles.data?.miles?.balance_posted;
    const balance = Math.round(Number(rawBalance));
    if (!Number.isFinite(balance) || balance < 0) {
      extLogger.warn("scrape.failed", {
        provider: "rove",
        reason: "balance_not_parsed",
        raw: rawBalance,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse Rove balance: ${rawBalance}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [MILES_URL],
      });
      return;
    }

    const payload = decodeJwt(bearer);
    const userId = payload?.sub;
    if (!userId) {
      extLogger.warn("scrape.failed", {
        provider: "rove",
        reason: "no_user_id_in_jwt",
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Rove JWT missing `sub`",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [MILES_URL],
      });
      return;
    }

    const ownerLabel = pickOwnerLabel(payload);
    const externalAccountId = `loyalty:${userId}`;
    const balances: BalanceRecord[] = [
      {
        programKey: "rove_miles",
        balance,
        balanceType: "total",
        externalAccountId,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "rove",
      balance,
      ownerLabel,
      hasStableId: !!stableId,
    });

    send({
      success: true,
      externalAccountId,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [MILES_URL],
      matchedSelector: MILES_URL,
    });
  },
});

async function fetchMiles(
  bearer: string,
  stableId: string | null
): Promise<MilesResponse | null> {
  try {
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${bearer}`,
      "cache-control": "no-cache",
      pragma: "no-cache",
    };
    if (stableId) headers["x-rove-stable-id"] = stableId;

    const resp = await fetch(MILES_URL, {
      method: "GET",
      headers,
    });
    if (!resp.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "rove",
        status: resp.status,
      });
      return null;
    }
    return (await resp.json()) as MilesResponse;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "rove",
      error: String(err),
    });
    return null;
  }
}

function findBearerInStorage(): string | null {
  const targeted = readSupabaseSession();
  if (targeted) return targeted;

  for (const storage of availableStorages()) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key);
      if (!value) continue;
      const found = findJwtInValue(value);
      if (found && isValidRoveJwt(found)) return found;
    }
  }
  return null;
}

function readSupabaseSession(): string | null {
  const keys = [
    `sb-${ROVE_SUPABASE_PROJECT_REF}-auth-token`,
    "sb-api-auth-token",
    `sb-${ROVE_SUPABASE_PROJECT_REF}-auth-token-code-verifier`,
  ];

  for (const storage of availableStorages()) {
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const found = findJwtInValue(raw);
      if (found && isValidRoveJwt(found)) return found;
    }
  }

  return readSupabaseCookieSession();
}

function readSupabaseCookieSession(): string | null {
  const cookies = readCookies();

  for (const cookiePrefix of ROVE_AUTH_COOKIE_PREFIXES) {
    for (const { name, value } of cookies) {
      if (name !== cookiePrefix) continue;
      const found = findJwtInValue(value);
      if (found && isValidRoveJwt(found)) return found;
    }

    const chunks = cookies
      .map((cookie) => {
        const match = cookie.name.match(
          new RegExp(`^${escapeRegExp(cookiePrefix)}\\.(\\d+)$`)
        );
        return match
          ? { index: Number(match[1]), value: cookie.value }
          : null;
      })
      .filter((chunk): chunk is { index: number; value: string } => !!chunk)
      .sort((a, b) => a.index - b.index);

    if (chunks.length === 0) continue;

    const found = findJwtInValue(chunks.map((chunk) => chunk.value).join(""));
    if (found && isValidRoveJwt(found)) return found;
  }

  return null;
}

function findRoveStableId(): string | null {
  for (const storage of availableStorages()) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (!/(rove|stable|device|visitor|anonymous)/i.test(key)) continue;
      const value = storage.getItem(key);
      if (!value) continue;
      const uuid = findUuidInValue(value);
      if (uuid) return uuid;
    }
  }
  return null;
}

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
          provider: "rove",
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
        provider: "rove",
        attempts: attempt + 1,
        elapsedMs: elapsed,
      });
      return null;
    }

    if (attempt === 0) {
      extLogger.info("scrape.awaiting_bearer", {
        provider: "rove",
        reason: "no_bearer_yet",
      });
    }

    const wait = Math.min(delayMs, remaining);
    await sleep(wait);
    delayMs = Math.min(delayMs * 2, MAX_STEP_MS);
    attempt++;
  }
}

function availableStorages(): Storage[] {
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
  return storages;
}

function readCookies(): Array<{ name: string; value: string }> {
  try {
    return document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf("=");
        const name = eq === -1 ? part : part.slice(0, eq);
        const value = eq === -1 ? "" : part.slice(eq + 1);
        return { name, value };
      });
  } catch {
    return [];
  }
}

function findJwtInValue(raw: string): string | null {
  for (const value of encodedValueVariants(raw)) {
    if (looksLikeJwt(value)) return value;
    try {
      const found = findJwtInUnknown(JSON.parse(value));
      if (found) return found;
    } catch {
      /* try next representation */
    }
  }
  return null;
}

function findJwtInUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    if (looksLikeJwt(value)) return value;
    try {
      const inner = JSON.parse(value);
      if (typeof inner === "string" && looksLikeJwt(inner)) return inner;
      return findJwtInUnknown(inner);
    } catch {
      return null;
    }
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

function findUuidInValue(raw: string): string | null {
  const direct = raw.match(UUID_RE)?.[0];
  if (direct) return direct;
  try {
    return findUuidInUnknown(JSON.parse(raw));
  } catch {
    return null;
  }
}

function findUuidInUnknown(value: unknown): string | null {
  if (typeof value === "string") return value.match(UUID_RE)?.[0] ?? null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUuidInUnknown(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (!/(rove|stable|device|visitor|anonymous)/i.test(key)) continue;
      const found = findUuidInUnknown(v);
      if (found) return found;
    }
  }
  return null;
}

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function encodedValueVariants(raw: string): string[] {
  const variants = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) variants.push(decoded);
  } catch {
    /* not URI-encoded */
  }

  for (const candidate of [...variants]) {
    if (!candidate.startsWith("base64-")) continue;
    const decoded = decodeBase64(candidate.slice("base64-".length));
    if (decoded) variants.push(decoded);
  }

  return variants;
}

function decodeBase64(raw: string): string | null {
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeJwt(s: string): boolean {
  return /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

function isValidRoveJwt(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload) return false;
  if (
    typeof payload.iss !== "string" ||
    !payload.iss.includes(ROVE_ISSUER_FRAGMENT)
  ) {
    return false;
  }
  if (payload.aud && payload.aud !== "authenticated") return false;
  if (payload.role && payload.role !== "authenticated") return false;
  if (
    typeof payload.exp === "number" &&
    payload.exp * 1000 <= Date.now() + 5_000
  ) {
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

function pickOwnerLabel(payload: JwtPayload | null): string | null {
  const first = payload?.user_metadata?.first_name?.trim();
  if (first) return titleCase(first);

  const email = payload?.user_metadata?.email?.trim() || payload?.email?.trim();
  if (email?.includes("@")) return titleCase(email.split("@")[0]);

  return null;
}

function titleCase(raw: string): string {
  const cleaned = raw.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Rove miles synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "rove",
    payload,
  });
}
