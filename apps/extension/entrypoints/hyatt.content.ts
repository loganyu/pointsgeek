import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * hyatt.com scraper — reads the World of Hyatt points balance from
 * Hyatt's member profile API.
 *
 *   GET https://www.hyatt.com/profile/api/member/profile
 *     → profile.full.points (current balance) + loyaltyAccountNumber,
 *       name, and tier.
 *
 * Same-origin cookie auth: the content script shares the logged-in
 * www.hyatt.com cookie jar, so the request rides along automatically —
 * same pattern as the Marriott scraper. Signed-out visits return a
 * non-OK response (or a profile with no account number), and we silently
 * skip so we never flash a "Syncing Hyatt…" pill on a logged-out page.
 *
 * Hyatt issues no cards, so this produces a single program-level balance
 * (no card discovery). A balance of 0 (e.g. a freshly enrolled member)
 * is valid and reported as-is.
 */
const PROFILE_URL = "https://www.hyatt.com/profile/api/member/profile";

interface HyattProfile {
  profile?: {
    full?: {
      points?: number;
      accountNumber?: string;
      firstName?: string;
      lastName?: string;
    };
    extended?: {
      loyaltyAccountNumber?: string;
      memberInfo?: { currentPointBalance?: number };
    };
  };
}

export default defineContentScript({
  matches: ["https://www.hyatt.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "hyatt", url });

    const data = await fetchProfile();
    const full = data?.profile?.full;
    const extended = data?.profile?.extended;
    const loyaltyNumber = extended?.loyaltyAccountNumber || full?.accountNumber;

    // No profile / no account number → signed out. Silent skip (no widget).
    if (!full || !loyaltyNumber) {
      extLogger.info("scrape.skipped", {
        provider: "hyatt",
        reason: "no_profile_or_unauthenticated",
      });
      return;
    }

    if (!(await syncWidget.start({ label: "Hyatt" }))) return;

    // `points` is the live balance; fall back to the extended block's copy.
    const rawPoints = full.points ?? extended?.memberInfo?.currentPointBalance;
    const points = Math.round(Number(rawPoints));
    if (!Number.isFinite(points) || points < 0) {
      extLogger.warn("scrape.failed", {
        provider: "hyatt",
        reason: "points_not_parsed",
        raw: rawPoints ?? null,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: `Could not parse World of Hyatt points: ${rawPoints ?? "(missing)"}`,
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [PROFILE_URL],
      });
      return;
    }

    const ownerLabel = buildName(full.firstName, full.lastName);

    const balances: BalanceRecord[] = [
      {
        programKey: "world_of_hyatt",
        balance: points,
        balanceType: "total",
        // Stable per-account id so a future partner scraper reporting the
        // same Hyatt number dedupes into one program row.
        externalAccountId: `loyalty:${loyaltyNumber}`,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "hyatt",
      points,
      loyaltyNumber,
      ownerLabel,
    });

    send({
      success: true,
      externalAccountId: `loyalty:${loyaltyNumber}`,
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

async function fetchProfile(): Promise<HyattProfile | null> {
  try {
    const r = await fetch(PROFILE_URL, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!r.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "hyatt",
        status: r.status,
      });
      return null;
    }
    return (await r.json()) as HyattProfile;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "hyatt",
      error: String(err),
    });
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
    provider: "hyatt",
    payload,
  });
}

/** Hyatt returns ALL-CAPS names ("LOGAN", "YU"); title-case for display. */
function buildName(first?: string, last?: string): string | null {
  const full = [titleCase(first ?? ""), titleCase(last ?? "")]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || null;
}

function titleCase(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
