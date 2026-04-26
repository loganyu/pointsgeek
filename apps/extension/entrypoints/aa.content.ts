import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * aa.com scraper — calls AA's Apollo GraphQL endpoint directly.
 *
 *   POST https://www.aa.com/services/graphql
 *     → customer.advantageNumber, memberInformation.{name, loyaltyBalance}
 *
 * Auth is purely cookie-based. AA's signed-in pages set an HttpOnly
 * `access_token` cookie (a JWT) that the GraphQL endpoint validates.
 * With `credentials: "same-origin"` on our fetch, the cookie rides along
 * automatically — no Authorization header to extract.
 *
 * The `access_token` itself is HttpOnly so JS can't see it via
 * `document.cookie`. AA exposes a parallel non-HttpOnly `at_check=true`
 * flag for exactly this purpose — we poll *that* as the signed-in probe
 * with exponential backoff so signing in mid-page-life still triggers a
 * scrape, then bail silently if it never appears (signed-out tab).
 *
 * AA doesn't issue cards directly (Citi and Barclays do), so this
 * scraper produces a single program-level balance and no card discovery.
 */
const GRAPHQL_URL = "https://www.aa.com/services/graphql";
const APOLLO_CLIENT_NAME = "promotions-aacom";
const APOLLO_CLIENT_VERSION = "1.0.1";

/**
 * AA's GraphQL schema requires `advantageNumber` as an explicit argument
 * on `memberInformation` — we can't get away with a single nested query
 * off `customer`. We resolve the AAdvantage number first (cheaply from
 * a cookie when possible, by GraphQL bootstrap when not), then fetch
 * the member info.
 */
const BOOTSTRAP_QUERY = `query CustomerBootstrap {
  customer {
    advantageNumber
  }
}`;

const MEMBER_QUERY = `query MemberInformation($advantageNumber: String!) {
  memberInformation(advantageNumber: $advantageNumber) {
    advantageNumber
    name
    loyaltyBalance
  }
}`;

interface BootstrapResponse {
  data?: { customer?: { advantageNumber?: string } };
  errors?: unknown;
}

interface MemberResponse {
  data?: {
    memberInformation?: {
      advantageNumber?: string;
      name?: string;
      loyaltyBalance?: number;
    };
  };
  errors?: unknown;
}

/** Synthesised shape returned by `fetchCustomer`. Mirrors the original
 *  nested shape so the caller doesn't need to change. */
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

    // Probe for sign-in via the at_check cookie (the readable companion
    // to the HttpOnly access_token). User might sign in mid-page-life
    // — back off and retry for up to 3 minutes before giving up. Don't
    // mount the widget until we confirm sign-in, otherwise the marketing
    // homepage flashes "Syncing AA…" for the entire poll budget.
    const signedIn = await waitForSignIn();
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "aa",
        reason: "not_signed_in",
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
 * AA's GraphQL endpoint reads auth from the HttpOnly `access_token`
 * cookie — invisible to `document.cookie`, so we can't probe it
 * directly from a content script. Instead we watch for `at_check=true`,
 * a non-HttpOnly companion AA's frontend sets alongside the auth cookie
 * for exactly this kind of "is the user signed in?" check.
 *
 * Once `at_check=true` is present, the auth cookie is also set and a
 * same-origin fetch with `credentials: "same-origin"` will carry it.
 *
 * Backoff schedule mirrors United: immediate → 1s → 2s → 4s → 8s →
 * 16s → 30s/step, capped at ~3 min total budget.
 */
async function waitForSignIn(): Promise<boolean> {
  const MAX_TOTAL_MS = 3 * 60_000;
  const MAX_STEP_MS = 30_000;
  const startedAt = Date.now();
  let delayMs = 1_000;
  let attempt = 0;

  while (true) {
    if (hasSignedInMarker()) {
      if (attempt > 0) {
        extLogger.info("scrape.signed_in", {
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
      extLogger.warn("scrape.sign_in_timeout", {
        provider: "aa",
        attempts: attempt + 1,
        elapsedMs: elapsed,
      });
      return false;
    }

    if (attempt === 0) {
      extLogger.info("scrape.awaiting_sign_in", {
        provider: "aa",
        reason: "at_check_not_set",
      });
    }

    const wait = Math.min(delayMs, remaining);
    await sleep(wait);
    delayMs = Math.min(delayMs * 2, MAX_STEP_MS);
    attempt++;
  }
}

function hasSignedInMarker(): boolean {
  // `at_check=true` is AA's readable signal that the (HttpOnly)
  // access_token cookie has been set. Anchor on the cookie name
  // boundary so we don't accidentally match a substring inside another
  // cookie value.
  return /(?:^|;\s*)at_check=true(?:;|$)/.test(document.cookie);
}

async function fetchCustomer(): Promise<CustomerResponse | null> {
  // Step 1: get the AAdvantage number. Tealium's `utag_main_lid` cookie
  // holds it on every signed-in page, so we hit that first to avoid an
  // extra round-trip. If it's missing or malformed (Tealium swap, ad
  // blocker, fresh signup race), we fall back to a bootstrap GraphQL
  // call which has no required args.
  let advantageNumber = readAdvantageNumberFromCookie();
  if (!advantageNumber) {
    const bootstrap = await graphqlPost<BootstrapResponse>(
      "CustomerBootstrap",
      BOOTSTRAP_QUERY,
      {},
    );
    advantageNumber = bootstrap?.data?.customer?.advantageNumber ?? null;
  }
  if (!advantageNumber) {
    extLogger.warn("scrape.no_advantage_number", { provider: "aa" });
    return null;
  }

  // Step 2: fetch the member info now that we have the required arg.
  const member = await graphqlPost<MemberResponse>(
    "MemberInformation",
    MEMBER_QUERY,
    { advantageNumber },
  );
  if (!member) return null;

  // Re-shape into the nested form the caller expects.
  return {
    data: {
      customer: {
        advantageNumber,
        memberInformation: member.data?.memberInformation,
      },
    },
    errors: member.errors,
  };
}

/**
 * Generic GraphQL POST against AA's endpoint. Returns the parsed JSON
 * (or `null` on transport / non-2xx errors — caller decides how to
 * handle business errors in the `errors` field).
 */
async function graphqlPost<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
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
      body: JSON.stringify({ operationName, variables, query }),
    });
    if (!resp.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "aa",
        operationName,
        status: resp.status,
      });
      return null;
    }
    return (await resp.json()) as T;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "aa",
      operationName,
      error: String(err),
    });
    return null;
  }
}

/**
 * Pulls the AAdvantage number out of `utag_main_lid` (Tealium analytics
 * cookie). The raw value looks like `6LT6A60%3Bexp-session` — URL
 * decoded it's `6LT6A60;exp-session`, where `;exp-session` is Tealium's
 * session-scope marker that we strip off.
 *
 * Validates against the AAdvantage 6–9 alphanumeric format so we don't
 * pass garbage into the GraphQL `String!` arg.
 */
function readAdvantageNumberFromCookie(): string | null {
  const m = /(?:^|;\s*)utag_main_lid=([^;]+)/.exec(document.cookie);
  if (!m) return null;
  const decoded = decodeURIComponent(m[1]);
  const value = decoded.split(/[;\s]/)[0];
  if (!/^[A-Z0-9]{6,9}$/i.test(value)) return null;
  return value.toUpperCase();
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
