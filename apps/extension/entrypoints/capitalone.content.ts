import { waitForCapitalOneBalance } from "../lib/scraper-capitalone";
import { extLogger } from "../lib/logger";

export default defineContentScript({
  matches: [
    "https://myaccounts.capitalone.com/*",
    "https://verified.capitalone.com/*",
  ],
  async main() {
    const url = window.location.href;
    const isRewardsPage = /\/Card\/.*\/rewards/i.test(url);
    const isSummaryPage = /\/accountSummary/i.test(url);

    extLogger.info("scrape.start", { provider: "capital_one", url, isRewardsPage, isSummaryPage });

    const result = await waitForCapitalOneBalance(document);

    if (result.success) {
      if (isRewardsPage) {
        // On a per-card rewards page, extract this card's info
        result.cardInfo = extractCardInfo(document);
      }

      if (isSummaryPage) {
        // On account summary, discover all credit cards from the tile layout.
        // Card tiles may render after the loyalty tile, so wait for them.
        result.discoveredCards = await waitForCardsFromSummary(document);
        extLogger.info("scrape.discovered_cards", {
          provider: "capital_one",
          count: result.discoveredCards.length,
          cards: result.discoveredCards,
        });
      }

      extLogger.info("scrape.success", {
        provider: "capital_one",
        balance: result.balance,
        cardInfo: result.cardInfo,
        matchedSelector: result.matchedSelector,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "capital_one",
        error: result.error,
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

/** Extract card info from a per-card rewards page header */
function extractCardInfo(doc: Document): { cardName: string; lastFour?: string } | undefined {
  const logoImg = doc.querySelector(
    ".c1-ease-account-details-global-nav-bar-container img[alt]"
  ) as HTMLImageElement | null;
  const lastFourEl = doc.querySelector('[data-e2e="lastFourDigits"]');

  const cardName = logoImg?.alt?.trim();
  if (!cardName) return undefined;

  const lastFourText = lastFourEl?.textContent?.trim();
  const lastFour = lastFourText?.replace(/[^0-9]/g, "") || undefined;

  return { cardName, lastFour };
}

/** Extract all credit cards currently in the DOM.
 *  Credit card tiles have an img with alt text for the card name.
 *  Bank account tiles (e.g. "360 Checking") use a span instead — we skip those. */
function extractCardsNow(doc: Document): Array<{ cardName: string; lastFour?: string }> {
  const cards: Array<{ cardName: string; lastFour?: string }> = [];
  const tiles = doc.querySelectorAll("c1-ease-account-tile");

  for (const tile of tiles) {
    // Credit cards have an img.primary-detail__identity__img with the card name in alt
    const logoImg = tile.querySelector(
      "img.primary-detail__identity__img"
    ) as HTMLImageElement | null;
    if (!logoImg?.alt?.trim()) continue; // skip bank accounts — they don't have this img

    const cardName = logoImg.alt.trim();

    // Extract last four from .primary-detail__identity__account-number
    const acctNumEl = tile.querySelector(".primary-detail__identity__account-number");
    const acctNumText = acctNumEl?.textContent?.trim() ?? "";
    const lastFour = acctNumText.replace(/[^0-9]/g, "") || undefined;

    cards.push({ cardName, lastFour });
  }

  return cards;
}

/** Wait for card tiles to render in the DOM, then extract them.
 *  Angular renders the account tiles asynchronously — they may not be
 *  present yet when the loyalty-tile balance is already scraped. */
function waitForCardsFromSummary(
  doc: Document,
  timeoutMs = 10_000
): Promise<Array<{ cardName: string; lastFour?: string }>> {
  // Try immediately first
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
