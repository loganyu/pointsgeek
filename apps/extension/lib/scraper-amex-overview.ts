import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
  ProgramKey,
} from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";
import { resolveIdentifier } from "./identifier";

/**
 * Scrape the Amex "overview" dashboard (global.americanexpress.com/overview).
 *
 * The page packs every loyalty program the user earns through Amex into
 * a handful of "rewards tiles", plus a separate product-tile grid showing
 * every card. This scraper walks both sections and returns a single
 * multi-program `ScrapeResult`:
 *
 *   • Membership Rewards total   (shared pool across MR-earning cards)
 *   • Delta SkyMiles total        (tied to an Amex Delta card)
 *   • Marriott Bonvoy YTD         (per-card YTD earnings — NOT program total)
 *   • Reward Dollars total        (stored as cents)
 *
 * It also extracts a stable-ish `externalAccountId` (greeting first name
 * when available, else a fingerprint of card last-fours) so two Amex logins
 * on one user don't overwrite each other's data.
 */

/** Map Amex's displayed program name to our canonical programKey. */
function mapProgramName(raw: string | null | undefined): ProgramKey | null {
  if (!raw) return null;
  const n = raw
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .trim();
  if (n.startsWith("membership rewards")) return "amex_mr";
  if (n.startsWith("delta skymiles") || n.startsWith("skymiles")) return "delta";
  if (n.startsWith("marriott bonvoy") || n.startsWith("marriott")) {
    return "marriott_bonvoy";
  }
  if (n.startsWith("reward dollars")) return "amex_reward_dollars";
  return null;
}

function parseInteger(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/** "$0.03" → 3 cents. "$1,234.56" → 123456. */
function parseDollarsToCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/\$?(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const dollars = parseFloat(match[1]);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

/* ── Rewards tile extraction ─────────────────────────────── */

interface TileExtraction {
  programKey: ProgramKey;
  balance: number;
  balanceType: "total" | "ytd_earned_on_card";
  linkedCards: Array<{
    cardName: string;
    lastFour?: string;
    imageUrl?: string;
  }>;
  /** Per-program stable id when Amex includes one (Delta SkyMiles #, Marriott Bonvoy #). */
  loyaltyAccountNumber: string | null;
}

/**
 * Extract the labeled fields from an Amex rewards-tile aria-label.
 *
 * Examples:
 *   "Membership Rewards® Points, Available Balance 274,698 points"
 *   "Delta SkyMiles®, Loyalty Account Number 9289872575, Available Balance 147,709 points"
 *   "Marriott Bonvoy® Points, Loyalty Account Number 264636152, Available Balance 26,571 points"
 *   "Reward Dollars, Available Balance $0.03"
 *
 * We can't split on commas because the balance itself often contains one
 * ("274,698") — so each field is matched by its own label regex.
 */
function parseAriaLabel(aria: string): {
  programName: string | null;
  balanceText: string | null;
  loyaltyAccountNumber: string | null;
} {
  if (!aria) {
    return {
      programName: null,
      balanceText: null,
      loyaltyAccountNumber: null,
    };
  }

  // Program name: everything from the start up to the first comma.
  const programMatch = aria.match(/^([^,]+)/);
  const programName = programMatch ? programMatch[1].trim() : null;

  // Balance: match the labeled number form. The balance itself is digits,
  // optional commas, optional dollar sign, optional decimal.
  const balanceMatch = aria.match(
    /Available Balance\s+(\$?[\d,]+(?:\.\d{1,2})?)/i
  );
  const balanceText = balanceMatch ? balanceMatch[1].trim() : null;

  // Loyalty account number: "Loyalty Account Number 9289872575"
  const lanMatch = aria.match(/Loyalty Account Number\s+(\d+)/i);
  const loyaltyAccountNumber = lanMatch ? lanMatch[1] : null;

  return { programName, balanceText, loyaltyAccountNumber };
}

/**
 * Parse one rewards tile. The tile container is a `loyalty-product-title-*`
 * button: its `aria-label` gives us the clean program name + balance, and
 * its descendants give us the balance-title (YTD vs total) and the linked
 * card-title spans for the card(s) this tile is tied to.
 *
 * Returns null if we can't recognize the program or read a numeric balance
 * — we'd rather skip a tile than guess wrong.
 */
function extractTile(tile: Element): TileExtraction | null {
  const aria = tile.getAttribute("aria-label") ?? "";
  const { programName, balanceText, loyaltyAccountNumber } =
    parseAriaLabel(aria);
  const programKey = mapProgramName(programName);
  if (!programKey) return null;

  // Balance-title label → balanceType. Note: aria-label says "Available
  // Balance" even for Marriott's YTD tile, so we can't trust aria for the
  // type; use the dedicated label instead.
  const balanceTitleEl = tile.querySelector(
    '[data-locator-id^="loyalty-balance-title-"]'
  );
  const balanceTitleText =
    balanceTitleEl?.textContent?.trim().toLowerCase() ?? "";
  const balanceType: "total" | "ytd_earned_on_card" = balanceTitleText.includes(
    "ytd"
  )
    ? "ytd_earned_on_card"
    : "total";

  // Balance value from aria-label (falls back to raw text if missing).
  let balance: number | null = null;
  if (programKey === "amex_reward_dollars") {
    balance = balanceText
      ? parseDollarsToCents(balanceText)
      : parseDollarsToCents(tile.textContent);
  } else {
    balance = balanceText
      ? parseInteger(balanceText)
      : parseInteger(tile.textContent);
  }
  if (balance === null) return null;

  // Linked card(s). Card titles live in the tile's surrounding container
  // (not inside the product-title button itself), so the caller is
  // responsible for scoping us correctly — but we also check inside just
  // in case Amex nests them.
  const linkedCards: TileExtraction["linkedCards"] = [];
  const cardTitleEls = tile.querySelectorAll(
    '[data-locator-id="loyalty-card-title"]'
  );
  for (const el of cardTitleEls) {
    const parsed = parseCardTitle(el.textContent);
    if (parsed) {
      linkedCards.push({ ...parsed, imageUrl: findNearbyCardImage(el) });
    }
  }

  return {
    programKey,
    balance,
    balanceType,
    linkedCards,
    loyaltyAccountNumber,
  };
}

/**
 * Parse a `loyalty-card-title` span. Amex formats these as
 *   "Delta Gold Business Card ••••81000"
 *   "Marriott Bonvoy Brilliant® American Express® Card ••••91007"
 *   "Blue Cash Everyday® ••••33002"
 *
 * We split on the bullet run and take the trailing digits (up to 5 — Amex
 * often shows 5 digits; we keep the last 4 as the `lastFour` since that's
 * what the product-tile card grid also exposes).
 */
function parseCardTitle(
  raw: string | null | undefined
): { cardName: string; lastFour?: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.+?)\s*[•·]+\s*(\d{3,})\s*$/);
  if (match) {
    const cardName = cleanCardName(match[1]);
    // Keep all trailing digits as-is — Amex exposes 5 (e.g. "81002"),
    // Chase/Cap One expose 4. The column is named `last_four` for
    // historical reasons but stores whatever the issuer shows.
    const lastFour = match[2];
    if (cardName) return { cardName, lastFour };
  }

  // No bullets found — take the whole string as the card name.
  const cardName = cleanCardName(trimmed);
  return cardName ? { cardName } : null;
}

function cleanCardName(raw: string): string {
  return raw
    .replace(/[®™©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Walk up from a `loyalty-card-title` span (or any card-bearing element)
 * looking for the nearest Amex-static card-art image. Each rewards tile
 * puts `<img src="https://www.aexp-static.com/...">` right next to the
 * card title in a tiny card-art slot.
 */
function findNearbyCardImage(cardEl: Element): string | undefined {
  let ancestor: Element | null = cardEl.parentElement;
  for (let d = 0; d < 5 && ancestor; d++) {
    const img = ancestor.querySelector<HTMLImageElement>(
      'img[src*="aexp-static"]'
    );
    if (img?.src) return img.src;
    ancestor = ancestor.parentElement;
  }
  return undefined;
}

/**
 * Walk up from a product-title element until we find the biggest ancestor
 * that still owns ONLY this tile (no other `loyalty-product-title-*` inside).
 * That ancestor is the tile's visual container — it holds the
 * balance-title, the loyalty-card-title spans, and maybe a header footer.
 */
function findTileContainer(titleEl: Element): Element {
  let best: Element = titleEl;
  let ancestor: Element | null = titleEl.parentElement;
  for (let d = 0; d < 10 && ancestor; d++) {
    const titlesHere = ancestor.querySelectorAll(
      '[data-locator-id^="loyalty-product-title-"]'
    );
    if (titlesHere.length > 1) break; // we've escaped into a multi-tile parent
    best = ancestor;
    ancestor = ancestor.parentElement;
  }
  return best;
}

function extractAllTiles(doc: Document): TileExtraction[] {
  const titleEls = doc.querySelectorAll(
    '[data-locator-id^="loyalty-product-title-"]'
  );

  const results: TileExtraction[] = [];
  for (const titleEl of titleEls) {
    try {
      // First pull program + balance + balanceType off the product-title
      // itself (its aria-label is the clean source of truth).
      const extracted = extractTile(titleEl);
      if (!extracted) continue;

      // Then collect linked cards from the surrounding container —
      // card-titles generally live as siblings / descendants around the
      // product-title, not inside it.
      if (extracted.linkedCards.length === 0) {
        const container = findTileContainer(titleEl);
        const cardTitleEls = container.querySelectorAll(
          '[data-locator-id="loyalty-card-title"]'
        );
        for (const el of cardTitleEls) {
          const parsed = parseCardTitle(el.textContent);
          if (parsed) {
            extracted.linkedCards.push({
              ...parsed,
              imageUrl: findNearbyCardImage(el),
            });
          }
        }
      }

      results.push(extracted);
    } catch {
      // Skip malformed tile
    }
  }
  return results;
}

/* ── Product tile extraction (all cards) ─────────────────── */

interface ProductCard {
  cardName: string;
  lastFour?: string;
  imageUrl?: string;
}

/**
 * Parse the card-grid at the top of the overview page.
 *
 *   [data-locator-id="credo_card_name"]      → "Platinum Card®"
 *   [data-locator-id="credo_card_acct_num"]  → " ••••81002"
 *   img.src containing "aexp-static.com" → the NUS card-art URL
 *
 * Walk up from each card-name to find the nearest container that also
 * holds the account-number element so the pairing stays stable across
 * layout tweaks. While we're up there, also pick up the nearest Amex
 * static image so each card carries its art URL into the payload.
 */
function extractProductCards(doc: Document): ProductCard[] {
  const out: ProductCard[] = [];
  const nameEls = doc.querySelectorAll(
    '[data-locator-id="credo_card_name"]'
  );

  for (const nameEl of nameEls) {
    const cardName = nameEl.textContent
      ?.trim()
      ?.replace(/[®™©]/g, "")
      .trim();
    if (!cardName) continue;

    let lastFour: string | undefined;
    let imageUrl: string | undefined;
    let ancestor: Element | null = nameEl.parentElement;
    for (let d = 0; d < 6 && ancestor; d++) {
      if (!lastFour) {
        const acct = ancestor.querySelector(
          '[data-locator-id="credo_card_acct_num"]'
        );
        if (acct) {
          const digits = (acct.textContent ?? "").replace(/[^0-9]/g, "");
          // Store Amex's full 5-digit suffix (e.g. "81002"), not slice-4.
          lastFour = digits || undefined;
        }
      }
      if (!imageUrl) {
        const img = ancestor.querySelector<HTMLImageElement>(
          'img[src*="aexp-static"]'
        );
        if (img?.src) imageUrl = img.src;
      }
      if (lastFour && imageUrl) break;
      ancestor = ancestor.parentElement;
    }
    out.push({ cardName, lastFour, imageUrl });
  }

  return out;
}

/* ── Public entry points ─────────────────────────────────── */

function snapshot(doc: Document): ScrapeResult {
  const start = performance.now();
  const selectorsAttempted: string[] = [];

  selectorsAttempted.push('[data-testid="rewards-tile"]');
  const tiles = extractAllTiles(doc);

  selectorsAttempted.push('[data-locator-id="credo_card_name"]');
  const productCards = extractProductCards(doc);

  if (tiles.length === 0 && productCards.length === 0) {
    return {
      success: false,
      error: { code: "ELEMENT_NOT_FOUND", message: "No rewards tiles or cards on page" },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted,
    };
  }

  const ident = resolveIdentifier(doc);

  // Build the cards[] list. Each product card's primary programKey is
  // determined by which tile linked to it (by name+lastFour match). If a
  // card wasn't linked to any tile it stays unassigned — we default to
  // amex_mr since that's the overwhelmingly common case for Amex cards.
  //
  // We also build a tile → image-url side map. The tile footer often
  // carries a cleaner thumbnail (NUS static URL) than the grid does,
  // so it's a good fallback when `ProductCard.imageUrl` is missing.
  const cardToProgram = new Map<string, ProgramKey>();
  const cardToTileImage = new Map<string, string>();
  for (const tile of tiles) {
    for (const lc of tile.linkedCards) {
      const k = cardKey(lc.cardName, lc.lastFour);
      cardToProgram.set(k, tile.programKey);
      if (lc.imageUrl && !cardToTileImage.has(k)) {
        cardToTileImage.set(k, lc.imageUrl);
      }
    }
  }

  const cards: DiscoveredCard[] = productCards.map((c) => {
    const k = cardKey(c.cardName, c.lastFour);
    const programKey = cardToProgram.get(k) ?? "amex_mr";
    const imageUrl = c.imageUrl ?? cardToTileImage.get(k);
    return {
      cardName: c.cardName,
      lastFour: c.lastFour,
      issuer: "amex",
      programKey,
      imageUrl,
    };
  });

  // Build the balances[] list.
  //
  // Every program visible on the Amex overview is treated as a pool at
  // the account level — MR, Delta, Marriott, Reward Dollars. Even when
  // a single card is the sole earner (Delta Gold Business, Marriott
  // Brilliant, Blue Cash Everyday for Reward Dollars), the balance
  // belongs to the loyalty account, not the card.
  //
  // When Amex exposes a per-program loyalty account number (SkyMiles#
  // for Delta, Bonvoy# for Marriott), we stamp it on the balance as
  // `externalAccountId`. The server uses it to dedupe the same loyalty
  // account reported from multiple scrapers (Amex overview + delta.com).
  const balances: BalanceRecord[] = tiles.map((tile) => ({
    programKey: tile.programKey,
    balance: tile.balance,
    balanceType: tile.balanceType,
    externalAccountId: tile.loyaltyAccountNumber
      ? `loyalty:${tile.loyaltyAccountNumber}`
      : undefined,
  }));

  return {
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances,
    cards,
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
    matchedSelector: '[data-testid="rewards-tile"]',
  };
}

function cardKey(cardName: string, lastFour: string | undefined): string {
  return `${cardName.toLowerCase()}|${lastFour ?? ""}`;
}

/**
 * Poll for overview content. The rewards tiles and product grid each load
 * async after initial paint, so we wait until we have at least one tile
 * AND at least one card, or until the timeout fires.
 */
export function waitForAmexOverview(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<ScrapeResult> {
  // DOM scrape: walk the rewards tiles, product grid, and linked card
  // spans to assemble a multi-program result. Per-program loyalty
  // numbers (Delta, Marriott, Reward Dollars) come from aria-labels;
  // MR doesn't expose a number in its aria-label so it falls back to
  // the scrape-wide externalAccountId.
  const immediate = snapshot(doc);
  if (
    immediate.success &&
    (immediate.balances?.length ?? 0) > 0 &&
    (immediate.cards?.length ?? 0) > 0
  ) {
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let lastResult = immediate;
    const timer = setTimeout(() => {
      observer.disconnect();
      // Return whatever we last managed to see, even if partial
      resolve(lastResult);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = snapshot(doc);
      lastResult = result;
      if (
        result.success &&
        (result.balances?.length ?? 0) > 0 &&
        (result.cards?.length ?? 0) > 0
      ) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
