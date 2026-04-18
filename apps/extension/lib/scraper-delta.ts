import type { ScrapeResult } from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    // Overview page: MILES AVAILABLE tracker card
    // <span class="skymiles-landing-page-tracker__container__wrap__content__number"> 147,709 </span>
    name: "skymiles-landing-page-tracker number",
    extract(doc) {
      const el = doc.querySelector(
        ".skymiles-landing-page-tracker__container__wrap__content__number"
      );
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    // Overview page: medallion banner (right side, "MILES AVAILABLE" wrapper — the 2nd one)
    // The 1st subtitle is the SkyMiles #, the 2nd is miles available.
    name: "skymiles-medallion-banner MILES AVAILABLE",
    extract(doc) {
      const wrappers = doc.querySelectorAll(
        ".skymiles-medallion-banner__details__container__right__skymiles-wrapper"
      );
      for (const wrapper of wrappers) {
        const title = wrapper
          .querySelector(
            ".skymiles-medallion-banner__details__container__right__skymiles-wrapper__title"
          )
          ?.textContent?.trim()
          .toUpperCase();
        if (title?.includes("MILES AVAILABLE")) {
          const sub = wrapper.querySelector(
            ".skymiles-medallion-banner__details__container__right__skymiles-wrapper__subtitle"
          );
          return sub ? parseBalance(sub.textContent) : null;
        }
      }
      return null;
    },
  },
  {
    // Global header (logged-in, works on any delta.com page):
    // <span class="pax-miles pax-miles-ff"> 147,709 miles </span>
    name: "header .pax-miles",
    extract(doc) {
      const el = doc.querySelector(".pax-miles");
      return el ? parseBalance(el.textContent) : null;
    },
  },
  {
    // Alternate header (idp-login flyout):
    // <idp-login-wrapper> ... <span class="text-caption-semibold ..."> 147,709 miles </span>
    name: "idp-login-wrapper flyout miles",
    extract(doc) {
      const wrapper = doc.querySelector("idp-login-wrapper");
      if (!wrapper) return null;
      // The miles span is the 2nd span inside flyout-name-container, styled with tier text color.
      const candidates = wrapper.querySelectorAll(
        ".flyout-name-container span, .text-loyalty-text-tier-01"
      );
      for (const el of candidates) {
        const text = el.textContent ?? "";
        if (/\bmiles\b/i.test(text)) {
          return parseBalance(text);
        }
      }
      return null;
    },
  },
  {
    // Text content fallback: find any element whose trimmed text matches "<number> miles"
    name: "text content '<n> miles'",
    extract(doc) {
      const walker = doc.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return /[\d,]+\s*miles/i.test(node.textContent ?? "")
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        }
      );
      const node = walker.nextNode();
      if (!node) return null;
      const match = node.textContent?.match(/([\d,]+)\s*miles/i);
      if (!match) return null;
      return parseBalance(match[1]);
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

export function extractDeltaBalance(doc: Document): ScrapeResult {
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
      message: "No Delta SkyMiles balance element found with any strategy",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForDeltaBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<ScrapeResult> {
  const immediate = extractDeltaBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: {
          code: "TIMEOUT",
          message: `Delta SkyMiles balance not found within ${timeoutMs}ms`,
        },
        durationMs: timeoutMs,
        selectorsAttempted: [],
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractDeltaBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
  });
}
