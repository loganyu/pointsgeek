import { extLogger } from "../lib/logger";
import {
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

    if (!(await syncWidget.start({ label: "JAL" }))) return;

    const extraction = await waitForJalMileageBankBalance(
      document,
      BALANCE_TIMEOUT_MS
    );
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

    const membershipNumber = extractJalMembershipNumber(document);
    const ownerLabel = extractJalOwnerLabel(document);
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
