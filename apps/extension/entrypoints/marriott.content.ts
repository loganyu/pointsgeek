import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * marriott.com scraper — reads Marriott's own phoenix APIs directly.
 *
 *   /mi/phoenix-gateway/session          → rewardsId (Bonvoy member #)
 *   /mi/phoenix-account-auth/v2/userDetails → points balance + name + tier
 *
 * Both endpoints rely on the user's session cookies (set by the logged-in
 * browser tab), which a content script inherits for same-origin fetches.
 * This is a strict upgrade over DOM scraping:
 *   • gets the Bonvoy number the drawer never exposes (stable loyalty id
 *     for cross-scraper dedup with chaseloyalty's `loyalty:<n>`)
 *   • no drawer-open UI flicker
 *   • not coupled to Marriott's hashed class names
 *
 * Exits silently when `authenticated: false` — signed-out pages still
 * return 200 OK with that flag, so we don't report an error.
 */
const SESSION_URL = "https://www.marriott.com/mi/phoenix-gateway/session";
const USER_DETAILS_URL =
  "https://www.marriott.com/mi/phoenix-account-auth/v2/userDetails";

export default defineContentScript({
  matches: ["https://www.marriott.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "marriott", url });
    // Don't mount the widget until we've confirmed the user is signed
    // in — otherwise visiting marriott.com while logged out would flash
    // a "Syncing Marriott…" pill that we'd silently tear down, which
    // looks like the extension is malfunctioning.

    const [session, userDetails] = await Promise.all([
      fetchJson(SESSION_URL),
      fetchJson(USER_DETAILS_URL),
    ]);

    if (!session?.authenticated) {
      extLogger.info("scrape.skipped", {
        provider: "marriott",
        reason: "not_authenticated",
      });
      return;
    }

    syncWidget.start({ label: "Marriott" });

    const rewardsId: string | undefined = session?.cacheData?.data?.rewardsId;
    const firstName: string | undefined = session?.cacheData?.data?.firstName;
    const lastName: string | undefined = session?.cacheData?.data?.lastName;
    const consumerName: string | undefined =
      userDetails?.headerSubtext?.consumerName;
    const pointsStr: string | undefined =
      userDetails?.userProfileSummary?.currentPoints;

    const points = pointsStr
      ? parseInt(pointsStr.replace(/[^0-9]/g, ""), 10)
      : NaN;

    if (!Number.isFinite(points) || points < 0) {
      extLogger.warn("scrape.failed", {
        provider: "marriott",
        reason: "points_not_parsed",
        pointsStr: pointsStr ?? null,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse points from: ${pointsStr ?? "(missing)"}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [SESSION_URL, USER_DETAILS_URL],
      });
      return;
    }

    const externalAccountId = rewardsId ? `loyalty:${rewardsId}` : "default";
    // Session returns the name in all-caps ("LOGAN", "YU"); prefer the
    // already-cased `consumerName` from /userDetails for the first name
    // and title-case the last name off the session endpoint. Falls back
    // to whichever piece we have.
    const ownerLabel = buildFullName({
      firstName,
      lastName,
      consumerName,
    });

    const balances: BalanceRecord[] = [
      {
        programKey: "marriott_bonvoy",
        balance: points,
        balanceType: "total",
        ...(rewardsId ? { externalAccountId: `loyalty:${rewardsId}` } : {}),
      },
    ];

    extLogger.info("scrape.success", {
      provider: "marriott",
      points,
      rewardsId: rewardsId ?? null,
      ownerLabel,
    });

    send({
      success: true,
      externalAccountId,
      ownerLabel,
      identifierSource: rewardsId ? "customer_id" : "default",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [SESSION_URL, USER_DETAILS_URL],
      matchedSelector: USER_DETAILS_URL,
    });
  },
});

/**
 * Same-origin JSON GET from within a content script. Content scripts in
 * the isolated world share the page's cookie jar, so Marriott's session
 * cookie is attached automatically. Returns null on network error,
 * non-2xx, or non-JSON — the caller short-circuits.
 */
async function fetchJson(url: string): Promise<any> {
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
    provider: "marriott",
    payload,
  });
}

function buildFullName(args: {
  firstName?: string;
  lastName?: string;
  consumerName?: string;
}): string | null {
  const first =
    args.consumerName?.trim() ||
    (args.firstName ? titleCase(args.firstName) : "");
  const last = args.lastName ? titleCase(args.lastName) : "";
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || null;
}

function titleCase(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
