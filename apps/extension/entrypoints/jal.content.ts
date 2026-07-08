import { extLogger } from "../lib/logger";
import {
  extractJalMileageBankBalance,
  extractJalMembershipNumber,
  extractJalOwnerLabel,
  jalSelectorsAttempted,
  waitForJalMileageBankBalance,
  waitForJalSignedIn,
} from "../lib/scraper-jal";
import { syncWidget } from "../lib/sync-widget";
import type { BalanceRecord, ScrapeResult } from "@points-geek/shared";

/**
 * jal.co.jp JAL Mileage Bank scraper.
 *
 * The signed-in JMB page renders the redeemable miles balance directly:
 *
 *   #JS_121_mileBalance -> "356,000"
 */
const SIGNED_IN_TIMEOUT_MS = 3 * 60_000;
const BALANCE_TIMEOUT_MS = 15_000;
const JAL_ACCOUNT_HINTS_KEY = "jalAccountHints";
const MAX_JAL_ACCOUNT_HINTS = 20;

interface JalAccountHint {
  ownerLabel: string;
  membershipNumber: string;
  updatedAt: string;
}

export default defineContentScript({
  matches: [
    "https://www.jal.co.jp/arl/en/jmb/*",
    "https://jal.co.jp/arl/en/jmb/*",
    "https://www121.jal.co.jp/JmbWeb/*",
  ],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "jal", url });
    extLogger.info("scrape.awaiting_sign_in", {
      provider: "jal",
      selector: "#JS_121_mileBalance / JMB status",
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
    });

    const signedIn = await waitForJalSignedIn(document, SIGNED_IN_TIMEOUT_MS);
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "jal",
        reason: "not_signed_in",
      });
      return;
    }
    extLogger.info("scrape.signed_in", { provider: "jal" });

    const initialMembershipNumber = extractJalMembershipNumber(document);
    const initialOwnerLabel = extractJalOwnerLabel(document);
    await rememberJalAccountHint(initialOwnerLabel, initialMembershipNumber);

    const immediateExtraction = extractJalMileageBankBalance(document);
    if (
      !immediateExtraction.success &&
      initialMembershipNumber &&
      initialOwnerLabel &&
      isJalProfilePage()
    ) {
      extLogger.info("scrape.skipped", {
        provider: "jal",
        reason: "account_hint_cached",
        hasMembershipNumber: true,
        ownerLabel: initialOwnerLabel,
      });
      return;
    }

    if (!(await syncWidget.start({ label: "JAL" }))) return;

    const extraction = immediateExtraction.success
      ? immediateExtraction
      : await waitForJalMileageBankBalance(document, BALANCE_TIMEOUT_MS);
    if (!extraction.success || extraction.balance == null) {
      extLogger.warn("scrape.failed", {
        provider: "jal",
        error: extraction.error,
      });
      send({
        success: false,
        error: extraction.error,
        durationMs: extraction.durationMs,
        selectorsAttempted: extraction.selectorsAttempted.length
          ? extraction.selectorsAttempted
          : jalSelectorsAttempted(),
        matchedSelector: extraction.matchedSelector,
      });
      return;
    }

    const ownerLabel = extractJalOwnerLabel(document);
    const pageMembershipNumber = extractJalMembershipNumber(document);
    await rememberJalAccountHint(ownerLabel, pageMembershipNumber);
    const membershipNumber =
      pageMembershipNumber ?? (await lookupCachedJalMembershipNumber(ownerLabel));
    const ident = accountIdFromMembershipOrOwner(membershipNumber, ownerLabel);
    const balances: BalanceRecord[] = [
      {
        programKey: "jal_mileage_bank",
        balance: extraction.balance,
        balanceType: "total",
        externalAccountId: ident.externalAccountId,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "jal",
      balance: extraction.balance,
      hasMembershipNumber: !!membershipNumber,
      ownerLabel,
      usedCachedMembershipNumber:
        !!membershipNumber && membershipNumber !== pageMembershipNumber,
      identifierSource: ident.source,
    });

    send({
      success: true,
      externalAccountId: ident.externalAccountId,
      ownerLabel,
      identifierSource: ident.source,
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: extraction.selectorsAttempted,
      matchedSelector: extraction.matchedSelector,
    });
  },
});

function isJalProfilePage(): boolean {
  return (
    window.location.pathname.includes("/JmbWeb/AR/AdrsChgPre") ||
    !!document.querySelector(".customerInfoBlockA02")
  );
}

function accountIdFromMembershipOrOwner(
  membershipNumber: string | null,
  ownerLabel: string | null
): {
  externalAccountId: string;
  source: "customer_id" | "greeting_name" | "default";
} {
  if (membershipNumber) {
    return {
      externalAccountId: `loyalty:${membershipNumber}`,
      source: "customer_id",
    };
  }

  if (ownerLabel) {
    return {
      externalAccountId: `name:${ownerLabel.toLowerCase().replace(/\s+/g, " ")}`,
      source: "greeting_name",
    };
  }

  return { externalAccountId: "default", source: "default" };
}

async function rememberJalAccountHint(
  ownerLabel: string | null,
  membershipNumber: string | null
): Promise<void> {
  const ownerKey = jalOwnerKey(ownerLabel);
  if (!ownerKey || !membershipNumber) return;

  const stored = await browser.storage.local.get(JAL_ACCOUNT_HINTS_KEY);
  const hints = parseJalAccountHints(stored[JAL_ACCOUNT_HINTS_KEY]);
  hints[ownerKey] = {
    ownerLabel: ownerLabel!,
    membershipNumber,
    updatedAt: new Date().toISOString(),
  };

  const trimmed = Object.fromEntries(
    Object.entries(hints)
      .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_JAL_ACCOUNT_HINTS)
  );
  await browser.storage.local.set({ [JAL_ACCOUNT_HINTS_KEY]: trimmed });
}

async function lookupCachedJalMembershipNumber(
  ownerLabel: string | null
): Promise<string | null> {
  const ownerKey = jalOwnerKey(ownerLabel);
  if (!ownerKey) return null;

  const stored = await browser.storage.local.get(JAL_ACCOUNT_HINTS_KEY);
  const hint = parseJalAccountHints(stored[JAL_ACCOUNT_HINTS_KEY])[ownerKey];
  return hint?.membershipNumber ?? null;
}

function parseJalAccountHints(value: unknown): Record<string, JalAccountHint> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: Record<string, JalAccountHint> = {};
  for (const [key, hint] of Object.entries(value)) {
    if (!hint || typeof hint !== "object" || Array.isArray(hint)) continue;
    const maybe = hint as Partial<JalAccountHint>;
    if (
      typeof maybe.ownerLabel === "string" &&
      typeof maybe.membershipNumber === "string" &&
      typeof maybe.updatedAt === "string"
    ) {
      out[key] = {
        ownerLabel: maybe.ownerLabel,
        membershipNumber: maybe.membershipNumber,
        updatedAt: maybe.updatedAt,
      };
    }
  }
  return out;
}

function jalOwnerKey(ownerLabel: string | null): string | null {
  const key =
    ownerLabel
      ?.replace(/\b(?:mr|mrs|ms|miss|dr)\.?\b/gi, " ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? "";
  return key || null;
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("JAL miles synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "jal",
    payload,
  });
}
