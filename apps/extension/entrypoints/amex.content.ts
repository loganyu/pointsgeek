import { waitForBalance } from "../lib/scraper";
import { extLogger } from "../lib/logger";

export default defineContentScript({
  matches: [
    "https://www.americanexpress.com/*",
    "https://global.americanexpress.com/*",
  ],
  async main() {
    extLogger.info("scrape.start", { url: window.location.href });

    const result = await waitForBalance(document);

    if (result.success) {
      extLogger.info("scrape.success", {
        balance: result.balance,
        matchedSelector: result.matchedSelector,
        durationMs: result.durationMs,
      });
    } else {
      extLogger.warn("scrape.failed", {
        error: result.error,
        durationMs: result.durationMs,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      payload: result,
    });
  },
});
