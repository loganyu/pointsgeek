import type { ScrapeResult } from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    name: "data-testid rewards balance",
    extract(doc) {
      const el =
        doc.querySelector('[data-testid*="reward" i] [data-testid*="balance" i]') ??
        doc.querySelector('[data-testid*="reward" i]');
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    name: "aria-label rewards points",
    extract(doc) {
      const el = doc.querySelector(
        '[aria-label*="rewards" i], [aria-label*="Membership Rewards" i]'
      );
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    name: "text content Membership Rewards",
    extract(doc) {
      const walker = doc.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return node.textContent?.includes("Membership Rewards")
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        }
      );

      const node = walker.nextNode();
      if (!node?.parentElement) return null;

      // Look for a nearby numeric element (sibling or parent's children)
      const container = node.parentElement.closest("section, div, article") ?? node.parentElement;
      const candidates = container.querySelectorAll("span, p, div, h1, h2, h3, h4");
      for (const candidate of candidates) {
        const val = parseBalance(candidate.textContent);
        if (val !== null && val > 0) return val;
      }
      return null;
    },
  },
  {
    name: "points summary class pattern",
    extract(doc) {
      const el = doc.querySelector(
        '.rewards-summary, .points-balance, .reward-balance, [class*="rewardBalance"], [class*="pointsSummary"]'
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

export function extractBalance(doc: Document): ScrapeResult {
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
      message: "No balance element found with any strategy",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<ScrapeResult> {
  // Try immediately first
  const immediate = extractBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: { code: "TIMEOUT", message: `Balance not found within ${timeoutMs}ms` },
        durationMs: timeoutMs,
        selectorsAttempted: [],
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
