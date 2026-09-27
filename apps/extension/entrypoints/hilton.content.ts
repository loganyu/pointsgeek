import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { BalanceRecord, ScrapeResult } from "@points-geek/shared";

/**
 * hilton.com scraper — reads Hilton Honors from Hilton's signed-in
 * customer GraphQL endpoint.
 *
 *   POST /graphql/customer?appName=dx-cpm-live&operationName=guest
 *     -> guest.hhonors.hhonorsNumber + guest.hhonors.summary.totalPoints
 *
 * The request is same-origin and cookie-authenticated. Signed-out visits
 * return no usable guest/Honors account, so we silently skip instead of
 * flashing a sync widget on Hilton's public pages.
 */
const GUEST_URL =
  "https://www.hilton.com/graphql/customer?appName=dx-cpm-live&operationName=guest";
const GUEST_TIMEOUT_MS = 30_000;
const GUEST_POLL_MS = 1_000;

const GUEST_QUERY = `
  query guest($guestId: BigInt!, $language: String!) {
    guest(guestId: $guestId, language: $language) {
      guestId
      userName
      hhonors {
        hhonorsNumber
        summary {
          points: totalPointsFmt
          tier
          tierName
          totalPoints
          totalPointsFmt
        }
      }
      personalinfo {
        name {
          firstName
          lastName
          nameFmt
        }
      }
    }
  }
`;

interface HiltonSummary {
  points?: string;
  totalPoints?: number;
  totalPointsFmt?: string;
  tier?: string;
  tierName?: string;
}

interface HiltonGuestName {
  firstName?: string;
  lastName?: string;
  nameFmt?: string;
}

interface HiltonGuestResponse {
  data?: {
    guest?: {
      guestId?: number;
      userName?: string;
      hhonors?: {
        hhonorsNumber?: string;
        summary?: HiltonSummary;
      };
      personalinfo?: {
        name?: HiltonGuestName;
      };
    };
  };
  errors?: unknown[];
}

export default defineContentScript({
  matches: ["https://www.hilton.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "hilton", url });

    const data = await waitForGuest(GUEST_TIMEOUT_MS);
    const guest = data?.data?.guest;
    const honors = guest?.hhonors;
    const hhonorsNumber = normalizeAccountNumber(
      honors?.hhonorsNumber ?? guest?.userName
    );

    if (!guest || !hhonorsNumber) {
      extLogger.info("scrape.skipped", {
        provider: "hilton",
        reason: "no_guest_or_unauthenticated",
        hasLoggedInCookie: document.cookie.includes("loggedIn=true"),
        hasWebGuestTokenCookie: document.cookie.includes("webGuestToken="),
        hasWebGuestMetadataCookie: document.cookie.includes("webGuestMetadata="),
        hasGuestIdCookie: !!readGuestIdFromCookie(),
        hasGuest: !!guest,
        hasHhonors: !!honors,
        hasHhonorsNumber: !!hhonorsNumber,
        errorCount: Array.isArray(data?.errors) ? data.errors.length : 0,
      });
      return;
    }

    if (!(await syncWidget.start({ label: "Hilton" }))) return;

    const points = parsePoints(honors?.summary);
    if (!Number.isFinite(points) || points < 0) {
      extLogger.warn("scrape.failed", {
        provider: "hilton",
        reason: "points_not_parsed",
        raw: honors?.summary ?? null,
      });
      send({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Could not parse Hilton Honors points",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [GUEST_URL],
      });
      return;
    }

    const externalAccountId = `loyalty:${hhonorsNumber}`;
    const ownerLabel = buildName(guest.personalinfo?.name);
    const balances: BalanceRecord[] = [
      {
        programKey: "hilton_honors",
        balance: points,
        balanceType: "total",
        externalAccountId,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "hilton",
      points,
      ownerLabel,
      hasHhonorsNumber: true,
    });

    send({
      success: true,
      externalAccountId,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [GUEST_URL],
      matchedSelector: GUEST_URL,
    });
  },
});

async function waitForGuest(timeoutMs: number): Promise<HiltonGuestResponse | null> {
  const start = Date.now();
  let last: HiltonGuestResponse | null = null;
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    const guestId = readGuestIdFromCookie();
    if (!guestId) {
      await sleep(GUEST_POLL_MS);
      continue;
    }

    last = await fetchGuest(guestId, resolveLanguage());
    const guest = last?.data?.guest;
    const hhonorsNumber = normalizeAccountNumber(
      guest?.hhonors?.hhonorsNumber ?? guest?.userName
    );
    if (guest && hhonorsNumber) {
      if (attempts > 1) {
        extLogger.info("scrape.guest_ready", {
          provider: "hilton",
          attempts,
          waitedMs: Date.now() - start,
        });
      }
      return last;
    }

    await sleep(GUEST_POLL_MS);
  }

  return last;
}

async function fetchGuest(
  guestId: number,
  language: string
): Promise<HiltonGuestResponse | null> {
  try {
    const response = await fetch(GUEST_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json; charset=utf-8",
        "cache-control": "no-cache",
        "content-type": "application/json; charset=utf-8",
        "dx-platform": "web",
        pragma: "no-cache",
      },
      body: JSON.stringify({
        operationName: "guest",
        variables: { guestId, language },
        query: GUEST_QUERY,
      }),
    });

    if (!response.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "hilton",
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as HiltonGuestResponse;
    if (data.errors?.length) {
      extLogger.warn("scrape.graphql_errors", {
        provider: "hilton",
        errorCount: data.errors.length,
      });
    }
    return data;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "hilton",
      error: String(err),
    });
    return null;
  }
}

function readGuestIdFromCookie(): number | null {
  const raw = readCookie("webGuestMetadata");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { guestId?: unknown };
    const guestId = Number(parsed.guestId);
    return Number.isFinite(guestId) && guestId > 0 ? guestId : null;
  } catch (err) {
    extLogger.warn("scrape.cookie_parse_failed", {
      provider: "hilton",
      cookie: "webGuestMetadata",
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
  return cookie ? cookie.slice(prefix.length) : null;
}

function resolveLanguage(): string {
  const raw =
    document.documentElement.lang || navigator.language || navigator.languages?.[0];
  const language = raw?.split("-")[0]?.toLowerCase();
  return language || "en";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePoints(summary?: HiltonSummary): number {
  const raw = summary?.totalPoints ?? summary?.totalPointsFmt ?? summary?.points;
  if (typeof raw === "number") return Math.round(raw);
  if (typeof raw === "string") {
    const parsed = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function normalizeAccountNumber(value?: string): string | null {
  const normalized = (value ?? "").replace(/\D/g, "");
  return normalized || null;
}

function buildName(name?: HiltonGuestName): string | null {
  const fromParts = [titleCase(name?.firstName), titleCase(name?.lastName)]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromParts) return fromParts;

  const formatted = titleCaseWords(name?.nameFmt);
  return formatted || null;
}

function titleCase(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function titleCaseWords(value?: string): string {
  return (value ?? "")
    .trim()
    .split(/\s+/)
    .map(titleCase)
    .filter(Boolean)
    .join(" ");
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
    provider: "hilton",
    payload,
  });
}
