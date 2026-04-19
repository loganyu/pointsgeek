import { waitForChaseBalance } from "../lib/scraper-chase";
import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * Chase content script.
 *
 * Two working routes, same data:
 *
 *   /account-selector → an explicit UL of every UR-earning card
 *                       (one-time landing; after a user picks, they get
 *                        redirected to /home and stay there)
 *
 *   /home             → the regular UR portal. The same per-card info
 *                       lives inside the `<card-selector>` side panel,
 *                       often already rendered in the DOM slot. When it
 *                       isn't, we click the selector button to populate
 *                       it and close the panel back up when done.
 *
 * Fallback: if neither route surfaces per-card data, we read the
 * `ur-nav-header[data-displayed-balance]` for a total-only snapshot.
 *
 * Chase UR is genuinely per-card — points stay on the card that earned
 * them until the user explicitly moves them (e.g. Freedom → Reserve for
 * transfer access). The account total is the sum of per-card balances.
 */
export default defineContentScript({
  matches: ["https://ultimaterewardspoints.chase.com/*"],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "chase", url });

    if (url.includes("/account-selector")) {
      await scrapeAccountSelector();
      return;
    }
    await scrapeViaSidePanel();
  },
});

/* ── Shared helpers ─────────────────────────────────────── */

interface ChaseCard {
  cardName: string;
  lastFour?: string;
  balance: number;
  imageUrl?: string;
}

/** Walks open shadow roots too — most Chase MDS components host in shadow. */
function deepQuerySelectorAll(
  root: Document | Element | ShadowRoot,
  selector: string
): Element[] {
  const results: Element[] = Array.from(root.querySelectorAll(selector));
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) {
      results.push(...deepQuerySelectorAll(el.shadowRoot, selector));
    }
  }
  return results;
}

function deepQuerySelector(
  root: Document | Element | ShadowRoot,
  selector: string
): Element | null {
  const found = root.querySelector(selector);
  if (found) return found;
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) {
      const inside = deepQuerySelector(el.shadowRoot, selector);
      if (inside) return inside;
    }
  }
  return null;
}

/** Poll every `intervalMs` until `find()` returns a non-empty result or we time out. */
function pollForElements(
  find: () => Element[],
  timeoutMs: number,
  intervalMs = 300
): Promise<Element[]> {
  const immediate = find();
  if (immediate.length > 0) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      const hits = find();
      if (hits.length > 0) {
        clearInterval(timer);
        resolve(hits);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(hits);
      }
    }, intervalMs);
  });
}

function send(payload: ScrapeResult) {
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "chase",
    payload,
  });
}

function buildSuccess(
  perCards: ChaseCard[],
  doc: Document,
  start: number,
  matchedSelector: string
): ScrapeResult {
  // The program total is the SUM of per-card balances. Chase's nav-header
  // number can drift a bit from this sum, so we trust the per-card values.
  const total = perCards.reduce((sum, c) => sum + c.balance, 0);

  const balances: BalanceRecord[] = [
    { programKey: "chase_ur", balance: total, balanceType: "total" },
    ...perCards.map((c) => ({
      programKey: "chase_ur" as const,
      balance: c.balance,
      balanceType: "total" as const,
      linkedCard: { cardName: c.cardName, lastFour: c.lastFour },
    })),
  ];

  const cards: DiscoveredCard[] = perCards.map((c) => ({
    cardName: c.cardName,
    lastFour: c.lastFour,
    issuer: "chase",
    programKey: "chase_ur",
    imageUrl: c.imageUrl,
  }));

  const ident = resolveIdentifier(doc);

  return {
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances,
    cards,
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: [matchedSelector],
    matchedSelector,
  };
}

/* ── /account-selector flow ─────────────────────────────── */

async function scrapeAccountSelector() {
  const start = performance.now();
  const selector = "#mds-list__list-items li.list-item--navigational";
  const items = await pollForElements(
    () => deepQuerySelectorAll(document, selector),
    15_000
  );

  if (items.length === 0) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "account-selector",
      reason: "no_items",
    });
    send({
      success: false,
      error: {
        code: "ELEMENT_NOT_FOUND",
        message: "No account-selector items",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [selector],
    });
    return;
  }

  const perCards: ChaseCard[] = [];
  for (const item of items) {
    const parsed = parseAccountSelectorItem(item);
    if (parsed) perCards.push(parsed);
  }

  if (perCards.length === 0) {
    send({
      success: false,
      error: {
        code: "PARSE_FAILED",
        message: "Items present but none parsed",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [selector],
    });
    return;
  }

  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "account-selector",
    perCardCount: perCards.length,
    total: perCards.reduce((s, c) => s + c.balance, 0),
  });
  send(buildSuccess(perCards, document, start, selector));
}

/**
 * Parse a `<li class="list-item--navigational">` on `/account-selector`.
 * The `.accessible-text` span holds a prebuilt string we can regex:
 *   "Chase Freedom® card, CREDIT CARD (...1907), Available Points: 0 pts"
 */
function parseAccountSelectorItem(li: Element): ChaseCard | null {
  const text = li.querySelector(".accessible-text")?.textContent?.trim();
  if (!text) return null;

  const nameMatch = text.match(/^(.+?)(?:\s+card)?,\s*CREDIT CARD/i);
  const lastFourMatch = text.match(/\(\s*\.{3}\s*(\d{4})\s*\)/);
  const balanceMatch = text.match(/Available Points:\s*([\d,]+)\s*pts/i);

  if (!nameMatch || !balanceMatch) return null;

  const cardName = nameMatch[1].replace(/[®™©]/g, "").trim();
  const lastFour = lastFourMatch ? lastFourMatch[1] : undefined;
  const balance = parseInt(balanceMatch[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(balance) || balance < 0) return null;

  const img = li.querySelector<HTMLImageElement>("img.list-item__image");
  const imageUrl = img?.src || undefined;

  return { cardName, lastFour, balance, imageUrl };
}

/* ── /home side-panel flow ──────────────────────────────── */

async function scrapeViaSidePanel() {
  const start = performance.now();
  const selector = "card-selector mds-list-item[label]";

  // First pass: Angular often renders the panel's `mds-list-item` nodes
  // into the DOM even when `<mds-slide-in-panel open="false">` — they're
  // just visually hidden. Short wait in case they're still hydrating.
  let items = await pollForElements(
    () => deepQuerySelectorAll(document, selector),
    2_500
  );

  // If nothing showed up, open the side panel by clicking the selector.
  // Track that we opened it so we can close it when done (courtesy to the user).
  let openedByUs = false;
  if (items.length === 0) {
    extLogger.info("scrape.clicking_card_selector", { provider: "chase" });
    openedByUs = clickCardSelector(document);
    if (openedByUs) {
      items = await pollForElements(
        () => deepQuerySelectorAll(document, selector),
        10_000
      );
    }
  }

  if (items.length === 0) {
    await scrapeHomeHeader(start);
    return;
  }

  const perCards: ChaseCard[] = [];
  for (const item of items) {
    const parsed = parseMdsListItem(item);
    if (parsed) perCards.push(parsed);
  }

  if (perCards.length === 0) {
    if (openedByUs) closeSidePanel(document);
    await scrapeHomeHeader(start);
    return;
  }

  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "home-side-panel",
    perCardCount: perCards.length,
    total: perCards.reduce((s, c) => s + c.balance, 0),
    openedByUs,
  });
  send(buildSuccess(perCards, document, start, selector));

  if (openedByUs) closeSidePanel(document);
}

/**
 * Parse a `<mds-list-item>` from the card-selector side panel. Chase
 * stores every field we need as plain HTML attributes on the custom
 * element — no nested text to regex:
 *   label="CREDIT CARD (...8575)"
 *   description="331,283 pts"
 *   image-url="https://ur.static.chasecdn.com/.../Sapphire-Reserve-H-Large.png"
 *   image-alt-text="Chase Sapphire Reserve<sup>®</sup>"
 */
function parseMdsListItem(item: Element): ChaseCard | null {
  const label = item.getAttribute("label") ?? "";
  const description = item.getAttribute("description") ?? "";
  const imageUrl = item.getAttribute("image-url") || undefined;
  const rawAlt = item.getAttribute("image-alt-text") ?? "";

  const cardName = rawAlt
    .replace(/<[^>]*>/g, "")
    .replace(/[®™©]/g, "")
    .trim();
  if (!cardName) return null;

  const lastFourMatch = label.match(/\(\s*\.{3}\s*(\d{4})\s*\)/);
  const lastFour = lastFourMatch?.[1];

  const balanceMatch = description.match(/([\d,]+)\s*pts/i);
  if (!balanceMatch) return null;
  const balance = parseInt(balanceMatch[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(balance) || balance < 0) return null;

  return { cardName, lastFour, balance, imageUrl };
}

function clickCardSelector(doc: Document): boolean {
  const btn = deepQuerySelector(
    doc,
    "card-selector button.card-selector-button"
  ) as HTMLButtonElement | null;
  if (!btn) return false;
  btn.click();
  return true;
}

function closeSidePanel(doc: Document) {
  // Preferred: the panel's built-in close icon button
  const btn = deepQuerySelector(
    doc,
    "button.mds-slide-in-panel__icon-button--close"
  ) as HTMLButtonElement | null;
  if (btn) {
    btn.click();
    return;
  }
  // Fallback: flip the `open` attribute so the Angular binding reacts
  const panel = doc.querySelector("mds-slide-in-panel");
  panel?.setAttribute("open", "false");
}

/* ── Header-only fallback (last resort) ─────────────────── */

async function scrapeHomeHeader(start: number) {
  const extraction = await waitForChaseBalance(document);

  if (!extraction.success || extraction.balance == null) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "header",
      error: extraction.error,
    });
    send({
      success: false,
      error: extraction.error,
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: extraction.selectorsAttempted,
      matchedSelector: extraction.matchedSelector,
    });
    return;
  }

  const ident = resolveIdentifier(document);

  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "header",
    balance: extraction.balance,
  });

  send({
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances: [
      {
        programKey: "chase_ur",
        balance: extraction.balance,
        balanceType: "total",
      },
    ],
    cards: [],
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: extraction.selectorsAttempted,
    matchedSelector: extraction.matchedSelector,
  });
}
