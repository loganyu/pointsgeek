import { waitForBalance } from "../lib/scraper";
import { extLogger } from "../lib/logger";

export default defineContentScript({
  matches: [
    "https://www.americanexpress.com/*",
    "https://global.americanexpress.com/*",
  ],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "amex_mr", url });

    const result = await waitForBalance(document);

    if (result.success) {
      // Amex MR is a shared pool across all MR-earning cards — don't set
      // cardInfo or perCardBalances. Individual cards don't have separate
      // MR balances, so per-card balance stays null (distinguishing from
      // Chase cards that legitimately have 0 points).

      // Discover all cards from the product tiles on the dashboard
      const cards = await waitForCardsFromDashboard(document);
      if (cards.length > 0) {
        result.discoveredCards = cards;
        extLogger.info("scrape.discovered_cards", {
          provider: "amex_mr",
          count: cards.length,
          cards,
        });
      }

      extLogger.info("scrape.success", {
        provider: "amex_mr",
        balance: result.balance,
        matchedSelector: result.matchedSelector,
        durationMs: result.durationMs,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "amex_mr",
        error: result.error,
        durationMs: result.durationMs,
        selectorsAttempted: result.selectorsAttempted,
      });
    }

    browser.runtime.sendMessage({
      type: result.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
      provider: "amex_mr",
      payload: result,
    });
  },
});

/* ── Card discovery from Amex dashboard ──────────────────── */

/**
 * Extract cards from Amex product tiles.
 *
 * Each card tile on the Amex dashboard contains:
 *   - [data-locator-id="credo_card_name"]     → "Platinum Card®"
 *   - [data-locator-id="credo_card_acct_num"]  → " ••••81002"
 *
 * We walk up from the card name element to find the nearest ancestor
 * that also contains the account number, so the pairing is robust
 * regardless of DOM nesting depth.
 */
function extractCardsNow(
  doc: Document
): Array<{ cardName: string; lastFour?: string }> {
  const cards: Array<{ cardName: string; lastFour?: string }> = [];
  const nameEls = doc.querySelectorAll(
    '[data-locator-id="credo_card_name"]'
  );

  for (const nameEl of nameEls) {
    const cardName = nameEl.textContent
      ?.trim()
      ?.replace(/[®™©]/g, "")
      .trim();
    if (!cardName) continue;

    // Walk up to find a container that also has the account number
    let lastFour: string | undefined;
    let ancestor: Element | null = nameEl.parentElement;

    for (let depth = 0; depth < 6 && ancestor; depth++) {
      const acctEl = ancestor.querySelector(
        '[data-locator-id="credo_card_acct_num"]'
      );
      if (acctEl) {
        const acctText = acctEl.textContent?.trim() ?? "";
        // Amex shows "••••81002" — extract trailing digits
        const digits = acctText.replace(/[^0-9]/g, "");
        lastFour = digits || undefined;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    cards.push({ cardName, lastFour });
  }

  return cards;
}

/**
 * Wait for card tiles to render on the Amex dashboard, then extract.
 * The product tiles may load asynchronously after the rewards balance.
 */
function waitForCardsFromDashboard(
  doc: Document,
  timeoutMs = 10_000
): Promise<Array<{ cardName: string; lastFour?: string }>> {
  const immediate = extractCardsNow(doc);
  if (immediate.length > 0) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      // Return whatever we have (possibly empty)
      resolve(extractCardsNow(doc));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const cards = extractCardsNow(doc);
      if (cards.length > 0) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(cards);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
