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
 * URL routing:
 *
 *   ultimaterewardspoints.chase.com/account-selector
 *     → rich multi-card scrape (primary target, linked from "Get Balance").
 *
 *   ultimaterewardspoints.chase.com/* (any other path, including
 *   /home and /home?AI=...)
 *     → combined scrape: header-stripe (current card's available +
 *       pending + image) PLUS side-panel (click-to-open lists every
 *       UR card's total). Both sources are merged into one payload.
 *
 *   chaseloyalty.chase.com/*
 *     → individual card only (header-stripe). chaseloyalty doesn't
 *       have the UR portal's side panel, so we read whatever single
 *       card is visible and submit just that.
 *
 * Chase UR is genuinely per-card — points stay on the card that earned
 * them until the user explicitly moves them (Freedom → Reserve for
 * transfer access). The account total is the sum of per-card available
 * balances (computed server-side after each per-card write).
 */
export default defineContentScript({
  matches: [
    "https://ultimaterewardspoints.chase.com/*",
    "https://chaseloyalty.chase.com/*",
  ],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "chase", url });

    const parsed = new URL(url);
    const host = parsed.hostname;

    if (parsed.pathname.includes("/account-selector")) {
      await scrapeAccountSelector();
      return;
    }

    if (host === "ultimaterewardspoints.chase.com") {
      await scrapeUrCombined();
      return;
    }

    if (host === "chaseloyalty.chase.com") {
      await scrapeIndividualCardOnly();
      return;
    }
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

/* ── Pure extraction helpers (return data, no send()) ───── */

interface UrIndividualCard {
  cardName: string;
  lastFour?: string;
  available: number;
  pending: number;
  imageUrl?: string;
}

/**
 * Parse the `<header-stripe>` block that every UR card-detail page
 * (and `chaseloyalty.chase.com/home?AI=...`) renders at the top.
 * Structure:
 *
 *   <header-stripe>
 *     <div class="card">
 *       <div class="card-img"><img alt="Chase Freedom® card" src="..."/></div>
 *       <div class="card-details">
 *         <div role="heading">Chase Freedom® (...1907)</div>
 *         <div class="points-balance">
 *           <div class="points">                     <!-- available -->
 *             <div class="mds-title-large"><span>0</span></div>
 *             <div class="points-available">Available points</div>
 *           </div>
 *           <div class="points">                     <!-- pending  -->
 *             <div class="mds-title-large"><span>0</span></div>
 *             <div class="pending">Pending points</div>
 *           </div>
 *         </div>
 *       </div>
 *     </div>
 *   </header-stripe>
 *
 * The heading carries the card name AND last-four; the img alt is
 * "<name> card" (without the last-4), used as a fallback.
 */
async function extractHeaderStripeCard(
  timeoutMs: number
): Promise<UrIndividualCard | null> {
  const containers = await pollForElements(
    () => Array.from(document.querySelectorAll("header-stripe .card")),
    timeoutMs
  );
  if (containers.length === 0) return null;

  const card = containers[0];
  const img = card.querySelector<HTMLImageElement>(".card-img img");
  const imageUrl = img?.src || undefined;

  const heading = card
    .querySelector(".card-details [role='heading']")
    ?.textContent?.trim();
  const headingMatch = heading?.match(
    /^(.+?)\s*\(\s*\.{3}\s*(\d+)\s*\)\s*$/
  );
  const lastFour = headingMatch?.[2];
  const cardName =
    (headingMatch ? cleanName(headingMatch[1]) : cleanName(heading ?? "")) ||
    cleanName((img?.alt ?? "").replace(/\s*card\s*$/i, ""));

  if (!cardName) return null;

  // The two `.points` blocks are ordered (available, pending). We don't
  // rely on order though — we find each by its inner label class.
  let available: number | null = null;
  let pending: number | null = null;
  for (const block of card.querySelectorAll(".points-balance .points")) {
    const raw =
      block.querySelector(".mds-title-large span")?.textContent?.trim() ?? "";
    const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(num) || num < 0) continue;
    if (block.querySelector(".points-available")) available = num;
    else if (block.querySelector(".pending")) pending = num;
  }

  if (available === null) return null;

  return {
    cardName,
    lastFour,
    available,
    pending: pending ?? 0,
    imageUrl,
  };
}

/**
 * Click the card-selector to open the side panel (if not already open),
 * wait for `mds-list-item`s to render in light DOM (under the panel's
 * slot), parse every card, then close the panel back up.
 *
 * Returns null if the panel never populated, so the caller can decide
 * whether to fall back to a header-only scrape.
 */
async function extractSidePanelCards(): Promise<ChaseCard[] | null> {
  const selector = "card-selector mds-list-item[label]";

  // Items are sometimes already slotted in the DOM even when the panel
  // is visually closed. Try a short non-clicking read first.
  let items = await pollForElements(
    () => deepQuerySelectorAll(document, selector),
    2_500
  );

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
    if (openedByUs) closeSidePanel(document);
    return null;
  }

  const perCards: ChaseCard[] = [];
  for (const item of items) {
    const parsed = parseMdsListItem(item);
    if (parsed) perCards.push(parsed);
  }

  if (openedByUs) closeSidePanel(document);
  return perCards.length > 0 ? perCards : null;
}

function cleanName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[®™©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Orchestrators ───────────────────────────────────────── */

/**
 * ultimaterewardspoints.chase.com/home (with or without `?AI=`).
 *
 * Runs header-stripe and side-panel extractions concurrently, merges
 * the results (side panel gives all cards' totals; header-stripe adds
 * pending for the focused card), and submits one payload.
 */
async function scrapeUrCombined() {
  const start = performance.now();
  const [individual, sidePanel] = await Promise.all([
    extractHeaderStripeCard(10_000),
    extractSidePanelCards(),
  ]);

  extLogger.info("scrape.ur_combined.extracted", {
    provider: "chase",
    hasIndividual: !!individual,
    sidePanelCount: sidePanel?.length ?? 0,
    pending: individual?.pending,
  });

  const balances: BalanceRecord[] = [];
  const cards: DiscoveredCard[] = [];
  const seen = new Set<string>();
  const keyFor = (name: string, lf?: string) =>
    `${name.toLowerCase()}|${lf ?? ""}`;

  if (sidePanel) {
    for (const c of sidePanel) {
      seen.add(keyFor(c.cardName, c.lastFour));
      balances.push({
        programKey: "chase_ur",
        balance: c.balance,
        balanceType: "total",
        linkedCard: { cardName: c.cardName, lastFour: c.lastFour },
      });
      cards.push({
        cardName: c.cardName,
        lastFour: c.lastFour,
        issuer: "chase",
        programKey: "chase_ur",
        imageUrl: c.imageUrl,
      });
    }
  }

  if (individual) {
    const key = keyFor(individual.cardName, individual.lastFour);
    if (!seen.has(key)) {
      balances.push({
        programKey: "chase_ur",
        balance: individual.available,
        balanceType: "total",
        linkedCard: {
          cardName: individual.cardName,
          lastFour: individual.lastFour,
        },
      });
      cards.push({
        cardName: individual.cardName,
        lastFour: individual.lastFour,
        issuer: "chase",
        programKey: "chase_ur",
        imageUrl: individual.imageUrl,
      });
    }
    // Pending is new info regardless of whether the side panel already
    // covered this card's total. Always emit it.
    balances.push({
      programKey: "chase_ur",
      balance: individual.pending,
      balanceType: "pending",
      linkedCard: {
        cardName: individual.cardName,
        lastFour: individual.lastFour,
      },
    });
  }

  if (balances.length === 0) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "ur-combined",
      reason: "no_data",
    });
    send({
      success: false,
      error: {
        code: "ELEMENT_NOT_FOUND",
        message: "Neither header-stripe nor side-panel produced data",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [
        "header-stripe .card",
        "card-selector mds-list-item[label]",
      ],
    });
    return;
  }

  const ident = resolveIdentifier(document);
  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "ur-combined",
    balanceCount: balances.length,
    cardCount: cards.length,
    externalAccountId: ident.externalAccountId,
  });
  send({
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances,
    cards,
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: [
      "header-stripe .card",
      "card-selector mds-list-item[label]",
    ],
    matchedSelector: individual
      ? "header-stripe .card"
      : "card-selector mds-list-item[label]",
  });
}

/**
 * chaseloyalty.chase.com/* — no side panel here, so we read whatever
 * single card the page renders in `<header-stripe>` and submit just
 * that (one total + one pending record for the focused card).
 */
async function scrapeIndividualCardOnly() {
  const start = performance.now();
  const individual = await extractHeaderStripeCard(10_000);

  if (!individual) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "individual-card",
      reason: "no_card_header",
    });
    send({
      success: false,
      error: {
        code: "ELEMENT_NOT_FOUND",
        message: "No header-stripe .card element",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: ["header-stripe .card"],
    });
    return;
  }

  const linkedCard = {
    cardName: individual.cardName,
    lastFour: individual.lastFour,
  };
  const balances: BalanceRecord[] = [
    {
      programKey: "chase_ur",
      balance: individual.available,
      balanceType: "total",
      linkedCard,
    },
    {
      programKey: "chase_ur",
      balance: individual.pending,
      balanceType: "pending",
      linkedCard,
    },
  ];
  const cards: DiscoveredCard[] = [
    {
      cardName: individual.cardName,
      lastFour: individual.lastFour,
      issuer: "chase",
      programKey: "chase_ur",
      imageUrl: individual.imageUrl,
    },
  ];

  const ident = resolveIdentifier(document);
  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "individual-card",
    cardName: individual.cardName,
    lastFour: individual.lastFour,
    available: individual.available,
    pending: individual.pending,
  });
  send({
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances,
    cards,
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: ["header-stripe .card"],
    matchedSelector: "header-stripe .card",
  });
}

/**
 * Parse one `<mds-list-item>` from inside the card-selector side panel.
 * Chase packs all the fields into plain attributes — no nested regex:
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

  const cardName = cleanName(rawAlt);
  if (!cardName) return null;

  const lastFourMatch = label.match(/\(\s*\.{3}\s*(\d+)\s*\)/);
  const lastFour = lastFourMatch?.[1];

  const balanceMatch = description.match(/([\d,]+)\s*pts/i);
  if (!balanceMatch) return null;
  const balance = parseInt(balanceMatch[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(balance) || balance < 0) return null;

  return { cardName, lastFour, balance, imageUrl };
}

function clickCardSelector(doc: Document): boolean {
  const btn = doc.querySelector<HTMLButtonElement>(
    "card-selector button.card-selector-button"
  );
  if (!btn) return false;
  btn.click();
  return true;
}

function closeSidePanel(doc: Document) {
  // Prefer the panel's built-in close button (inside shadow DOM)
  const btn = deepQuerySelector(
    doc,
    "button.mds-slide-in-panel__icon-button--close"
  ) as HTMLButtonElement | null;
  if (btn) {
    btn.click();
    return;
  }
  // Fallback: flip the attribute so Angular reacts
  doc.querySelector("mds-slide-in-panel")?.setAttribute("open", "false");
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

/* ── Header-only scrape (last-resort for /home when panel missing) ─ */

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
