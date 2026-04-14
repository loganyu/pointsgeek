import type { ScrapeResult } from "@point-portfolio/shared";
import { SCRAPE_TIMEOUT_MS } from "@point-portfolio/shared";

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    // Rewards page: <p class="c1-ease-card-rewards-display__balance"> 67,485 Miles </p>
    name: "p.c1-ease-card-rewards-display__balance",
    extract(doc) {
      const el = doc.querySelector("p.c1-ease-card-rewards-display__balance");
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    // Account Summary: #loyalty-tile .primary-detail__balance-dollar contains " 68,388 "
    name: "#loyalty-tile .primary-detail__balance-dollar",
    extract(doc) {
      const el = doc.querySelector("#loyalty-tile .primary-detail__balance-dollar");
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    // Account Summary: rewards tile balance via component structure
    name: "c1-ease-rewards-tile .primary-detail__balance-dollar",
    extract(doc) {
      const el = doc.querySelector("c1-ease-rewards-tile .primary-detail__balance-dollar");
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    // Text pattern: "How would you like to use your 67,485 Miles?"
    name: "text content 'use your X Miles'",
    extract(doc) {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return /use your [\d,]+ Miles/i.test(node.textContent ?? "")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      const node = walker.nextNode();
      if (!node?.textContent) return null;
      const match = node.textContent.match(/([\d,]+)\s*Miles/i);
      return match ? parseBalance(match[1]) : null;
    },
  },
  {
    // Fallback: any element with "Miles" label near a balance number
    name: "labels__balance Miles sibling",
    extract(doc) {
      const labels = doc.querySelectorAll(".labels__balance");
      for (const label of labels) {
        if (label.textContent?.trim().toLowerCase() === "miles") {
          const container = label.closest(".primary-detail_single, .primary-detail__balance, .primary-detail");
          if (!container) continue;
          const balEl = container.querySelector(".primary-detail__balance-dollar");
          if (balEl) return parseBalance(balEl.textContent);
        }
      }
      return null;
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

export function extractCapitalOneBalance(doc: Document): ScrapeResult {
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
      message: "No Capital One miles balance found with any strategy",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForCapitalOneBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<ScrapeResult> {
  const immediate = extractCapitalOneBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Capital One balance not found within ${timeoutMs}ms`,
        },
        durationMs: timeoutMs,
        selectorsAttempted: [],
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractCapitalOneBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
