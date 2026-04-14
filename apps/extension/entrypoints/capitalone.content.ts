import { waitForCapitalOneBalance } from "../lib/scraper-capitalone";
import { extLogger } from "../lib/logger";

export default defineContentScript({
  matches: [
    "https://myaccounts.capitalone.com/*",
    "https://verified.capitalone.com/*",
  ],
  async main() {
    extLogger.info("scrape.start", { provider: "capital_one", url: window.location.href });

    const result = await waitForCapitalOneBalance(document);

    if (result.success) {
      extLogger.info("scrape.success", {
        provider: "capital_one",
        balance: result.balance,
        matchedSelector: result.matchedSelector,
        durationMs: result.durationMs,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "capital_one",
        error: result.error,
        durationMs: result.durationMs,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      provider: "capital_one",
      payload: result,
    });
  },
});
