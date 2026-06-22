import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * cathaypacific.com scraper — calls the Cathay member profile API.
 *
 *   GET https://api.cathaypacific.com/mpo-common-services/v3/profile
 *     → { asiaMiles, membershipNumber, givenName, familyName, currentTier, … }
 *
 * Auth is purely cookie-based (no Authorization header). Cathay's
 * api.cathaypacific.com domain accepts cookies set on cathaypacific.com,
 * and CORS allows requests from `https://www.cathaypacific.com`. With
 * `credentials: "include"` the browser ships every relevant cookie
 * automatically — same pattern as AA's GraphQL endpoint.
 *
 * Strategy: fire the request silently before mounting the widget.
 *  - 200 with `asiaMiles` present → mount + scrape
 *  - 401 / 403 / empty data → silent skip (signed-out tab or session
 *    expired). No "Sync failed" flashed on a marketing page.
 *  - Network/parse error → real failure with widget shown
 *
 * Cathay doesn't issue cards directly, so this scraper only produces
 * a single program-level balance — no card discovery.
 */
const PROFILE_URL =
  "https://api.cathaypacific.com/mpo-common-services/v3/profile";

interface ProfileResponse {
  asiaMiles?: number;
  clubMiles?: number;
  clubPoints?: number;
  membershipNumber?: string;
  givenName?: string;
  familyName?: string;
  currentTier?: string;
}

export default defineContentScript({
  matches: ["https://www.cathaypacific.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "cathay", url });

    // Silent auth probe via the profile endpoint. If the user isn't
    // signed in we get a 401 (or empty `asiaMiles`); we silently skip
    // without flashing "Syncing Cathay…" on the marketing homepage.
    const profile = await fetchProfile();
    if (!profile) {
      extLogger.info("scrape.skipped", {
        provider: "cathay",
        reason: "no_profile_or_unauthenticated",
      });
      return;
    }

    const rawBalance = profile.asiaMiles;
    const membershipNumber = profile.membershipNumber;

    if (rawBalance == null || !membershipNumber) {
      extLogger.info("scrape.skipped", {
        provider: "cathay",
        reason: "incomplete_profile",
      });
      return;
    }

    if (!(await syncWidget.start({ label: "Cathay" }))) return;

    const balance = Math.round(Number(rawBalance));
    if (!Number.isFinite(balance) || balance < 0) {
      extLogger.warn("scrape.failed", {
        provider: "cathay",
        reason: "balance_not_parsed",
        raw: rawBalance,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse asiaMiles: ${rawBalance}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [PROFILE_URL],
      });
      return;
    }

    const ownerLabel = profile.givenName?.trim() || null;

    const balances: BalanceRecord[] = [
      {
        programKey: "asia_miles",
        balance,
        balanceType: "total",
        // Stamp the membership number as the stable per-account id so
        // a future oneworld partner scraper that reports the same AM
        // account number dedupes into one program row.
        externalAccountId: `loyalty:${membershipNumber}`,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "cathay",
      balance,
      membershipNumber,
      tier: profile.currentTier,
      ownerLabel,
    });

    send({
      success: true,
      externalAccountId: `loyalty:${membershipNumber}`,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [PROFILE_URL],
      matchedSelector: PROFILE_URL,
    });
  },
});

async function fetchProfile(): Promise<ProfileResponse | null> {
  try {
    const r = await fetch(PROFILE_URL, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
      },
    });
    if (!r.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "cathay",
        status: r.status,
      });
      return null;
    }
    return (await r.json()) as ProfileResponse;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "cathay",
      error: String(err),
    });
    return null;
  }
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Asia Miles synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "cathay",
    payload,
  });
}
