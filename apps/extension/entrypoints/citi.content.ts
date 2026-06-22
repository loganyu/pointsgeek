import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
  ProgramKey,
} from "@points-geek/shared";

/**
 * Citi online banking dashboard scraper.
 *
 * Citi's CBOL dashboard renders a "rewards tile" per card. For cobrand
 * cards (Citi/AAdvantage Executive, Citi/AAdvantage Platinum, etc.) the
 * tile shows the AAdvantage mileage balance and the rewards container is
 * marked with `.AAHeader` / `.AAContentWrapper` selectors. The same
 * dashboard surfaces the credit-card name, last 4, and card art in a
 * separate `<ums-balance-summary-tile>` block.
 *
 * Currently scopes to AAdvantage cobrand cards only. ThankYou-points
 * tiles are not scraped — most users on cobrand-only portfolios don't
 * have any. Add a TY scraper here when we have a target body to work
 * from. Until then, no balance is reported for non-AA cards.
 */
export default defineContentScript({
  matches: ["https://online.citi.com/US/ag/dashboard*"],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "citi", url });

    // Probe for a signed-in marker before mounting the widget. Citi
    // dashboard pages take a beat to hydrate; the rewards tile and
    // balance summary appear after the SPA shell renders.
    const signedIn = await waitForSignedIn(document, 3_000);
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "citi",
        reason: "not_signed_in",
      });
      return;
    }
    if (!(await syncWidget.start({ label: "Citi" }))) return;

    // Two tiles to find — the rewards tile (program balance) and the
    // balance-summary tile (card name + art + last 4). They render
    // independently and the rewards-tile *shell* arrives well before
    // its inner content (the AAdvantage figure), so we poll for the
    // actual balance value rather than the wrapper element.
    const start = performance.now();
    const balanceTile = await waitForElement<HTMLElement>(
      document,
      "ums-balance-summary-tile",
      8_000
    );
    // Poll for the AA balance specifically — `.AAContentWrapper` exists
    // briefly as an empty shell, so checking presence isn't enough.
    await pollUntil(
      () => extractAaAdvantageBalance(document) !== null,
      10_000
    );
    const aaBalance = extractAaAdvantageBalance(document);

    if (!balanceTile && aaBalance == null) {
      extLogger.warn("scrape.failed", {
        provider: "citi",
        reason: "no_tiles_rendered",
      });
      sendResult({
        success: false,
        error: {
          code: "ELEMENT_NOT_FOUND",
          message: "Citi dashboard tiles did not render",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [
          "dashboard-rewards-tile",
          "ums-balance-summary-tile",
        ],
      });
      return;
    }

    const balanceRecords: BalanceRecord[] = [];
    const cards: DiscoveredCard[] = [];

    // 1. Rewards tile → AAdvantage miles. Skip silently for non-AA
    //    cobrand variants we don't recognize — better than reporting
    //    a "Citi" total that we can't map to a real program.
    if (aaBalance != null) {
      balanceRecords.push({
        programKey: "aa_aadvantage",
        balance: aaBalance,
        balanceType: "total",
      });
    }

    // 2. Balance-summary tile → card name, last 4, image. The card
    //    earns into AAdvantage when its name contains "AAdvantage" —
    //    we attach via card name (not via balance presence) so the
    //    program row is created and the card displays under AA even
    //    when the rewards-tile scrape misses.
    const card = extractCard(document);
    if (card) cards.push(card);

    if (balanceRecords.length === 0 && cards.length === 0) {
      extLogger.warn("scrape.failed", {
        provider: "citi",
        reason: "nothing_extracted",
      });
      sendResult({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Citi dashboard rendered but no balance or card parsed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [
          ".AAContentWrapper .reward-amount",
          ".card-title",
        ],
      });
      return;
    }

    const ident = resolveIdentifier(document);

    extLogger.info("scrape.success", {
      provider: "citi",
      aaBalance,
      cardCount: cards.length,
      externalAccountId: ident.externalAccountId,
      ownerLabel: ident.ownerLabel,
      identifierSource: ident.source,
    });

    sendResult({
      success: true,
      externalAccountId: ident.externalAccountId,
      ownerLabel: ident.ownerLabel,
      identifierSource: ident.source,
      balances: balanceRecords,
      cards,
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [
        ".AAContentWrapper .reward-amount",
        ".card-title",
        ".card-image img",
      ],
      matchedSelector: aaBalance != null ? ".AAContentWrapper" : ".card-title",
    });
  },
});

/**
 * Probe for a Citi-authenticated DOM marker. The CBOL dashboard's
 * welcome header (`#dashboardWelcomeHeader`), the balance-summary tile,
 * and the FICO score tile only render after sign-in.
 */
async function waitForSignedIn(
  doc: Document,
  timeoutMs: number
): Promise<boolean> {
  const selectors = [
    "#dashboardWelcomeHeader",
    "ums-balance-summary-tile",
    "dashboard-fico-score-tile",
  ];
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    for (const sel of selectors) {
      if (doc.querySelector(sel)) return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Find the AAdvantage mileage balance in the rewards tile.
 *
 * Citi marks AAdvantage rewards with class `.AAContentWrapper` (vs.
 * ThankYou or other cobrand variants). The balance lives in
 * `.reward-amount` inside that wrapper.
 */
function extractAaAdvantageBalance(doc: Document): number | null {
  const aaWrapper = doc.querySelector<HTMLElement>(".AAContentWrapper");
  if (!aaWrapper) return null;
  const amountEl = aaWrapper.querySelector<HTMLElement>(".reward-amount");
  return parseInteger(amountEl?.textContent ?? "");
}

/**
 * Pull card name, last 4, and card-art URL from `<ums-balance-summary-tile>`.
 * The card title is rendered like:
 *   "Citi®/AAdvantage® Executive World Elite Mastercard® - 3293"
 * — strip the trademark glyphs and split on the trailing " - <last4>".
 *
 * Maps cobrand cards to their loyalty program by matching the title
 * (and image alt as a backup). Always setting `programKey` for AA cards
 * — even when the rewards tile didn't yield a balance — ensures the API
 * creates the `points_programs` row so the card shows under AA on the
 * dashboard.
 */
function extractCard(doc: Document): DiscoveredCard | null {
  const tile = doc.querySelector<HTMLElement>("ums-balance-summary-tile");
  if (!tile) return null;

  const titleEl = tile.querySelector<HTMLElement>(".card-title");
  const rawTitle = cleanText(titleEl?.textContent ?? "");
  if (!rawTitle) return null;

  // "Citi/AAdvantage Executive World Elite Mastercard - 3293"
  const m = rawTitle.match(/^(.+?)\s*-\s*(\d{4})\s*$/);
  const cardName = m ? m[1].trim() : rawTitle;
  const lastFour = m?.[2];

  const imgEl = tile.querySelector<HTMLImageElement>(".card-image img");
  const imageUrl = imgEl?.src || undefined;
  const imgAlt = imgEl?.alt ?? "";

  const programKey = inferCitiCardProgram(cardName, imgAlt);

  return {
    cardName,
    lastFour,
    issuer: "citi",
    programKey,
    imageUrl,
  };
}

/**
 * Map a Citi card to its earning program. Currently only AAdvantage
 * cobrand cards are recognized — extend with ThankYou (Premier, Strata
 * Premier, Custom Cash) and Costco Anywhere Visa as we add support.
 *
 * Both card name and image alt text are consulted: the alt text omits
 * trademark glyphs (`Citi AAdvantage Executive…`) so it's easier to
 * pattern-match against; the title is the fallback.
 */
function inferCitiCardProgram(
  cardName: string,
  imgAlt: string
): ProgramKey | undefined {
  const hay = `${cardName} ${imgAlt}`.toLowerCase();
  if (/aadvantage/.test(hay)) return "aa_aadvantage";
  return undefined;
}

function cleanText(raw: string): string {
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/ /g, " ")
    .replace(/[®™©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseInteger(text: string): number | null {
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function waitForElement<T extends Element = Element>(
  doc: Document,
  selector: string,
  timeoutMs: number,
  intervalMs = 300
): Promise<T | null> {
  const immediate = doc.querySelector(selector) as T | null;
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      const el = doc.querySelector(selector) as T | null;
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

/**
 * Poll a predicate until it returns truthy or we hit the timeout.
 * Used to wait for the AAdvantage balance to actually populate inside
 * the rewards tile — the wrapper element appears before its content.
 */
function pollUntil(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 300
): Promise<boolean> {
  if (predicate()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}

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
    provider: "citi",
    payload,
  });
}
