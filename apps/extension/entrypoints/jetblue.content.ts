import { extLogger } from "../lib/logger";
import {
  extractJetBlueOwnerLabel,
  jetBlueSelectorsAttempted,
  waitForJetBlueBalance,
  waitForJetBlueSignedInNav,
} from "../lib/scraper-jetblue";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * jetblue.com scraper - reads the signed-in TrueBlue nav button.
 *
 * JetBlue renders the user's avatar/name and balance directly in the
 * main nav:
 *
 *   [data-fs-element="main-nav-menu-button-user-trueblue"]
 *     [role="img"][aria-label="Logan Yu"]
 *     <span>14,027 pts</span>
 *
 * No TrueBlue number is visible in this markup, so we key the account
 * on the full name when present and allow a future API-backed scraper
 * to upgrade the program row to `loyalty:<trueBlueNumber>`.
 */
const SIGNED_IN_TIMEOUT_MS = 3 * 60_000;
const BALANCE_TIMEOUT_MS = 15_000;

export default defineContentScript({
  matches: ["https://www.jetblue.com/*", "https://jetblue.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "jetblue", url });
    extLogger.info("scrape.awaiting_sign_in", {
      provider: "jetblue",
      selector:
        '[data-fs-element="main-nav-menu-button-user-trueblue"]',
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
    });

    const signedIn = await waitForJetBlueSignedInNav(
      document,
      SIGNED_IN_TIMEOUT_MS
    );
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "jetblue",
        reason: "not_signed_in",
      });
      return;
    }
    extLogger.info("scrape.signed_in", { provider: "jetblue" });

    if (!(await syncWidget.start({ label: "JetBlue" }))) return;

    const extraction = await waitForJetBlueBalance(
      document,
      BALANCE_TIMEOUT_MS
    );
    if (!extraction.success || extraction.balance == null) {
      extLogger.warn("scrape.failed", {
        provider: "jetblue",
        error: extraction.error,
      });
      send({
        success: false,
        error: extraction.error,
        durationMs: extraction.durationMs,
        selectorsAttempted: extraction.selectorsAttempted.length
          ? extraction.selectorsAttempted
          : jetBlueSelectorsAttempted(),
        matchedSelector: extraction.matchedSelector,
      });
      return;
    }

    const ownerLabel = extractJetBlueOwnerLabel(document);
    const ident = accountIdFromOwner(ownerLabel);
    const balances: BalanceRecord[] = [
      {
        programKey: "jetblue_trueblue",
        balance: extraction.balance,
        balanceType: "total",
        externalAccountId: ident.externalAccountId,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "jetblue",
      balance: extraction.balance,
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

function accountIdFromOwner(ownerLabel: string | null): {
  externalAccountId: string;
  source: "greeting_name" | "default";
} {
  if (!ownerLabel) {
    return { externalAccountId: "default", source: "default" };
  }
  return {
    externalAccountId: `name:${ownerLabel.toLowerCase().replace(/\s+/g, " ")}`,
    source: "greeting_name",
  };
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("TrueBlue points synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "jetblue",
    payload,
  });
}
