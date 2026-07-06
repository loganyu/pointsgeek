import type { BalanceExtraction } from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";

export const ALASKA_POINTS_SECTION_SELECTOR =
  '[data-testid="available-points-section"]';
export const ALASKA_REWARDS_NUMBER_SELECTOR =
  ".guest-information-container .info-row";

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    // Atmos overview:
    // [data-testid="available-points-section"] .points-value -> "160,911"
    name: `${ALASKA_POINTS_SECTION_SELECTOR} .points-value`,
    extract(doc) {
      const value = doc.querySelector<HTMLElement>(
        `${ALASKA_POINTS_SECTION_SELECTOR} .points-value`
      );
      return parsePointsText(value?.textContent ?? "");
    },
  },
  {
    // Fallback for minor test-id churn while keeping the search scoped to
    // the available-points card, not benefit copy elsewhere on the page.
    name: ".available-points-section .points-value",
    extract(doc) {
      const value = doc.querySelector<HTMLElement>(
        ".available-points-section .points-value"
      );
      return parsePointsText(value?.textContent ?? "");
    },
  },
  {
    // Label-driven fallback: find "Available Points", then read the
    // nearest card's point value.
    name: "Available Points label + .points-value",
    extract(doc) {
      for (const el of doc.querySelectorAll<HTMLElement>("span, div")) {
        if (!/^Available Points$/i.test(cleanText(el.textContent ?? ""))) {
          continue;
        }
        const section = el.closest<HTMLElement>(
          `${ALASKA_POINTS_SECTION_SELECTOR}, .available-points-section`
        );
        const value = section?.querySelector<HTMLElement>(".points-value");
        const parsed = parsePointsText(value?.textContent ?? "");
        if (parsed != null) return parsed;
      }
      return null;
    },
  },
];

export function extractAlaskaAtmosBalance(doc: Document): BalanceExtraction {
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
      // Strategy failed, try next.
    }
  }

  return {
    success: false,
    error: {
      code: "ELEMENT_NOT_FOUND",
      message: "No Alaska Atmos available-points balance found",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForAlaskaAtmosBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<BalanceExtraction> {
  const immediate = extractAlaskaAtmosBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Alaska Atmos points not found within ${timeoutMs}ms`,
        },
        durationMs: Math.round(performance.now() - startedAt),
        selectorsAttempted: alaskaSelectorsAttempted(),
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractAlaskaAtmosBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}

export function extractAlaskaRewardsNumber(doc: Document): string | null {
  const selectors = [
    ALASKA_REWARDS_NUMBER_SELECTOR,
    ".guest-information-container",
    ".loyalty-header-row",
  ];

  for (const selector of selectors) {
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      const number = parseRewardsNumber(el.textContent ?? "");
      if (number) return number;
    }
  }

  return parseRewardsNumber(doc.body?.textContent ?? "");
}

export function waitForAlaskaSignedIn(
  doc: Document,
  timeoutMs: number,
  intervalMs = 300
): Promise<boolean> {
  if (isAlaskaSignedIn(doc)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const timer = setInterval(() => {
      if (isAlaskaSignedIn(doc)) {
        clearInterval(timer);
        resolve(true);
      } else if (performance.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}

export function alaskaSelectorsAttempted(): string[] {
  return [
    ALASKA_REWARDS_NUMBER_SELECTOR,
    ".guest-information-container",
    ".loyalty-header-row",
    ...STRATEGIES.map((s) => s.name),
  ];
}

function isAlaskaSignedIn(doc: Document): boolean {
  return (
    !!extractAlaskaRewardsNumber(doc) ||
    !!doc.querySelector(ALASKA_POINTS_SECTION_SELECTOR)
  );
}

function parseRewardsNumber(text: string): string | null {
  const match = cleanText(text).match(/Rewards\s+No\.\s*([\d\s]+)/i);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

function parsePointsText(text: string): number | null {
  const match = cleanText(text).match(/^(\d[\d,]*)$/);
  if (!match) return null;
  const n = parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
