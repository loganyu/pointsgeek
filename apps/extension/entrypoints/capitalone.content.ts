import { waitForCapitalOneBalance } from "../lib/scraper-capitalone";
import { extLogger } from "../lib/logger";
import type { PerCardBalance } from "@points-geek/shared";

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

        // Try to get per-card miles by opening the rewards card-picker dialog
        const perCard = await extractPerCardMilesViaDialog(document);
        if (perCard.length > 0) {
          result.perCardBalances = perCard;
          extLogger.info("scrape.per_card_balances", {
            provider: "capital_one",
            count: perCard.length,
            cards: perCard,
          });
        }
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

/**
 * Extract per-card miles by clicking "View rewards" to open the card-picker dialog.
 *
 * The dialog (c1-ease-card-radio-picker-dialog) shows each card with its
 * individual miles balance — e.g. "VentureOne ...3001" / "903 Miles".
 *
 * Flow: click button → wait for dialog → scrape → close dialog.
 * If the user only has one card, the dialog won't appear (direct navigation).
 */
async function extractPerCardMilesViaDialog(
  doc: Document,
  timeoutMs = 8_000
): Promise<PerCardBalance[]> {
  // Find the "View rewards" button inside the loyalty tile
  const loyaltyTile = doc.querySelector("#loyalty-tile");
  if (!loyaltyTile) return [];

  const viewRewardsBtn = loyaltyTile.querySelector(
    "button.action-button"
  ) as HTMLButtonElement | null;
  if (!viewRewardsBtn) return [];

  extLogger.info("scrape.opening_rewards_dialog", { provider: "capital_one" });

  // Click to trigger the Angular dialog
  viewRewardsBtn.click();

  // Wait for the card-picker dialog to render
  const dialog = await waitForElement(
    doc,
    "c1-ease-card-radio-picker-dialog",
    timeoutMs
  );

  if (!dialog) {
    extLogger.warn("scrape.rewards_dialog_not_found", { provider: "capital_one" });
    return [];
  }

  // Small delay for Angular to finish rendering dialog content
  await new Promise((r) => setTimeout(r, 500));

  // Extract per-card data from radio buttons
  const results: PerCardBalance[] = [];
  const radioButtons = dialog.querySelectorAll("gng-radio-button");

  for (const radio of radioButtons) {
    const nameEl = radio.querySelector(".c1-ease-card-radio-picker__display-name");
    const displayWrapper = radio.querySelector(".c1-ease-card-radio-picker__display-wrapper");
    if (!nameEl || !displayWrapper) continue;

    const rawName = nameEl.textContent?.trim() ?? "";
    // Name format: "VentureOne ...3001" or "Venture X ...2397"
    const nameMatch = rawName.match(/^(.+?)\s+\.{3}(\d{4})$/);
    const cardName = nameMatch ? nameMatch[1].trim() : rawName;
    const lastFour = nameMatch ? nameMatch[2] : undefined;

    // Miles text is in a sibling div next to the display-name
    // e.g. "903 Miles" or "67,538 Miles"
    const milesEl = nameEl.nextElementSibling;
    const milesText = milesEl?.textContent?.trim() ?? "";
    const milesMatch = milesText.match(/([\d,]+)\s*Miles/i);
    if (!milesMatch) continue;

    const balance = parseInt(milesMatch[1].replace(/,/g, ""), 10);
    if (isNaN(balance)) continue;

    results.push({ cardName, lastFour, balance });
  }

  // Close the dialog
  const closeBtn = dialog.querySelector(
    "button.c1-ease-dialog-close-button"
  ) as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.click();
  }

  return results;
}

/** Wait for an element to appear in the DOM using MutationObserver */
function waitForElement(
  doc: Document,
  selector: string,
  timeoutMs: number
): Promise<Element | null> {
  const existing = doc.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = doc.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
