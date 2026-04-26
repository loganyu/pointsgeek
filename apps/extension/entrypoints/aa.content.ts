import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * aa.com scraper — calls AA's Apollo GraphQL endpoint directly.
 *
 *   POST https://www.aa.com/services/graphql
 *     → customer.advantageNumber, memberInformation.{name, loyaltyBalance}
 *
 * Auth is purely cookie-based. AA's signed-in pages set an `access_token`
 * cookie (a JWT) that the GraphQL endpoint validates. With
 * `credentials: "same-origin"` on our fetch, the cookie rides along
 * automatically — no Authorization header to extract.
 *
 * Wait pattern mirrors united.content.ts: poll the cookie with
 * exponential backoff so signing in mid-page-life still triggers a
 * scrape, then bail silently if it never appears (signed-out tab).
 *
 * AA doesn't issue cards directly (Citi and Barclays do), so this
 * scraper produces a single program-level balance and no card discovery.
 */
const GRAPHQL_URL = "https://www.aa.com/services/graphql";
const APOLLO_CLIENT_NAME = "promotions-aacom";
const APOLLO_CLIENT_VERSION = "1.0.1";

/** Minimal query — just what we need. Server returns __typename
 *  regardless of whether we ask for it; no need to include in the
 *  query string. */
const CUSTOMER_QUERY = `query CustomerProfile {
  customer {
    advantageNumber
    memberInformation {
      advantageNumber
      name
      loyaltyBalance
    }
  }
}`;

interface CustomerResponse {
  data?: {
    customer?: {
      advantageNumber?: string;
      memberInformation?: {
        advantageNumber?: string;
        name?: string;
        loyaltyBalance?: number;
      };
    };
  };
  errors?: unknown;
}

export default defineContentScript({
  matches: ["https://www.aa.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "aa", url });

    // Probe for sign-in via the access_token cookie. Like United, the
    // user might sign in mid-page-life — back off and retry for up to
    // 3 minutes before giving up. Don't mount the widget until we
    // confirm a token, otherwise the marketing homepage flashes
    // "Syncing AA…" for the entire poll budget.
    const hasToken = await waitForAccessToken();
    if (!hasToken) {
      extLogger.info("scrape.skipped", {
        provider: "aa",
        reason: "no_access_token",
      });
      return;
    }
    syncWidget.start({ label: "AA" });

    const json = await fetchCustomer();

    if (!json) {
      extLogger.warn("scrape.failed", {
        provider: "aa",
        reason: "graphql_request_failed",
      });
      send({
        success: false,
        error: {
          code: "API_ERROR",
          message: "AA GraphQL request failed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [GRAPHQL_URL],
      });
      return;
    }

    const customer = json.data?.customer;
    const member = customer?.memberInformation;
    const advantageNumber = member?.advantageNumber ?? customer?.advantageNumber;
    const rawBalance = member?.loyaltyBalance;

    if (!advantageNumber || rawBalance == null) {
      // The endpoint returned 200 but with empty data — usually means
      // the access_token was stale. Treat as silently signed-out: no
      // user-facing failure, just skip.
      extLogger.info("scrape.skipped", {
        provider: "aa",
        reason: "no_customer_data",
      });
      syncWidget.destroy();
      return;
    }

    const balance = Math.round(Number(rawBalance));
    if (!Number.isFinite(balance) || balance < 0) {
      extLogger.warn("scrape.failed", {
        provider: "aa",
        reason: "balance_not_parsed",
        raw: rawBalance,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse loyaltyBalance: ${rawBalance}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [GRAPHQL_URL],
      });
      return;
    }

    const ownerLabel = parseFirstName(member?.name);

    const balances: BalanceRecord[] = [
      {
        programKey: "aa_aadvantage",
        balance,
        balanceType: "total",
        // Stamp the AAdvantage number so this row dedupes against the
        // Citi-side AA scraper if it ever starts reporting it.
        externalAccountId: `loyalty:${advantageNumber}`,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "aa",
      balance,
      advantageNumber,
      ownerLabel,
    });

    send({
      success: true,
      externalAccountId: `loyalty:${advantageNumber}`,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [GRAPHQL_URL],
      matchedSelector: GRAPHQL_URL,
    });
  },
});

/**
 * AA's GraphQL endpoint reads auth from the `access_token` cookie.
 * `document.cookie` exposes it (it's not HttpOnly), so we poll for its
 * presence as a cheap signed-in probe before mounting the widget.
 *
 * Backoff schedule mirrors United: immediate → 1s → 2s → 4s → 8s →
 * 16s → 30s/step, capped at ~3 min total budget.
 */
async function waitForAccessToken(): Promise<boolean> {
  const MAX_TOTAL_MS = 3 * 60_000;
  const MAX_STEP_MS = 30_000;
  const startedAt = Date.now();
  let delayMs = 1_000;
  let attempt = 0;

  while (true) {
    if (hasAccessTokenCookie()) {
      if (attempt > 0) {
        extLogger.info("scrape.token_acquired", {
          provider: "aa",
          attempts: attempt + 1,
          elapsedMs: Date.now() - startedAt,
        });
      }
      return true;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = MAX_TOTAL_MS - elapsed;
    if (remaining <= 0) {
      extLogger.warn("scrape.token_timeout", {
        provider: "aa",
        attempts: attempt + 1,
        elapsedMs: elapsed,
      });
      return false;
    }

    if (attempt === 0) {
      extLogger.info("scrape.awaiting_token", {
        provider: "aa",
        reason: "no_access_token_yet",
      });
    }

    const wait = Math.min(delayMs, remaining);
    await sleep(wait);
    delayMs = Math.min(delayMs * 2, MAX_STEP_MS);
    attempt++;
  }
}

function hasAccessTokenCookie(): boolean {
  // Look for the cookie name as a complete token (avoid matching
  // `XSRF-TOKEN`, `refresh_token`, etc.).
  return /(?:^|;\s*)access_token=/.test(document.cookie);
}

async function fetchCustomer(): Promise<CustomerResponse | null> {
  try {
    const resp = await fetch(GRAPHQL_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        // AA uses Apollo client identification headers — including
        // them keeps us aligned with what the SPA itself sends.
        "apollographql-client-name": APOLLO_CLIENT_NAME,
        "apollographql-client-version": APOLLO_CLIENT_VERSION,
        "x-transactionid": newUuid(),
      },
      body: JSON.stringify({
        operationName: "CustomerProfile",
        variables: {},
        query: CUSTOMER_QUERY,
      }),
    });
    if (!resp.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "aa",
        status: resp.status,
      });
      return null;
    }
    return (await resp.json()) as CustomerResponse;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "aa",
      error: String(err),
    });
    return null;
  }
}

/**
 * AA returns the member's name as a single ALL-CAPS string ("LOGAN YU").
 * We only need the first word, title-cased ("Logan"), to drive the
 * owner chip.
 */
function parseFirstName(raw: string | undefined): string | null {
  if (!raw) return null;
  const first = raw.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** RFC 4122 v4 UUID — uses crypto.randomUUID where available, falls
 *  back to Math.random which is fine for a request correlation id. */
function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    provider: "aa",
    payload,
  });
}
