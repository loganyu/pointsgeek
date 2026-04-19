import { waitForAmexOverview } from "../lib/scraper-amex-overview";
import { extLogger } from "../lib/logger";

/**
 * Amex content script.
 *
 * Runs on any americanexpress.com page. The overview URL is rich with data
 * (all cards + all loyalty programs in one shot), so the scraper targets
 * that layout. On other Amex pages the extraction may come back empty —
 * that's fine, we emit the scrape event and stop.
 */
export default defineContentScript({
  matches: [
    "https://www.americanexpress.com/*",
    "https://global.americanexpress.com/*",
  ],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "amex", url });

    const result = await waitForAmexOverview(document);

    if (result.success) {
      extLogger.info("scrape.success", {
        provider: "amex",
        balanceCount: result.balances?.length ?? 0,
        cardCount: result.cards?.length ?? 0,
        externalAccountId: result.externalAccountId,
        identifierSource: result.identifierSource,
        durationMs: result.durationMs,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "amex",
        error: result.error,
        durationMs: result.durationMs,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      provider: "amex",
      payload: result,
    });
  },
});
