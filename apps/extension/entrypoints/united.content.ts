import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * united.com scraper — two entry points.
 *
 *   /en/us/myunited*
 *     The signed-in dashboard renders MileagePlus #, miles, and Chase
 *     co-brand card details in plain HTML. Richest scrape; primary target.
 *
 *   everywhere else on united.com
 *     The signed-in nav-bar greeting shows the user's miles and a
 *     "Cardmember" tag. Clicking the greeting opens a slide-in drawer
 *     with the MileagePlus #. We open it, read, and close it back up.
 *     No cards here — the landing page never enumerates them — so we
 *     rely on server-side dedup (last-four or balance match) to merge
 *     with an existing program row if chaseloyalty / myunited scraped
 *     earlier.
 *
 * Class names on united.com are hashed per-build, so always anchor on
 * stable substrings (e.g. `[class*="mpNumber"]`), never on the hashed
 * suffix.
 */
export default defineContentScript({
  matches: ["https://www.united.com/*"],
  async main() {
    const path = window.location.pathname;
    if (path.startsWith("/en/us/myunited")) {
      return scrapeMyUnited();
    }
    return scrapeNavBar();
  },
});

/* ── /myunited flow ──────────────────────────────────────── */

async function scrapeMyUnited() {
  const start = performance.now();
  const url = window.location.href;
  extLogger.info("scrape.start", { provider: "united", mode: "myunited", url });

  // Wait up to 15s for the account-summary block to hydrate.
  const mpEl = await pollFor(
    () =>
      document.querySelector<HTMLElement>('[class*="mpNumber"]') ||
      document.querySelector<HTMLElement>(
        '[class*="AccountSummary__accountSummaryContainer"]'
      ),
    15_000
  );

  if (!mpEl) {
    extLogger.warn("scrape.failed", {
      provider: "united",
      mode: "myunited",
      reason: "account_summary_not_found",
    });
    send({
      success: false,
      error: {
        code: "ELEMENT_NOT_FOUND",
        message: "MileagePlus account-summary block did not render",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: ['[class*="mpNumber"]'],
    });
    return;
  }

  const mileagePlusNumber = extractMileagePlusNumberFromAccountSummary(document);
  const miles = extractMilesFromAccountSummary(document);
  if (miles === null) {
    extLogger.warn("scrape.failed", {
      provider: "united",
      mode: "myunited",
      reason: "miles_not_parsed",
    });
    send({
      success: false,
      error: {
        code: "PARSE_FAILED",
        message: "Could not parse miles balance",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: ['[class*="MileageBalance__totalMiles"] span'],
    });
    return;
  }

  // The Cards section hydrates later than the Account Summary block on
  // myunited. Wait up to 8s for the first `cardDetailsContainer`, then
  // extract. A miss here is non-fatal — balance still goes up.
  await pollFor(
    () =>
      document.querySelector<HTMLElement>(
        '[class*="CardDetails"][class*="cardDetailsContainer"]'
      ),
    8_000
  );

  const discoveredCards = extractCards(document);
  if (discoveredCards.length === 0) {
    extLogger.warn("scrape.cards_missing", {
      provider: "united",
      mode: "myunited",
      cardDetailsContainerCount: document.querySelectorAll(
        '[class*="cardDetailsContainer"]'
      ).length,
    });
  }

  emitSuccess({
    start,
    mode: "myunited",
    miles,
    mileagePlusNumber,
    discoveredCards,
    matchedSelector: '[class*="AccountSummary__accountSummaryContainer"]',
    selectorsAttempted: [
      '[class*="mpNumber"]',
      '[class*="MileageBalance__totalMiles"]',
      '[class*="CardDetails"] [class*="cardDetailsContainer"]',
    ],
  });
}

/* ── Landing / nav-bar flow ──────────────────────────────── */

async function scrapeNavBar() {
  const start = performance.now();
  const url = window.location.href;
  extLogger.info("scrape.start", { provider: "united", mode: "nav-bar", url });

  // 1. Wait for the nav-bar greeting (signed-in only). Unsigned pages
  //    never render this element — short-circuit in that case.
  const greetingFormat = await pollFor(
    () =>
      document.querySelector<HTMLElement>(
        '[class*="GreetingMessage"][class*="greetingMessageFormat"]'
      ),
    10_000
  );
  if (!greetingFormat) {
    extLogger.info("scrape.skipped", {
      provider: "united",
      mode: "nav-bar",
      reason: "no_greeting_signed_out",
    });
    return; // Not an error — just not signed in.
  }

  // 2. Miles come from the nav-bar greeting itself (non-intrusive read).
  const miles = extractMilesFromGreeting(greetingFormat);
  if (miles === null) {
    extLogger.warn("scrape.failed", {
      provider: "united",
      mode: "nav-bar",
      reason: "miles_not_in_greeting",
    });
    send({
      success: false,
      error: {
        code: "PARSE_FAILED",
        message: "Could not parse miles from nav-bar greeting",
      },
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: ['[class*="greetingMessageFormat"]'],
    });
    return;
  }

  // 3. Click the greeting button to open the drawer; the MileagePlus
  //    number only lives there on non-/myunited pages.
  const greetingBtn =
    document.querySelector<HTMLButtonElement>(
      '[class*="greetingInfoButton"]'
    ) ?? greetingFormat.closest("button");

  let mileagePlusNumber: string | null = null;
  let drawerOwnerName: string | null = null;
  let opened = false;

  if (greetingBtn) {
    greetingBtn.click();
    opened = true;
    const drawer = await pollFor(
      () => document.querySelector<HTMLElement>(".atm-c-drawer__overlay"),
      5_000
    );
    if (drawer) {
      // Wait for the MILEAGEPLUS NUMBER <p> to render inside the drawer.
      await pollFor(
        () => findMileagePlusLine(drawer),
        3_000
      );
      mileagePlusNumber = extractMileagePlusNumberFromDrawer(drawer);
      drawerOwnerName = extractNameFromDrawer(drawer);
    }
    closeDrawer(document);
  }

  const ident = resolveIdentifier(document, {
    greetingName: drawerOwnerName ?? undefined,
  });
  const externalAccountId = mileagePlusNumber
    ? `loyalty:${mileagePlusNumber}`
    : ident.externalAccountId;
  const ownerLabel = ident.ownerLabel ?? drawerOwnerName ?? null;

  const balances: BalanceRecord[] = [
    {
      programKey: "united_mileageplus",
      balance: miles,
      balanceType: "total",
      ...(mileagePlusNumber
        ? { externalAccountId: `loyalty:${mileagePlusNumber}` }
        : {}),
    },
  ];

  extLogger.info("scrape.success", {
    provider: "united",
    mode: "nav-bar",
    miles,
    mileagePlusNumber: mileagePlusNumber ?? null,
    drawerOpened: opened,
    ownerLabel,
  });

  send({
    success: true,
    externalAccountId,
    ownerLabel,
    identifierSource: mileagePlusNumber ? "customer_id" : ident.source,
    balances,
    cards: [],
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted: [
      '[class*="greetingMessageFormat"]',
      '.atm-c-drawer__overlay',
    ],
    matchedSelector: '[class*="greetingMessageFormat"]',
  });
}

/* ── Shared extraction helpers ───────────────────────────── */

function send(payload: ScrapeResult) {
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "united",
    payload,
  });
}

function emitSuccess(args: {
  start: number;
  mode: "myunited" | "nav-bar";
  miles: number;
  mileagePlusNumber: string | null;
  discoveredCards: DiscoveredCard[];
  matchedSelector: string;
  selectorsAttempted: string[];
}) {
  const ident = resolveIdentifier(document);
  const externalAccountId = args.mileagePlusNumber
    ? `loyalty:${args.mileagePlusNumber}`
    : ident.externalAccountId;

  const balances: BalanceRecord[] = [
    {
      programKey: "united_mileageplus",
      balance: args.miles,
      balanceType: "total",
      ...(args.mileagePlusNumber
        ? { externalAccountId: `loyalty:${args.mileagePlusNumber}` }
        : {}),
    },
  ];

  extLogger.info("scrape.success", {
    provider: "united",
    mode: args.mode,
    miles: args.miles,
    mileagePlusNumber: args.mileagePlusNumber ?? null,
    cardCount: args.discoveredCards.length,
    ownerLabel: ident.ownerLabel,
  });

  send({
    success: true,
    externalAccountId,
    ownerLabel: ident.ownerLabel,
    identifierSource: args.mileagePlusNumber ? "customer_id" : ident.source,
    balances,
    cards: args.discoveredCards,
    durationMs: Math.round(performance.now() - args.start),
    selectorsAttempted: args.selectorsAttempted,
    matchedSelector: args.matchedSelector,
  });
}

function pollFor<T extends Element | null>(
  find: () => T,
  timeoutMs: number,
  intervalMs = 300
): Promise<T | null> {
  const immediate = find();
  if (immediate) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      const hit = find();
      if (hit) {
        clearInterval(timer);
        resolve(hit);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, intervalMs);
  });
}

/**
 * Extract the MileagePlus number from the /myunited Account Summary
 * block:
 *   <div class="...mpNumber...">
 *     <span class="...screenReaderMessage...">MileagePlus Number</span>
 *     KX018333
 *   </div>
 */
function extractMileagePlusNumberFromAccountSummary(
  doc: Document
): string | null {
  const el = doc.querySelector<HTMLElement>('[class*="mpNumber"]');
  if (!el) return null;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.textContent?.trim();
    if (text && /^[A-Z0-9]{4,}$/i.test(text)) return text;
  }
  const text = (el.textContent ?? "")
    .replace(/mileage\s*plus\s*number/i, "")
    .trim();
  return /^[A-Z0-9]{4,}$/i.test(text) ? text : null;
}

function extractMilesFromAccountSummary(doc: Document): number | null {
  const el = doc.querySelector<HTMLElement>(
    '[class*="MileageBalance__totalMiles"] span'
  );
  const raw = el?.textContent?.trim() ?? "";
  if (!raw) return null;
  const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * The nav-bar greeting concatenates three snippets:
 *   "Hi, Logan " | "Cardmember" | " | 35,242 miles"
 * Each lives in its own `.greetingMessage--XYfxk` div. We scan the
 * whole container's text for the miles phrase — resilient to the
 * presence/absence of the Cardmember tag.
 */
function extractMilesFromGreeting(root: HTMLElement): number | null {
  const text = root.textContent ?? "";
  const m = text.match(/([\d,]+)\s*miles/i);
  if (!m) return null;
  const num = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Find the `<p>` inside the signed-in drawer that reads
 *   "MILEAGEPLUS NUMBER: KX018333"
 * The element has a hashed `app-components-Ciam-LoggedIn-styles__upperCase`
 * class, but the text content itself is the most stable signal.
 */
function findMileagePlusLine(drawer: HTMLElement): HTMLElement | null {
  const paragraphs = drawer.querySelectorAll<HTMLElement>("p");
  for (const p of paragraphs) {
    const text = p.textContent?.trim() ?? "";
    if (/mileage\s*plus\s*number/i.test(text)) return p;
  }
  return null;
}

function extractMileagePlusNumberFromDrawer(
  drawer: HTMLElement
): string | null {
  const line = findMileagePlusLine(drawer);
  if (!line) return null;
  const text = line.textContent ?? "";
  const m = text.match(/mileage\s*plus\s*number\s*:?\s*([A-Z0-9]{4,})/i);
  return m?.[1] ?? null;
}

/**
 * First `<p>` in the drawer with "Hi, <Name>" — we pull just the first
 * name to match how other scrapers render ownerLabel ("Logan", not
 * "Logan Yu").
 */
function extractNameFromDrawer(drawer: HTMLElement): string | null {
  const paragraphs = drawer.querySelectorAll<HTMLElement>("p");
  for (const p of paragraphs) {
    const text = p.textContent?.trim() ?? "";
    const m = text.match(/^hi[,\s]+([A-Z][A-Za-z'’-]{1,30})/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function closeDrawer(doc: Document) {
  const btn = doc.querySelector<HTMLButtonElement>(
    "button.atm-c-drawer__controls__close"
  );
  if (btn) {
    btn.click();
    return;
  }
  // Fallback: Escape key dismiss most drawers.
  doc.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
}

/**
 * Each `.cardDetailsContainer` holds one Chase-issued United co-brand
 * on the /myunited Cards section:
 *   <... class="...cardDetailsContainer...">
 *     <img alt="United Gateway credit card" src="..." />
 *     <h3 aria-label="Gateway card ending in 8072">Gateway **8072</h3>
 */
function extractCards(doc: Document): DiscoveredCard[] {
  const containers = doc.querySelectorAll<HTMLElement>(
    '[class*="CardDetails"][class*="cardDetailsContainer"]'
  );
  const seen = new Set<string>();
  const out: DiscoveredCard[] = [];

  for (const container of containers) {
    const img = container.querySelector<HTMLImageElement>(
      'img[alt*="credit card" i], [class*="creditCardImg"] img'
    );
    const imageUrl = img?.src || undefined;
    const altName = (img?.alt ?? "")
      .replace(/\s*credit\s*card\s*$/i, "")
      .trim();

    const h3 = container.querySelector<HTMLElement>(
      'h3[aria-label*="ending in" i]'
    );
    const aria = h3?.getAttribute("aria-label") ?? "";
    const m = aria.match(/^(.+?)\s+card\s+ending\s+in\s+(\d+)\s*$/i);
    const h3Name = m?.[1]?.trim();
    const lastFour = m?.[2];

    // Prefer the img alt ("United Gateway") over the h3's short name
    // ("Gateway") — matches the Chase-side card label better.
    const cardName = altName || h3Name;
    if (!cardName) continue;

    const key = `${cardName.toLowerCase()}|${lastFour ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      cardName,
      lastFour,
      issuer: "chase",
      programKey: "united_mileageplus",
      imageUrl,
    });
  }

  return out;
}
