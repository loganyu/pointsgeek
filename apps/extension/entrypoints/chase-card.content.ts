import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
  ProgramKey,
} from "@points-geek/shared";

/**
 * Chase individual credit-card page scraper.
 *
 * Runs on `secure.chase.com/web/auth/dashboard#/dashboard/summary/{id}/CARD/BAC`
 * — the detail view for a single Chase card. Used for cobrand cards
 * whose rewards don't show up in the UR portal:
 *
 *   • Partner rewards — United MileagePlus on United Gateway,
 *     Marriott Bonvoy on Marriott Boundless, etc.
 *   • White-label rewards — Amazon Rewards on Prime Visa.
 *
 * The balance is attached to the LOYALTY PROGRAM (not the card), mirroring
 * how we handle Amex's Delta/Marriott cards. The card itself is still
 * upserted so the user can see it listed under its earning program.
 *
 * Chase's secure.chase.com uses SPA routing via the URL hash, so the
 * content script inspects `window.location.hash` to decide whether it's
 * on a card page and also listens for `hashchange` to re-scrape if the
 * user clicks through to a different card without reloading.
 */
export default defineContentScript({
  matches: ["https://secure.chase.com/web/auth/dashboard*"],
  async main() {
    await scrapeIfCardPage();
    window.addEventListener("hashchange", () => {
      // Fire-and-forget — each hashchange is an independent scrape
      void scrapeIfCardPage();
    });
  },
});

const CARD_HASH_PATTERN = /#\/dashboard\/summary\/(\d+)\/CARD\/BAC/;

async function scrapeIfCardPage(): Promise<void> {
  const hash = window.location.hash;
  const hashMatch = hash.match(CARD_HASH_PATTERN);
  if (!hashMatch) return;

  const chaseAccountId = hashMatch[1];
  const url = window.location.href;
  const start = performance.now();

  extLogger.info("scrape.start", {
    provider: "chase",
    mode: "card-detail",
    url,
    chaseAccountId,
  });

  // Chase's dashboard is a heavy SPA — card-art hydrates after the
  // initial shell renders. Poll for up to 15s, then give up.
  const cardArtImg = await waitForElement<HTMLImageElement>(
    document,
    '[data-testid="card-art"] img',
    15_000
  );

  if (!cardArtImg) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "card-detail",
      reason: "no_card_art",
    });
    sendResult({
      success: false,
      error: {
        code: "ELEMENT_NOT_FOUND",
        message: "No card art on Chase dashboard",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: ['[data-testid="card-art"] img'],
    });
    return;
  }

  const imageUrl = cardArtImg.src || undefined;

  // The navigation-bar holds the card name *with* the last-4, formatted
  // like "United Gateway (...8072)". It's exposed three ways:
  //   1. `<mds-navigation-bar page-name="...">`          — attribute on the web component
  //   2. `<mds-navigation-bar accessible-text="...">`    — same, accessibility copy
  //   3. `<div class="nav-bar__print-header">...</div>`  — visible-only-when-printing fallback
  // The inner `<span class="navigation-bar__page-name">` the component
  // eventually renders is inside its shadow DOM, which our isolated
  // content script can't see — so we read the attribute/print header
  // from light DOM instead.
  const navBarEl = document.querySelector<HTMLElement>("mds-navigation-bar");
  const navHeading =
    navBarEl?.getAttribute("page-name") ??
    navBarEl?.getAttribute("accessible-text") ??
    document
      .querySelector<HTMLElement>(".nav-bar__print-header")
      ?.textContent?.trim() ??
    "";
  const navMatch = navHeading.match(/^(.+?)\s*\(\s*\.{3}\s*(\d+)\s*\)\s*$/);
  const navName = navMatch ? cleanText(navMatch[1]) : undefined;
  const lastFour = navMatch ? navMatch[2] : undefined;

  const cardName = cleanText(cardArtImg.alt ?? "") || navName || "";

  if (!cardName) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "card-detail",
      reason: "no_card_name",
    });
    return;
  }

  const { programKey, programName, balance } =
    extractProgramAndBalance(document);

  extLogger.info("scrape.extraction", {
    provider: "chase",
    mode: "card-detail",
    cardName,
    programName,
    programKey,
    balance,
  });

  // If we can't map the program, skip the balance but still discover the
  // card so at least the dashboard knows it exists. Card goes under
  // `chase_ur` as a neutral default — user can reclassify later once
  // we add the program mapping.
  const balances: BalanceRecord[] = [];
  if (programKey && balance !== null) {
    balances.push({
      programKey,
      balance,
      balanceType: "total",
      // No linkedCard — balance belongs to the loyalty program pool,
      // not the physical card (same pattern as Amex Delta/Marriott).
    });
  }

  const cards: DiscoveredCard[] = [
    {
      cardName,
      lastFour,
      issuer: "chase",
      // When we know the program, attach the card to it so the UI lists
      // it under that program. Unmapped cards default to chase_ur.
      programKey: programKey ?? "chase_ur",
      imageUrl,
    },
  ];

  const ident = resolveIdentifier(document);

  const result: ScrapeResult = {
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances,
    cards,
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: [
      '[data-testid="card-art"] img',
      "#partnerRewards-dataItem",
      "#whiteLabelRewards-dataItem",
    ],
    matchedSelector: '[data-testid="card-art"] img',
  };

  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "card-detail",
    cardName,
    lastFour,
    balanceCount: balances.length,
    programKey,
    balance,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
  });

  sendResult(result);
}

/**
 * Extract the rewards program + balance from the card-detail page.
 *
 * Two variants:
 *   - `#partnerRewards-dataItem`   — travel partners; program name is in
 *     `mds-definition-link[definition-text]`.
 *   - `#whiteLabelRewards-dataItem` — merchant co-brands (Amazon); program
 *     name is in plain text on the item label.
 *
 * Returns all-nulls for Chase UR cards (which don't expose rewards here
 * — they live on the UR portal) or for cards we don't recognize.
 */
function extractProgramAndBalance(doc: Document): {
  programKey: ProgramKey | null;
  programName: string | null;
  balance: number | null;
} {
  const partner = doc.querySelector("#partnerRewards-dataItem");
  if (partner) {
    const defLink = partner.querySelector("mds-definition-link");
    const programName = cleanText(
      defLink?.getAttribute("definition-text") ?? ""
    );
    const balanceEl = partner.querySelector(
      '[data-testid="partnerRewards"] span'
    );
    const balance = parseInteger(balanceEl?.textContent ?? "");
    return { programKey: mapProgramName(programName), programName, balance };
  }

  const whiteLabel = doc.querySelector("#whiteLabelRewards-dataItem");
  if (whiteLabel) {
    const labelEl = whiteLabel.querySelector('[data-testid="dataItem-label"]');
    const programName = cleanText(labelEl?.textContent ?? "");
    const balanceEl = whiteLabel.querySelector(
      '[data-testid="whiteLabelRewards"] span'
    );
    const balance = parseInteger(balanceEl?.textContent ?? "");
    return { programKey: mapProgramName(programName), programName, balance };
  }

  return { programKey: null, programName: null, balance: null };
}

/**
 * Map Chase's card-detail program labels to our canonical program keys.
 * Add cases here as new cobrand cards show up — keep each branch a
 * simple substring check so tiny label wording tweaks don't break it.
 */
function mapProgramName(raw: string): ProgramKey | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("mileageplus") || s.startsWith("united")) {
    return "united_mileageplus";
  }
  if (s.includes("marriott bonvoy") || s.startsWith("marriott")) {
    return "marriott_bonvoy";
  }
  if (s.includes("amazon")) return "amazon_rewards";
  if (s.includes("skymiles") || s.startsWith("delta")) return "delta";
  // Future additions (not yet in PROGRAM_CATALOG):
  //   "world of hyatt" → "hyatt"
  //   "southwest rapid rewards" → "southwest_rapid_rewards"
  //   "ihg" → "ihg_one_rewards"
  return null;
}

function cleanText(raw: string): string {
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ") // actual non-breaking space character
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

function sendResult(payload: ScrapeResult) {
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "chase",
    payload,
  });
}
