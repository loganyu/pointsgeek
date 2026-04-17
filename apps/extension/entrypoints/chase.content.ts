import { waitForChaseBalance } from "../lib/scraper-chase";
import { extLogger } from "../lib/logger";
import type { PerCardBalance } from "@point-portfolio/shared";

export default defineContentScript({
  matches: [
    "https://ultimaterewardspoints.chase.com/*",
    "https://secure.chase.com/*",
  ],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "chase_ur", url });

    const result = await waitForChaseBalance(document);

    if (result.success) {
      // Don't set result.cardInfo for Chase — the displayed balance is the
      // pool total across all UR cards, not a per-card balance. Setting
      // cardInfo would cause the background worker to submit the aggregate
      // balance with a cardId, making the dashboard unable to find the total
      // (it queries for cardId IS NULL).

      // Try to get per-card balances from the card picker
      const perCard = await extractPerCardBalances(document);
      if (perCard.length > 0) {
        result.perCardBalances = perCard;
        result.discoveredCards = perCard.map(({ cardName, lastFour }) => ({
          cardName,
          lastFour,
        }));
        extLogger.info("scrape.per_card_balances", {
          provider: "chase_ur",
          count: perCard.length,
          cards: perCard,
        });
      }

      extLogger.info("scrape.success", {
        provider: "chase_ur",
        balance: result.balance,
        matchedSelector: result.matchedSelector,
      });
    } else {
      extLogger.warn("scrape.failed", {
        provider: "chase_ur",
        error: result.error,
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

/* ── Card picker extraction ────────────────────────────── */

/**
 * Extract per-card balances from mds-list-item attributes.
 *
 * Each mds-list-item in the quick-select list has:
 *   - image-alt-text: "Chase Sapphire Reserve<sup>®</sup>"  → card name
 *   - label:          "CREDIT CARD (...8575)"                → last four
 *   - description:    "331,283 pts"                          → balance
 */
function extractCardPickerItems(
  root: Document | Element | ShadowRoot
): PerCardBalance[] {
  const results: PerCardBalance[] = [];
  const items = root.querySelectorAll(
    'mds-list[list-type="quick-select"] mds-list-item'
  );

  for (const item of items) {
    // Card name from image-alt-text, strip HTML tags like <sup>®</sup>
    const altText = item.getAttribute("image-alt-text") ?? "";
    const cardName = altText.replace(/<[^>]*>/g, "").trim();
    if (!cardName) continue;

    // Last four from label: "CREDIT CARD (...8575)"
    const label = item.getAttribute("label") ?? "";
    const lastFourMatch = label.match(/\.{3}(\d{4})/);
    const lastFour = lastFourMatch ? lastFourMatch[1] : undefined;

    // Balance from description: "331,283 pts"
    const description = item.getAttribute("description") ?? "";
    const ptsMatch = description.match(/([\d,]+)\s*pts/i);
    if (!ptsMatch) continue;

    const balance = parseInt(ptsMatch[1].replace(/,/g, ""), 10);
    if (isNaN(balance)) continue;

    results.push({ cardName, lastFour, balance });
  }

  return results;
}

/**
 * Extract per-card balances from the card picker modal.
 *
 * nav-header uses Shadow DOM, so the card-selector button is inside
 * nav-header.shadowRoot — regular querySelector can't reach it.
 * We poll for it, click to open the picker, then extract items.
 */
async function extractPerCardBalances(
  doc: Document,
  timeoutMs = 10_000
): Promise<PerCardBalance[]> {
  // Check if items already exist anywhere (regular DOM + shadow roots)
  const immediate =
    extractCardPickerItems(doc) ||
    extractCardPickerItemsDeep(doc);
  if (immediate.length > 0) return immediate;

  // nav-header uses Shadow DOM — poll for the button inside its shadowRoot
  extLogger.info("scrape.waiting_for_card_picker", { provider: "chase_ur" });

  const trigger = await pollForElement(() => {
    const navInner = doc.querySelector("nav-header");
    if (!navInner?.shadowRoot) return null;
    return navInner.shadowRoot.querySelector(
      "button.card-selector-button"
    ) as HTMLElement | null;
  }, timeoutMs);

  if (!trigger) {
    const navInner = doc.querySelector("nav-header");
    extLogger.info("scrape.no_card_picker_trigger", {
      provider: "chase_ur",
      hasShadowRoot: !!navInner?.shadowRoot,
    });
    return [];
  }

  extLogger.info("scrape.opening_card_picker", { provider: "chase_ur" });
  (trigger as HTMLButtonElement).click();

  // Wait for the quick-select list — may appear in cdk-overlay-container
  // (regular DOM) or inside a shadow root
  const list = await pollForElement(
    () => deepQuerySelector(doc, 'mds-list[list-type="quick-select"]'),
    timeoutMs
  );

  if (!list) {
    extLogger.warn("scrape.card_picker_not_found", { provider: "chase_ur" });
    return [];
  }

  // Small delay for Angular to finish rendering list items
  await new Promise((r) => setTimeout(r, 500));

  // Extract from wherever the list ended up
  let results = extractCardPickerItems(doc);
  if (results.length === 0) {
    results = extractCardPickerItemsDeep(doc);
  }

  extLogger.info("scrape.card_picker_extracted", {
    provider: "chase_ur",
    count: results.length,
    cards: results,
  });

  // Close the slide-in panel
  const closeBtn =
    deepQuerySelector(
      doc,
      "button.mds-slide-in-panel__icon-button--close"
    ) as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.click();
  }

  return results;
}

/* ── Shadow DOM utilities ──────────────────────────────── */

/** Search for an element across the regular DOM and all open shadow roots */
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

/** Extract card picker items searching through shadow roots */
function extractCardPickerItemsDeep(doc: Document): PerCardBalance[] {
  const allElements = doc.querySelectorAll("*");
  for (const el of allElements) {
    if (el.shadowRoot) {
      const items = extractCardPickerItems(el.shadowRoot);
      if (items.length > 0) return items;
    }
  }
  return [];
}

/**
 * Poll for an element at regular intervals.
 * MutationObserver can't cross shadow boundaries, so we poll instead.
 */
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
