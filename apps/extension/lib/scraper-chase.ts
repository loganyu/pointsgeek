import type { BalanceExtraction } from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    // <ur-nav-header data-displayed-balance="332700">
    name: "ur-nav-header[data-displayed-balance]",
    extract(doc) {
      const el = doc.querySelector("ur-nav-header[data-displayed-balance]");
      if (!el) return null;
      const raw = el.getAttribute("data-displayed-balance");
      return parseBalance(raw);
    },
  },
  {
    // div.points-balance > div.points > div.mds-title-large > span
    name: "div.points-balance .mds-title-large span",
    extract(doc) {
      const el = doc.querySelector("div.points-balance .mds-title-large span");
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    // Broader: first span inside div.points-balance
    name: "div.points-balance (Available points)",
    extract(doc) {
      const container = doc.querySelector("div.points-balance");
      if (!container) return null;
      // Find the span near "Available points", not "Pending points"
      const pointsDivs = container.querySelectorAll("div.points");
      for (const div of pointsDivs) {
        const label = div.querySelector(".points-available");
        if (label) {
          const valEl = div.querySelector(".mds-title-large span");
          return valEl ? parseBalance(valEl.textContent) : null;
        }
      }
      return null;
    },
  },
  {
    name: "aria-label ultimate rewards",
    extract(doc) {
      const el = doc.querySelector(
        '[aria-label*="Ultimate Rewards" i], [aria-label*="points balance" i]'
      );
      return el ? parseBalance(el.textContent) : null;
    },
  },
];

function parseBalance(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function extractChaseBalance(doc: Document): BalanceExtraction {
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
      message: "No Chase UR balance element found with any strategy",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForChaseBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<BalanceExtraction> {
  const immediate = extractChaseBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Chase UR balance not found within ${timeoutMs}ms`,
        },
        durationMs: timeoutMs,
        selectorsAttempted: [],
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractChaseBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
