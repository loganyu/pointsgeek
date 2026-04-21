import { waitForAmexOverview } from "../lib/scraper-amex-overview";
import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";

/**
 * Amex content script.
 *
 * Walks the overview page DOM (rewards tiles, product-card grid, linked
 * card spans) to pull every balance, card, and loyalty-account number
 * the page exposes. The page's `window.__INITIAL_STATE__` would be a
 * richer source, but by the time a regular content script runs, the
 * value has been hydrated and removed from both the DOM and `window`
 * — and a MAIN-world capture script didn't load reliably enough to
 * justify the complexity. DOM parsing is more than good enough.
 */
export default defineContentScript({
  // Narrow to just the authenticated overview page. Broader patterns like
  // `*.americanexpress.com/*` would fire on the public marketing pages
  // and login flow, which flashes a useless "Syncing Amex…" pill.
  // Chrome match patterns ignore query strings and fragments, so this
  // correctly covers `/overview?...` variants too.
  matches: ["https://global.americanexpress.com/overview"],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "amex", url });
    syncWidget.start({ label: "Amex" });

    const result = await waitForAmexOverview(document);

    if (result.success) {
      extLogger.info("scrape.success", {
        provider: "amex",
        balanceCount: result.balances?.length ?? 0,
        cardCount: result.cards?.length ?? 0,
        externalAccountId: result.externalAccountId,
        identifierSource: result.identifierSource,
        durationMs: result.durationMs,
        matchedSelector: result.matchedSelector,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "amex",
        error: result.error,
        durationMs: result.durationMs,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    if (result.success) {
      syncWidget.success("Points synced");
    } else {
      syncWidget.fail({
        code: result.error?.code,
        message: result.error?.message,
      });
    }
    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      provider: "amex",
      payload: result,
    });
  },
});
