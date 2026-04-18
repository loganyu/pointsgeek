import { waitForDeltaBalance } from "../lib/scraper-delta";
import { extLogger } from "../lib/logger";

export default defineContentScript({
  matches: ["https://www.delta.com/*"],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "delta_skymiles", url });

    const result = await waitForDeltaBalance(document);

    if (result.success) {
      // Delta SkyMiles is a single-member airline program — one pool per account.
      // No cardInfo, discoveredCards, or perCardBalances.
      extLogger.info("scrape.success", {
        provider: "delta_skymiles",
        balance: result.balance,
        matchedSelector: result.matchedSelector,
        durationMs: result.durationMs,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "delta_skymiles",
        error: result.error,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      provider: "delta_skymiles",
      payload: result,
    });
  },
});
