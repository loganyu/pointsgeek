import { waitForChaseBalance } from "../lib/scraper-chase";
import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * Chase content script (Ultimate Rewards portal + secure.chase.com).
 *
 * Chase UR is a single pooled program — all UR-earning cards add to one
 * shared `chase_ur` balance. We emit:
 *   • one `total` balance record for the pool (no linkedCard)
 *   • every card we discover from the card picker, all attached to `chase_ur`
 *
 * Chase's per-card picker shows the *pool* balance next to each card (not
 * a card-specific number), so we don't emit per-card balance records — only
 * the cards themselves.
 */
export default defineContentScript({
  matches: [
    "https://ultimaterewardspoints.chase.com/*",
    "https://secure.chase.com/*",
  ],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "chase", url });

    const extraction = await waitForChaseBalance(document);

    if (!extraction.success || extraction.balance == null) {
      extLogger.warn("scrape.failed", {
        provider: "chase",
        error: extraction.error,
        selectorsAttempted: extraction.selectorsAttempted,
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

    // Discover cards from the picker (parallel UI walks + shadow DOM)
    const discovered = await extractCardsFromPicker(document);

    const cards: DiscoveredCard[] = discovered.map((c) => ({
      cardName: c.cardName,
      lastFour: c.lastFour,
      issuer: "chase",
      programKey: "chase_ur",
      imageUrl: c.imageUrl,
    }));

    const balances: BalanceRecord[] = [
      {
        programKey: "chase_ur",
        balance: extraction.balance,
        balanceType: "total",
        // No linkedCard — this is the pool total across all UR cards.
      },
    ];

    const ident = resolveIdentifier(document, discovered);

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
      provider: "chase",
      balance: extraction.balance,
      cardCount: cards.length,
      externalAccountId: ident.externalAccountId,
      identifierSource: ident.source,
    });

    sendResult(result);
  },
});

function sendResult(payload: ScrapeResult) {
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "chase",
    payload,
  });
}

/* ── Card picker extraction (same approach as before) ────── */

async function extractCardsFromPicker(
  doc: Document,
  timeoutMs = 10_000
): Promise<PickerItem[]> {
  const immediate = extractItems(doc);
  if (immediate.length > 0) return immediate;

  extLogger.info("scrape.waiting_for_card_picker", { provider: "chase" });

  const trigger = await pollForElement(() => {
    const navInner = doc.querySelector("nav-header");
    if (!navInner?.shadowRoot) return null;
    return navInner.shadowRoot.querySelector(
      "button.card-selector-button"
    ) as HTMLElement | null;
  }, timeoutMs);

  if (!trigger) {
    extLogger.info("scrape.no_card_picker_trigger", { provider: "chase" });
    return [];
  }

  (trigger as HTMLButtonElement).click();

  const list = await pollForElement(
    () => deepQuerySelector(doc, 'mds-list[list-type="quick-select"]'),
    timeoutMs
  );
  if (!list) {
    extLogger.warn("scrape.card_picker_not_found", { provider: "chase" });
    return [];
  }

  await new Promise((r) => setTimeout(r, 500));

  let results = extractItems(doc);
  if (results.length === 0) results = extractItemsDeep(doc);

  // Close the slide-in panel
  const closeBtn = deepQuerySelector(
    doc,
    "button.mds-slide-in-panel__icon-button--close"
  ) as HTMLButtonElement | null;
  if (closeBtn) closeBtn.click();

  return results;
}

interface PickerItem {
  cardName: string;
  lastFour?: string;
  imageUrl?: string;
}

function extractItems(root: Document | Element | ShadowRoot): PickerItem[] {
  const out: PickerItem[] = [];
  const items = root.querySelectorAll(
    'mds-list[list-type="quick-select"] mds-list-item'
  );
  for (const item of items) {
    const altText = item.getAttribute("image-alt-text") ?? "";
    const cardName = altText.replace(/<[^>]*>/g, "").trim();
    if (!cardName) continue;
    const label = item.getAttribute("label") ?? "";
    const lastFourMatch = label.match(/\.{3}(\d{4})/);
    const lastFour = lastFourMatch ? lastFourMatch[1] : undefined;

    // Chase's mds-list-item carries its card art as `image-src` (or
    // sometimes `image`). Fall back to a nested <img> if neither is set.
    const imageUrl =
      item.getAttribute("image-src") ??
      item.getAttribute("image") ??
      item.querySelector<HTMLImageElement>("img")?.src ??
      undefined;

    out.push({ cardName, lastFour, imageUrl });
  }
  return out;
}

function extractItemsDeep(doc: Document): PickerItem[] {
  const allElements = doc.querySelectorAll("*");
  for (const el of allElements) {
    if (el.shadowRoot) {
      const items = extractItems(el.shadowRoot);
      if (items.length > 0) return items;
    }
  }
  return [];
}

function deepQuerySelector(
  root: Document | Element | ShadowRoot,
  selector: string
): Element | null {
  const found = root.querySelector(selector);
  if (found) return found;
  const children = root.querySelectorAll("*");
  for (const child of children) {
    if (child.shadowRoot) {
      const shadowFound = deepQuerySelector(child.shadowRoot, selector);
      if (shadowFound) return shadowFound;
    }
  }
  return null;
}

function pollForElement(
  finder: () => Element | null | undefined,
  timeoutMs: number,
  intervalMs = 300
): Promise<Element | null> {
  const existing = finder();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      const el = finder();
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, intervalMs);
  });
}
