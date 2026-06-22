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
 * Parse one rewards tile, given its container (`[data-testid="rewards-tile"]`).
 *
 * Amex's overview moved off inline `aria-label` text onto `aria-labelledby`
 * references, so every field now lives in its own descendant node:
 *
 *   • program name      → the first child of the `[id$="-name"]` block
 *                         ("Membership Rewards® Points", "Delta SkyMiles®")
 *   • balance value     → the non-title child of `[data-testid="reward-balance"]`
 *                         ("194,740 points", "$0.03")
 *   • balance type      → `[data-locator-id^="loyalty-balance-title-"]`
 *                         (empty = total; "YTD Points Earned" = per-card YTD)
 *   • loyalty number    → `[data-testid="rewards-label-id"]` (Delta, Marriott)
 *   • linked card(s)    → `[data-locator-id="loyalty-card-title"]` in the footer
 *                         (single-card tiles; MR shows "3+ Accounts" instead and
 *                         is left to default to amex_mr by the product grid)
 *
 * Reads structural data-locator-ids / ids rather than CSS class names where
 * possible — Amex churns the hashed class names (`heading-sans-small-bold`
 * vs `-xsmall-bold`) far more often than these hooks.
 *
 * Returns null if we can't recognize the program or read a numeric balance
 * — we'd rather skip a tile than guess wrong.
 */
function extractTile(container: Element): TileExtraction | null {
  const titleEl = container.querySelector(
    '[data-locator-id^="loyalty-product-title-"]'
  );
  if (!titleEl) return null;

  // Program name: first element child of the "-name" block. The block's
  // later children are the loyalty-number line, so take the first only.
  const nameBlock = titleEl.querySelector('[id$="-name"]');
  const programName =
    nameBlock?.querySelector(".color-text-link")?.textContent ??
    nameBlock?.firstElementChild?.textContent ??
    null;
  const programKey = mapProgramName(programName);
  if (!programKey) return null;

  // Balance block: `[data-testid="reward-balance"]` holds a balance-title
  // node (may be empty) + the value node. The value is whichever child is
  // NOT the balance-title — class-name independent.
  const balanceBlock = titleEl.querySelector('[data-testid="reward-balance"]');
  const balanceTitleEl = balanceBlock?.querySelector(
    '[data-locator-id^="loyalty-balance-title-"]'
  );
  const balanceTitleText =
    balanceTitleEl?.textContent?.trim().toLowerCase() ?? "";
  const balanceType: "total" | "ytd_earned_on_card" =
    balanceTitleText.includes("ytd") ? "ytd_earned_on_card" : "total";

  let valueText: string | null = null;
  if (balanceBlock) {
    const valueEl = Array.from(balanceBlock.children).find(
      (c) => !c.matches('[data-locator-id^="loyalty-balance-title-"]')
    );
    valueText = (valueEl ?? balanceBlock).textContent;
  }

  const balance =
    programKey === "amex_reward_dollars"
      ? parseDollarsToCents(valueText)
      : parseInteger(valueText);
  if (balance === null) return null;

  // Loyalty account number — Delta + Marriott expose one in the name block
  // ("Loyalty Account Number: 9289872575"). Strip to digits; require a
  // realistic length so a stray short number can't masquerade as one.
  let loyaltyAccountNumber: string | null = null;
  const labelIdEl = nameBlock?.querySelector('[data-testid="rewards-label-id"]');
  if (labelIdEl) {
    const digits = (labelIdEl.textContent ?? "").replace(/\D/g, "");
    if (digits.length >= 6) loyaltyAccountNumber = digits;
  }

  // Linked card(s) live in the tile container footer, not the title button.
  const linkedCards: TileExtraction["linkedCards"] = [];
  const cardTitleEls = container.querySelectorAll(
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
 * Amex renders 5 digits here, but other Amex surfaces sometimes hand us
 * only 4 (e.g. an Amex-issued card shown on a cobranded partner page).
 * Storing 5 produced duplicates across sources, so we always trim to
 * the trailing 4 — the same last-four every issuer exposes.
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
    const digits = match[2];
    const lastFour = digits.length >= 4 ? digits.slice(-4) : digits;
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

function extractAllTiles(doc: Document): TileExtraction[] {
  // Each rewards tile is a `[data-testid="rewards-tile"]` container holding
  // exactly one `loyalty-product-title-*` plus its footer (linked cards).
  // Iterating the container — rather than the title element — keeps the
  // program/balance fields and the footer card list scoped together.
  const containers = doc.querySelectorAll('[data-testid="rewards-tile"]');

  const results: TileExtraction[] = [];
  for (const container of containers) {
    try {
      const extracted = extractTile(container);
      if (extracted) results.push(extracted);
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
          // Trim to trailing 4 — Amex shows 5 here, other surfaces show 4,
          // and matching-by-last-four keeps them as one card.
          lastFour = digits.length >= 4 ? digits.slice(-4) : digits || undefined;
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

/** A healthy overview always has BOTH rewards balances and cards. */
function isComplete(r: ScrapeResult): boolean {
  return (
    r.success &&
    (r.balances?.length ?? 0) > 0 &&
    (r.cards?.length ?? 0) > 0
  );
}

/** Did we manage to parse anything at all (so the page has clearly rendered)? */
function hasAnyContent(r: ScrapeResult): boolean {
  return (r.balances?.length ?? 0) > 0 || (r.cards?.length ?? 0) > 0;
}

/**
 * Turn a settled-but-incomplete snapshot into an explicit failure.
 *
 * This is the crux of failure detection: a page that renders cards but no
 * rewards balances (or vice versa) used to be returned as `success: true`
 * with an empty section — so the widget showed "synced" and nothing was
 * ever reported. Now we classify it as a failure with a message naming
 * which half is missing, so (a) the user sees "Couldn't sync" instead of a
 * forever-spinner, and (b) the background auto-reports it to telemetry.
 */
function finalize(r: ScrapeResult): ScrapeResult {
  if (isComplete(r)) return r;
  // Nothing parsed at all → snapshot already returned ELEMENT_NOT_FOUND.
  if (!r.success) return r;
  const nBal = r.balances?.length ?? 0;
  const nCard = r.cards?.length ?? 0;
  const missing = nBal === 0 ? "rewards balances" : "cards";
  return {
    success: false,
    error: {
      code: "PARTIAL_RESULT",
      message: `Amex overview parsed ${nCard} card(s) and ${nBal} balance(s); missing ${missing}. Page markup may have changed.`,
    },
    durationMs: r.durationMs,
    selectorsAttempted: r.selectorsAttempted,
  };
}

/**
 * Poll for overview content. The rewards tiles and product grid load async
 * after initial paint, so we resolve as soon as BOTH are present.
 *
 * If content renders but stays incomplete (e.g. cards but no rewards — the
 * signature of an Amex markup change that broke tile parsing), we don't
 * wait out the full timeout pretending it worked: a one-shot grace window
 * after the first content appears lets the rest of the page settle, then we
 * resolve a descriptive failure. The full `timeoutMs` remains only as a
 * backstop for the "nothing ever rendered" case.
 */
const SETTLE_GRACE_MS = 6000;

export function waitForAmexOverview(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<ScrapeResult> {
  const immediate = snapshot(doc);
  if (isComplete(immediate)) {
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let resolved = false;
    let graceTimer: number | null = null;

    const finish = (result: ScrapeResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(hardCap);
      if (graceTimer !== null) clearTimeout(graceTimer);
      observer.disconnect();
      resolve(result);
    };

    // Once we've seen ANY content, the page has rendered — give the rest a
    // short, one-shot grace period to finish loading, then judge what we
    // have. One-shot (not reset per mutation) so a chatty SPA can't defer
    // the verdict indefinitely.
    const armGrace = () => {
      if (graceTimer !== null) return;
      graceTimer = window.setTimeout(
        () => finish(finalize(snapshot(doc))),
        SETTLE_GRACE_MS
      );
    };

    // Absolute backstop for the "nothing ever renders" case → finalize will
    // pass through the snapshot's ELEMENT_NOT_FOUND.
    const hardCap = window.setTimeout(
      () => finish(finalize(snapshot(doc))),
      timeoutMs
    );

    const observer = new MutationObserver(() => {
      const result = snapshot(doc);
      if (isComplete(result)) {
        finish(result);
        return;
      }
      if (hasAnyContent(result)) armGrace();
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    // If the first paint already had partial content but no further
    // mutations follow, arm the grace now so we don't sit until the backstop.
    if (hasAnyContent(immediate)) armGrace();
  });
}
