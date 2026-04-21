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
    await route();
    window.addEventListener("hashchange", () => {
      void route();
    });
  },
});

const CARD_HASH_PATTERN = /#\/dashboard\/summary\/(\d+)\/CARD\/BAC/;
const TRAVEL_HASH_PATTERN = /#\/dashboard\/travel/;

/**
 * Dispatch on the URL hash. Each branch self-guards on its pattern, so
 * calling them in sequence is safe — only the matching one runs.
 */
async function route(): Promise<void> {
  const hash = window.location.hash;
  // Only mount the widget once a hash matches a scrape target — the Chase
  // dashboard is a big SPA and most hashes aren't ours (transfers, offers,
  // rewards catalog, etc.). Mounting early would flash "Syncing Chase…"
  // on every route change.
  if (CARD_HASH_PATTERN.test(hash)) {
    syncWidget.start({ label: "Chase" });
    await scrapeIfCardPage();
    return;
  }
  if (TRAVEL_HASH_PATTERN.test(hash)) {
    syncWidget.start({ label: "Chase" });
    await scrapeTravelSidebar();
  }
}

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

  // Rewards populate from a separate API call a beat after card-art.
  // The rewards container renders early as an empty shell, so we wait
  // for the numeric value itself to appear inside `dataItem-value`. A
  // miss here (Chase UR cards, timeout) is fine — we proceed card-only.
  await pollUntil(() => extractProgramAndBalance(document).balance !== null, 8_000);

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
    // Silent scrape skip → don't leave the pill spinning. This path
    // fires when the nav bar hasn't rendered its page-name attr yet.
    syncWidget.destroy();
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
 * `secure.chase.com/web/auth/dashboard#/dashboard/travel` — the Chase
 * Travel portal has a multi-card selector (the "Choose account" drawer)
 * that lists every Chase card with its balance and art. Clicking the
 * main card chip toggles the drawer open.
 *
 * We click to open (skip if already open), walk every `<li role="option">`
 * under `#card-selector-list`, map each card to its program by image-path
 * + name, emit per-card UR balances (triggers server-side pool recompute)
 * and program-level balances for cobrand cards, then click the Close
 * button so we don't leave the drawer sitting open for the user.
 */
async function scrapeTravelSidebar(): Promise<void> {
  const url = window.location.href;
  const start = performance.now();
  extLogger.info("scrape.start", {
    provider: "chase",
    mode: "travel-sidebar",
    url,
  });

  // Fast path: drawer already populated.
  let items = Array.from(
    document.querySelectorAll<HTMLElement>(
      '#card-selector-list li[role="option"]'
    )
  );
  let openedByUs = false;

  if (items.length === 0) {
    const selectorBtn = await waitForElement<HTMLElement>(
      document,
      "#new-multi-card-selector",
      15_000
    );
    if (!selectorBtn) {
      extLogger.warn("scrape.failed", {
        provider: "chase",
        mode: "travel-sidebar",
        reason: "no_card_selector_button",
      });
      sendResult({
        success: false,
        error: {
          code: "ELEMENT_NOT_FOUND",
          message: "Travel card-selector button did not render",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: ["#new-multi-card-selector"],
      });
      return;
    }
    selectorBtn.click();
    openedByUs = true;

    // Wait for at least one option to render — the drawer shell + list
    // arrive before the items, so waiting on the shell alone is too early.
    const firstItem = await waitForElement<HTMLElement>(
      document,
      '#card-selector-list li[role="option"]',
      10_000
    );

    if (!firstItem) {
      const list = document.querySelector<HTMLElement>("#card-selector-list");
      extLogger.warn("scrape.failed", {
        provider: "chase",
        mode: "travel-sidebar",
        reason: "no_card_options",
        listFound: list !== null,
        listChildCount: list?.children.length ?? 0,
        listInnerSample: list?.innerHTML?.slice(0, 400) ?? null,
      });
      closeTravelSidebar(document);
      sendResult({
        success: false,
        error: {
          code: "ELEMENT_NOT_FOUND",
          message: "Travel card list rendered but had no options",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: ['#card-selector-list li[role="option"]'],
      });
      return;
    }

    items = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#card-selector-list li[role="option"]'
      )
    );
  }

  const balances: BalanceRecord[] = [];
  const cards: DiscoveredCard[] = [];

  for (const item of items) {
    const parsed = parseTravelSidebarItem(item);
    if (!parsed) continue;

    // Always register the card, even without a balance — the row tells us
    // it exists and carries card art we may not have captured elsewhere.
    cards.push({
      cardName: parsed.cardName,
      lastFour: parsed.lastFour,
      issuer: "chase",
      programKey: parsed.programKey ?? "chase_ur",
      imageUrl: parsed.imageUrl,
    });

    if (parsed.programKey && parsed.balance !== null) {
      if (parsed.programKey === "chase_ur") {
        // Per-card UR balance — server recomputes the pool total from the
        // latest per-card snapshots.
        balances.push({
          programKey: "chase_ur",
          balance: parsed.balance,
          balanceType: "total",
          linkedCard: {
            cardName: parsed.cardName,
            lastFour: parsed.lastFour,
          },
        });
      } else {
        // Cobrand program-level total (no linkedCard), same pattern as
        // the card-detail scraper for Marriott / United / Amazon.
        balances.push({
          programKey: parsed.programKey,
          balance: parsed.balance,
          balanceType: "total",
        });
      }
    }
  }

  if (openedByUs) closeTravelSidebar(document);

  if (cards.length === 0 && balances.length === 0) {
    extLogger.warn("scrape.failed", {
      provider: "chase",
      mode: "travel-sidebar",
      reason: "empty_list",
    });
    sendResult({
      success: false,
      error: {
        code: "PARSE_FAILED",
        message: "Travel sidebar rendered but no cards parsed",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: ['li[role="option"]'],
    });
    return;
  }

  const ident = resolveIdentifier(document);

  extLogger.info("scrape.success", {
    provider: "chase",
    mode: "travel-sidebar",
    cardCount: cards.length,
    balanceCount: balances.length,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
  });

  sendResult({
    success: true,
    externalAccountId: ident.externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: ident.source,
    balances,
    cards,
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: ["#new-multi-card-selector", "#card-selector-list"],
    matchedSelector: "#card-selector-list",
  });
}

/**
 * Parse one `<li role="option">` row from the travel sidebar.
 * Shape:
 *   <li role="option">
 *     <img src="https://static2.chasecdn.com/.../unified-assets/digital-cards/chase-sapphire-reserve/..." alt="Sapphire Reserve" />
 *     .card-selector-title span   → "Sapphire Reserve (...8575)"
 *     .card-selector-description span → "331,283 pts"   (or empty)
 *   </li>
 */
function parseTravelSidebarItem(item: Element): {
  cardName: string;
  lastFour?: string;
  balance: number | null;
  imageUrl?: string;
  programKey: ProgramKey | null;
} | null {
  const img = item.querySelector<HTMLImageElement>("img");
  const imageUrl = img?.src || undefined;
  const imgAlt = img?.alt?.trim() ?? "";

  const title =
    item
      .querySelector(".card-selector-title span")
      ?.textContent?.trim() ?? "";
  const desc =
    item
      .querySelector(".card-selector-description span")
      ?.textContent?.trim() ?? "";

  // "Sapphire Reserve (...8575)" → name + last4
  const m = title.match(/^(.+?)\s*\(\s*\.{3}\s*(\d+)\s*\)\s*$/);
  const cardName = cleanText(m?.[1] ?? imgAlt ?? title);
  const lastFour = m?.[2];
  if (!cardName) return null;

  const balance = parseInteger(desc.replace(/\s*pts\s*$/i, ""));
  const programKey = inferChaseCardProgram(imageUrl, cardName);

  return { cardName, lastFour, balance, imageUrl, programKey };
}

/**
 * Map a Chase card to its earning program using image URL path first
 * (stable across name wording drifts), then falling back to the card
 * name. Chase's static CDN groups card art under `/unified-assets/
 * digital-cards/{brand}/...` which is a reliable brand signal.
 */
function inferChaseCardProgram(
  imageUrl: string | undefined,
  cardName: string
): ProgramKey | null {
  const hay = `${imageUrl ?? ""} ${cardName}`.toLowerCase();
  if (/chase-sapphire|\bsapphire\b/.test(hay)) return "chase_ur";
  if (/chase-freedom|\bfreedom\b/.test(hay)) return "chase_ur";
  if (/chase-ink|\bink\b/.test(hay)) return "chase_ur";
  if (/amazon-prime|\bprime visa\b/.test(hay)) return "amazon_rewards";
  if (/\bmarriott\b/.test(hay)) return "marriott_bonvoy";
  if (/united-airlines|\bunited\b/.test(hay)) return "united_mileageplus";
  if (/\bskymiles\b|\bdelta\b/.test(hay)) return "delta";
  return null;
}

function closeTravelSidebar(doc: Document) {
  const btn = doc.querySelector<HTMLButtonElement>(
    'button[aria-label="Close"][data-testid="slide-in-panel-modal-top-modal-button"]'
  );
  if (btn) {
    btn.click();
    return;
  }
  doc.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
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
    syncWidget.success("Points synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "chase",
    payload,
  });
}
