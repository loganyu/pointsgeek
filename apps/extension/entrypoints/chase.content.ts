import { waitForChaseBalance } from "../lib/scraper-chase";
import { extLogger } from "../lib/logger";

export default defineContentScript({
  matches: [
    "https://ultimaterewardspoints.chase.com/*",
    "https://secure.chase.com/*",
  ],
  async main() {
    extLogger.info("scrape.start", { provider: "chase_ur", url: window.location.href });

    const result = await waitForChaseBalance(document);

    if (result.success) {
      extLogger.info("scrape.success", {
        provider: "chase_ur",
        balance: result.balance,
        matchedSelector: result.matchedSelector,
        durationMs: result.durationMs,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "chase_ur",
        error: result.error,
        durationMs: result.durationMs,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      provider: "chase_ur",
      payload: result,
    });
  },
});
