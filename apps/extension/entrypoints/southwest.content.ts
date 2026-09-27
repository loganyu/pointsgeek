import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { BalanceRecord, ScrapeResult } from "@points-geek/shared";

/**
 * southwest.com scraper - reads Rapid Rewards from Southwest's signed-in
 * loyalty-management customer details API.
 *
 *   GET /api/loyalty-management/v2/loyalty-management/accounts/self/customer-details-secure
 *     -> data.account.id + data.account.redeemable_points
 *
 * The request is same-origin and cookie-authenticated. Southwest also sends
 * the current x-api-key inside its id_token JWT, so use that when the cookie
 * is readable and fall back to the public site key observed on the SPA request.
 */
const CUSTOMER_DETAILS_URL =
  "https://www.southwest.com/api/loyalty-management/v2/loyalty-management/accounts/self/customer-details-secure";
const CUSTOMER_TIMEOUT_MS = 30_000;
const CUSTOMER_POLL_MS = 1_000;
const SOUTHWEST_APP_VERSION = "27.0.0";
const FALLBACK_API_KEY = "l7xx944d175ea25f4b9c903a583ea82a1c4c";

interface SouthwestCustomerResponse {
  data?: {
    account?: {
      id?: string;
      redeemable_points?: number;
    };
    personal_details?: {
      first_name?: string;
      last_name?: string;
    };
    preferences?: {
      preferred_name?: string;
    };
  };
}

interface SouthwestIdTokenPayload {
  apiKey?: unknown;
  sub?: unknown;
  exp?: unknown;
  apiContext?: {
    customerInformation?: {
      accountNumber?: unknown;
      redeemablePoints?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      preferredName?: unknown;
    };
  };
}

export default defineContentScript({
  matches: ["https://www.southwest.com/*", "https://southwest.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "southwest", url });

    const data = await waitForCustomerDetails(CUSTOMER_TIMEOUT_MS);
    const apiAccount = data?.data?.account;
    const tokenPayload = readIdTokenPayload();
    const tokenAccount = tokenPayload?.apiContext?.customerInformation;
    const accountId = normalizeAccountId(
      apiAccount?.id ?? tokenAccount?.accountNumber ?? tokenPayload?.sub
    );

    // No account id means a public/signed-out Southwest page. Skip quietly.
    if (!accountId) {
      extLogger.info("scrape.skipped", {
        provider: "southwest",
        reason: "no_account_or_unauthenticated",
        hasIdToken: !!readCookie("id_token"),
        hasApiData: !!data?.data,
      });
      return;
    }

    if (!(await syncWidget.start({ label: "Southwest" }))) return;

    const rawPoints =
      apiAccount?.redeemable_points ?? tokenAccount?.redeemablePoints;
    const points = Math.round(Number(rawPoints));
    if (!Number.isFinite(points) || points < 0) {
      extLogger.warn("scrape.failed", {
        provider: "southwest",
        reason: "points_not_parsed",
        hasApiAccount: !!apiAccount,
        hasTokenAccount: !!tokenAccount,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Could not parse Southwest Rapid Rewards points",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [CUSTOMER_DETAILS_URL],
      });
      return;
    }

    const externalAccountId = `loyalty:${accountId}`;
    const ownerLabel = buildOwnerLabel(data, tokenPayload);
    const balances: BalanceRecord[] = [
      {
        programKey: "southwest_rapid_rewards",
        balance: points,
        balanceType: "total",
        externalAccountId,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "southwest",
      points,
      ownerLabel,
      source: apiAccount ? "api" : "id_token",
    });

    send({
      success: true,
      externalAccountId,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [CUSTOMER_DETAILS_URL],
      matchedSelector: apiAccount ? CUSTOMER_DETAILS_URL : "id_token",
    });
  },
});

async function waitForCustomerDetails(
  timeoutMs: number
): Promise<SouthwestCustomerResponse | null> {
  const start = Date.now();
  let last: SouthwestCustomerResponse | null = null;
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    last = await fetchCustomerDetails({ logFailures: attempts === 1 });
    if (last?.data?.account?.id) {
      if (attempts > 1) {
        extLogger.info("scrape.customer_ready", {
          provider: "southwest",
          attempts,
          waitedMs: Date.now() - start,
        });
      }
      return last;
    }

    // If Southwest's readable JWT already has account data, avoid repeated API
    // calls on pages where the endpoint is not available yet.
    const tokenAccount = readIdTokenPayload()?.apiContext?.customerInformation;
    if (normalizeAccountId(tokenAccount?.accountNumber)) return last;

    await sleep(CUSTOMER_POLL_MS);
  }

  return last;
}

async function fetchCustomerDetails({
  logFailures,
}: {
  logFailures: boolean;
}): Promise<SouthwestCustomerResponse | null> {
  try {
    const response = await fetch(CUSTOMER_DETAILS_URL, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "x-api-key": resolveApiKey(),
        "x-app-id": "landing-home-page-v2",
        "x-app-version": SOUTHWEST_APP_VERSION,
        "x-channel-id": "southwest",
        "x-diagnostic": JSON.stringify({ spa: SOUTHWEST_APP_VERSION }),
      },
    });

    if (!response.ok) {
      if (!logFailures) return null;
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "southwest",
        status: response.status,
      });
      return null;
    }

    return (await response.json()) as SouthwestCustomerResponse;
  } catch (err) {
    if (!logFailures) return null;
    extLogger.warn("scrape.fetch_error", {
      provider: "southwest",
      error: String(err),
    });
    return null;
  }
}

function resolveApiKey(): string {
  const payload = readIdTokenPayload();
  return typeof payload?.apiKey === "string" && payload.apiKey.trim()
    ? payload.apiKey
    : FALLBACK_API_KEY;
}

function readIdTokenPayload(): SouthwestIdTokenPayload | null {
  const token = readCookie("id_token");
  if (!token) return null;
  const payload = decodeJwtPayload<SouthwestIdTokenPayload>(token);
  if (!payload) return null;

  const exp = Number(payload.exp);
  if (Number.isFinite(exp) && exp * 1000 <= Date.now()) return null;
  return payload;
}

function decodeJwtPayload<T>(token: string): T | null {
  const part = token.split(".")[1];
  if (!part) return null;

  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const base64 = padded.padEnd(
      padded.length + ((4 - (padded.length % 4)) % 4),
      "="
    );
    return JSON.parse(atob(base64)) as T;
  } catch (err) {
    extLogger.warn("scrape.jwt_parse_failed", {
      provider: "southwest",
      error: String(err),
    });
    return null;
  }
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function normalizeAccountId(value: unknown): string | null {
  const normalized = String(value ?? "").replace(/\D/g, "");
  return normalized || null;
}

function buildOwnerLabel(
  response: SouthwestCustomerResponse | null,
  tokenPayload: SouthwestIdTokenPayload | null
): string | null {
  const apiName = response?.data?.personal_details;
  const tokenName = tokenPayload?.apiContext?.customerInformation;
  const fromParts = [
    titleCase(apiName?.first_name ?? tokenName?.firstName),
    titleCase(apiName?.last_name ?? tokenName?.lastName),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromParts) return fromParts;

  return titleCase(
    response?.data?.preferences?.preferred_name ?? tokenName?.preferredName
  );
}

function titleCase(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
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
    provider: "southwest",
    payload,
  });
}
