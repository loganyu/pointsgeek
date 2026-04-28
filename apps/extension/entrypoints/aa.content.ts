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
 * Sign-in detection has a subtle gotcha: `at_check=true` is *sticky*.
 * AA sets it on first login and never clears it on sign-out. So the
 * cookie alone isn't a reliable "auth is fresh" signal — it just means
 * "this browser was authenticated at some point". Without further
 * verification we'd flash "Syncing AA…" / "Sync failed" on the login
 * page after sign-out.
 *
 * Strategy: use `at_check` as a cheap "have we ever been signed in?"
 * gate, then always run a silent bootstrap GraphQL call to verify the
 * access_token is *currently* valid. Only mount the widget once that
 * confirms — stale auth becomes a silent skip instead of a visible
 * failure.
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

export default defineContentScript({
  matches: ["https://www.aa.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "aa", url });

    // Step 1: cheap check — has this browser ever been signed in?
    // No `at_check` ever means we shouldn't even hit the network.
    const signedIn = await waitForSignIn();
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "aa",
        reason: "not_signed_in",
      });
      return;
    }

    // Step 2: silent bootstrap — verify auth is *currently* valid.
    // Done before mounting the widget so a stale `at_check=true` (left
    // behind by a previous sign-in) becomes a silent skip rather than
    // a visible "Sync failed" on the login page. If this returns no
    // advantageNumber, the access_token has expired or been cleared;
    // nothing to scrape.
    const bootstrap = await graphqlPost<BootstrapResponse>(
      "CustomerBootstrap",
      BOOTSTRAP_QUERY,
      {},
    );
    const advantageNumber = bootstrap?.data?.customer?.advantageNumber;
    if (!advantageNumber) {
      extLogger.info("scrape.skipped", {
        provider: "aa",
        reason: "auth_bootstrap_failed",
      });
      return;
    }

    // Step 3: auth confirmed → mount widget and fetch the actual data.
    syncWidget.start({ label: "AA" });

    const member = await graphqlPost<MemberResponse>(
      "MemberInformation",
      MEMBER_QUERY,
      { advantageNumber },
    );
    const memberInfo = member?.data?.memberInformation;
    const rawBalance = memberInfo?.loyaltyBalance;

    if (!memberInfo || rawBalance == null) {
      // Bootstrap succeeded moments ago, so this is a real API issue
      // — surface it as a failure rather than a silent skip.
      extLogger.warn("scrape.failed", {
        provider: "aa",
        reason: "member_query_failed",
      });
      send({
        success: false,
        error: {
          code: "API_ERROR",
          message: "AA member info request failed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [GRAPHQL_URL],
      });
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

    const ownerLabel = parseFirstName(memberInfo.name);

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
