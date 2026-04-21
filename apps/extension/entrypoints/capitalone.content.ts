import { waitForCapitalOneBalance } from "../lib/scraper-capitalone";
import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * Capital One content script.
 *
 * Unlike Chase, Capital One's miles are *genuinely per-card* — each card
 * has its own balance which sums into the pool total on the Account Summary
 * page. So on the summary page we emit:
 *   • 1 `total` record for the pool (no linkedCard)
 *   • 1 `total` record per card with `linkedCard` set
 *
 * On a per-card rewards page (`/Card/.../rewards`) we only see one card's
 * balance and emit a single per-card record.
 */
export default defineContentScript({
  matches: [
    "https://myaccounts.capitalone.com/*",
    "https://verified.capitalone.com/*",
  ],
  async main() {
    const url = window.location.href;
    const isRewardsPage = /\/Card\/.*\/rewards/i.test(url);
    const isSummaryPage = /\/accountSummary/i.test(url);
    extLogger.info("scrape.start", {
      provider: "capitalone",
      url,
      isRewardsPage,
      isSummaryPage,
    });
    syncWidget.start({ label: "Capital One" });

    const extraction = await waitForCapitalOneBalance(document);

    if (!extraction.success || extraction.balance == null) {
      extLogger.warn("scrape.failed", {
        provider: "capitalone",
        error: extraction.error,
      });
      sendResult({
        success: false,
        error: extraction.error,
        durationMs: extraction.durationMs,
        selectorsAttempted: extraction.selectorsAttempted,
        matchedSelector: extraction.matchedSelector,
      });
      return;
    }

    let balances: BalanceRecord[] = [];
    let cards: DiscoveredCard[] = [];

    if (isRewardsPage) {
      const cardInfo = extractCardInfoFromRewardsPage(document);
      balances = [
        {
          programKey: "capitalone_miles",
          balance: extraction.balance,
          balanceType: "total",
          linkedCard: cardInfo
            ? { cardName: cardInfo.cardName, lastFour: cardInfo.lastFour }
            : undefined,
        },
      ];
      if (cardInfo) {
        cards = [
          {
            cardName: cardInfo.cardName,
            lastFour: cardInfo.lastFour,
            issuer: "capitalone",
            programKey: "capitalone_miles",
            imageUrl: cardInfo.imageUrl,
          },
        ];
      }
    } else if (isSummaryPage) {
      // Pool total from loyalty tile
      balances = [
        {
          programKey: "capitalone_miles",
          balance: extraction.balance,
          balanceType: "total",
          // No linkedCard — this is the pool sum.
        },
      ];

      // Discover all cards on the summary
      const discovered = await waitForCardsFromSummary(document);
      cards = discovered.map((c) => ({
        cardName: c.cardName,
        lastFour: c.lastFour,
        issuer: "capitalone",
        programKey: "capitalone_miles",
        imageUrl: c.imageUrl,
      }));

      // Per-card miles from the card-picker dialog
      const perCard = await extractPerCardMilesViaDialog(document);
      for (const pc of perCard) {
        balances.push({
          programKey: "capitalone_miles",
          balance: pc.balance,
          balanceType: "total",
          linkedCard: { cardName: pc.cardName, lastFour: pc.lastFour },
        });
      }

      extLogger.info("scrape.per_card", {
        provider: "capitalone",
        count: perCard.length,
      });
    } else {
      // Generic Capital One page — we have a balance but no context.
      balances = [
        {
          programKey: "capitalone_miles",
          balance: extraction.balance,
          balanceType: "total",
        },
      ];
    }

    const ident = resolveIdentifier(document);

    const result: ScrapeResult = {
      success: true,
      externalAccountId: ident.externalAccountId,
      ownerLabel: ident.ownerLabel,
      identifierSource: ident.source,
      balances,
      cards,
      durationMs: extraction.durationMs,
      selectorsAttempted: extraction.selectorsAttempted,
      matchedSelector: extraction.matchedSelector,
    };

    extLogger.info("scrape.success", {
      provider: "capitalone",
      balanceCount: balances.length,
      cardCount: cards.length,
      externalAccountId: ident.externalAccountId,
      identifierSource: ident.source,
    });

    sendResult(result);
  },
});

function sendResult(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Miles synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "capitalone",
    payload,
  });
}

/* ── Per-card rewards-page extraction ────────────────────── */

function extractCardInfoFromRewardsPage(
  doc: Document
): { cardName: string; lastFour?: string; imageUrl?: string } | undefined {
  const logoImg = doc.querySelector(
    ".c1-ease-account-details-global-nav-bar-container img[alt]"
  ) as HTMLImageElement | null;
  const lastFourEl = doc.querySelector('[data-e2e="lastFourDigits"]');

  const cardName = logoImg?.alt?.trim();
  if (!cardName) return undefined;

  const lastFourText = lastFourEl?.textContent?.trim();
  const lastFour = lastFourText?.replace(/[^0-9]/g, "") || undefined;
  const imageUrl = logoImg?.src || undefined;

  return { cardName, lastFour, imageUrl };
}

/* ── Account Summary card discovery ──────────────────────── */

interface DiscoveredSummaryCard {
  cardName: string;
  lastFour?: string;
  imageUrl?: string;
}

function extractCardsNow(doc: Document): DiscoveredSummaryCard[] {
  const cards: DiscoveredSummaryCard[] = [];
  const tiles = doc.querySelectorAll("c1-ease-account-tile");
  for (const tile of tiles) {
    const logoImg = tile.querySelector(
      "img.primary-detail__identity__img"
    ) as HTMLImageElement | null;
    if (!logoImg?.alt?.trim()) continue;
    const cardName = logoImg.alt.trim();
    const acctNumEl = tile.querySelector(
      ".primary-detail__identity__account-number"
    );
    const acctNumText = acctNumEl?.textContent?.trim() ?? "";
    const lastFour = acctNumText.replace(/[^0-9]/g, "") || undefined;
    // The tile's <img> IS the card art — grab its resolved URL.
    const imageUrl = logoImg.src || undefined;
    cards.push({ cardName, lastFour, imageUrl });
  }
  return cards;
}

function waitForCardsFromSummary(
  doc: Document,
  timeoutMs = 10_000
): Promise<DiscoveredSummaryCard[]> {
  const immediate = extractCardsNow(doc);
  if (immediate.length > 0) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
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

/* ── Per-card miles dialog ──────────────────────────────── */

async function extractPerCardMilesViaDialog(
  doc: Document,
  timeoutMs = 8_000
): Promise<Array<{ cardName: string; lastFour?: string; balance: number }>> {
  const loyaltyTile = doc.querySelector("#loyalty-tile");
  if (!loyaltyTile) return [];

  const viewRewardsBtn = loyaltyTile.querySelector(
    "button.action-button"
  ) as HTMLButtonElement | null;
  if (!viewRewardsBtn) return [];

  viewRewardsBtn.click();

  const dialog = await waitForElement(
    doc,
    "c1-ease-card-radio-picker-dialog",
    timeoutMs
  );
  if (!dialog) return [];

  await new Promise((r) => setTimeout(r, 500));

  const results: Array<{ cardName: string; lastFour?: string; balance: number }> = [];
  const radioButtons = dialog.querySelectorAll("gng-radio-button");

  for (const radio of radioButtons) {
    const nameEl = radio.querySelector(
      ".c1-ease-card-radio-picker__display-name"
    );
    if (!nameEl) continue;
    const rawName = nameEl.textContent?.trim() ?? "";
    const nameMatch = rawName.match(/^(.+?)\s+\.{3}(\d{4})$/);
    const cardName = nameMatch ? nameMatch[1].trim() : rawName;
    const lastFour = nameMatch ? nameMatch[2] : undefined;

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
  if (closeBtn) closeBtn.click();

  return results;
}

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
