import { extLogger } from "../lib/logger";
import {
  alaskaSelectorsAttempted,
  extractAlaskaRewardsNumber,
  waitForAlaskaAtmosBalance,
  waitForAlaskaSignedIn,
} from "../lib/scraper-alaskaair";
import { syncWidget } from "../lib/sync-widget";
import type { BalanceRecord, ScrapeResult } from "@points-geek/shared";

/**
 * alaskaair.com Atmos Rewards scraper.
 *
 * The signed-in overview page renders both values directly:
 *   - "Rewards No. 723315353" in the loyalty header
 *   - "Available Points" + ".points-value" in the points card
 */
const SIGNED_IN_TIMEOUT_MS = 3 * 60_000;
const BALANCE_TIMEOUT_MS = 15_000;

export default defineContentScript({
  matches: [
    "https://www.alaskaair.com/atmosrewards/account/overview/*",
    "https://alaskaair.com/atmosrewards/account/overview/*",
  ],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "alaskaair", url });
    extLogger.info("scrape.awaiting_sign_in", {
      provider: "alaskaair",
      selector: "Rewards No. / available-points section",
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
    });

    const signedIn = await waitForAlaskaSignedIn(
      document,
      SIGNED_IN_TIMEOUT_MS
    );
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "alaskaair",
        reason: "not_signed_in",
      });
      return;
    }
    extLogger.info("scrape.signed_in", { provider: "alaskaair" });

    if (!(await syncWidget.start({ label: "Alaska" }))) return;

    const extraction = await waitForAlaskaAtmosBalance(
      document,
      BALANCE_TIMEOUT_MS
    );
    if (!extraction.success || extraction.balance == null) {
      extLogger.warn("scrape.failed", {
        provider: "alaskaair",
        error: extraction.error,
      });
      send({
        success: false,
        error: extraction.error,
        durationMs: extraction.durationMs,
        selectorsAttempted: extraction.selectorsAttempted.length
          ? extraction.selectorsAttempted
          : alaskaSelectorsAttempted(),
        matchedSelector: extraction.matchedSelector,
      });
      return;
    }

    const rewardsNumber = extractAlaskaRewardsNumber(document);
    const externalAccountId = rewardsNumber
      ? `loyalty:${rewardsNumber}`
      : "default";
    const identifierSource = rewardsNumber ? "customer_id" : "default";
    const balances: BalanceRecord[] = [
      {
        programKey: "alaska_atmos",
        balance: extraction.balance,
        balanceType: "total",
        externalAccountId,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "alaskaair",
      balance: extraction.balance,
      hasRewardsNumber: !!rewardsNumber,
      identifierSource,
    });

    send({
      success: true,
      externalAccountId,
      ownerLabel: null,
      identifierSource,
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: extraction.selectorsAttempted,
      matchedSelector: extraction.matchedSelector,
    });
  },
});

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Atmos points synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "alaskaair",
    payload,
  });
}
