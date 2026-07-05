import type { BalanceExtraction } from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";

export const JETBLUE_TRUEBLUE_BUTTON_SELECTOR =
  '[data-fs-element="main-nav-menu-button-user-trueblue"]';

const BUTTON_SELECTORS = [
  `button${JETBLUE_TRUEBLUE_BUTTON_SELECTOR}`,
  JETBLUE_TRUEBLUE_BUTTON_SELECTOR,
  'button[data-fs-element*="trueblue" i]',
  '[data-fs-element*="trueblue" i]',
];
const OWNER_SELECTOR = '[role="img"][aria-label]';

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    // Signed-in header:
    // [data-fs-element="main-nav-menu-button-user-trueblue"] <span>14,027 pts</span>
    name: `${JETBLUE_TRUEBLUE_BUTTON_SELECTOR} span`,
    extract(doc) {
      const button = findTrueBlueButton(doc);
      if (!button) return null;

      for (const span of button.querySelectorAll("span")) {
        const balance = parseJetBluePointsText(span.textContent ?? "");
        if (balance != null) return balance;
      }
      return null;
    },
  },
  {
    // Fallback if JetBlue changes the exact child markup but keeps the
    // signed-in TrueBlue button text.
    name: JETBLUE_TRUEBLUE_BUTTON_SELECTOR,
    extract(doc) {
      const button = findTrueBlueButton(doc);
      return button ? parseJetBluePointsText(button.textContent ?? "") : null;
    },
  },
];

export function extractJetBlueBalance(doc: Document): BalanceExtraction {
  const start = performance.now();
  const selectorsAttempted: string[] = [];

  for (const strategy of STRATEGIES) {
    selectorsAttempted.push(strategy.name);
    try {
      const balance = strategy.extract(doc);
      if (balance !== null) {
        return {
          success: true,
          balance,
          durationMs: Math.round(performance.now() - start),
          selectorsAttempted,
          matchedSelector: strategy.name,
        };
      }
    } catch {
      // Strategy failed, try next
    }
  }

  return {
    success: false,
    error: {
      code: "ELEMENT_NOT_FOUND",
      message: "No JetBlue TrueBlue points balance found with any strategy",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForJetBlueBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<BalanceExtraction> {
  const immediate = extractJetBlueBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: {
          code: "TIMEOUT",
          message: `JetBlue TrueBlue points not found within ${timeoutMs}ms`,
        },
        durationMs: timeoutMs,
        selectorsAttempted: STRATEGIES.map((s) => s.name),
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractJetBlueBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}

export function extractJetBlueOwnerLabel(doc: Document): string | null {
  const button = findTrueBlueButton(doc);
  const aria = button
    ?.querySelector(OWNER_SELECTOR)
    ?.getAttribute("aria-label");
  const label = aria?.replace(/\s+/g, " ").trim();
  return label && /[A-Za-z]/.test(label) ? label : null;
}

export function waitForJetBlueSignedInNav(
  doc: Document,
  timeoutMs: number,
  intervalMs = 300
): Promise<boolean> {
  if (findTrueBlueButton(doc)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      if (findTrueBlueButton(doc)) {
        clearInterval(timer);
        resolve(true);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}

export function jetBlueSelectorsAttempted(): string[] {
  return [
    ...BUTTON_SELECTORS,
    ...STRATEGIES.map((s) => s.name),
    `${JETBLUE_TRUEBLUE_BUTTON_SELECTOR} ${OWNER_SELECTOR}`,
  ];
}

function findTrueBlueButton(doc: Document): Element | null {
  for (const selector of BUTTON_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el) return el;
  }

  // Last-resort DOM fallback for minor JetBlue attribute changes:
  // keep it scoped to buttons containing a points label so we don't
  // accidentally read marketing copy elsewhere on the page. The signed-in
  // avatar exposes the user's full name via a nested aria-label.
  for (const button of doc.querySelectorAll("button")) {
    const text = button.textContent ?? "";
    const owner = button
      .querySelector(OWNER_SELECTOR)
      ?.getAttribute("aria-label");
    if (owner && parseJetBluePointsText(text) != null) return button;
  }
  return null;
}

export function parseJetBluePointsText(text: string): number | null {
  const normalized = text.replace(/\u00a0/g, " ");
  const match = normalized.match(/([\d,]+)\s*(?:pts?|points)\b/i);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
