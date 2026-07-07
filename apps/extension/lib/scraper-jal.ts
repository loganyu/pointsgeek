import type { BalanceExtraction } from "@points-geek/shared";
import { SCRAPE_TIMEOUT_MS } from "@points-geek/shared";

export const JAL_MILE_BALANCE_SELECTOR = "#JS_121_mileBalance";
export const JAL_STATUS_SELECTOR = "#JS_121_jmbStatus, #JS_jmbStatusNameText";

interface SelectorStrategy {
  name: string;
  extract: (doc: Document) => number | null;
}

const STRATEGIES: SelectorStrategy[] = [
  {
    // Signed-in JMB page:
    // <span class="clr-mile" id="JS_121_mileBalance">356,000</span>
    name: JAL_MILE_BALANCE_SELECTOR,
    extract(doc) {
      const value = doc.querySelector<HTMLElement>(JAL_MILE_BALANCE_SELECTOR);
      return parseJalMilesText(value?.textContent ?? "");
    },
  },
  {
    // Scoped fallback for small ID churn while staying inside the miles
    // summary box, not the status section's FLY ON / Life Status figures.
    name: ".details-box .clr-mile",
    extract(doc) {
      for (const box of doc.querySelectorAll<HTMLElement>(".details-box")) {
        if (!/\bMiles\b/i.test(cleanText(box.textContent ?? ""))) continue;
        const value = box.querySelector<HTMLElement>(".clr-mile");
        const parsed = parseJalMilesText(value?.textContent ?? "");
        if (parsed != null) return parsed;
      }
      return null;
    },
  },
  {
    // Link fallback:
    // <a class="link-text"><span>356,000</span><span>mile(s)</span></a>
    name: ".details-box link text 'mile(s)'",
    extract(doc) {
      for (const box of doc.querySelectorAll<HTMLElement>(".details-box")) {
        if (!/\bmile\(s\)/i.test(cleanText(box.textContent ?? ""))) {
          continue;
        }
        const parsed = parseJalMilesText(box.textContent ?? "");
        if (parsed != null) return parsed;
      }
      return null;
    },
  },
];

export function extractJalMileageBankBalance(doc: Document): BalanceExtraction {
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
      message: "No JAL Mileage Bank miles balance found",
    },
    durationMs: Math.round(performance.now() - start),
    selectorsAttempted,
  };
}

export function waitForJalMileageBankBalance(
  doc: Document,
  timeoutMs = SCRAPE_TIMEOUT_MS
): Promise<BalanceExtraction> {
  const immediate = extractJalMileageBankBalance(doc);
  if (immediate.success) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve({
        success: false,
        error: {
          code: "TIMEOUT",
          message: `JAL Mileage Bank miles not found within ${timeoutMs}ms`,
        },
        durationMs: Math.round(performance.now() - startedAt),
        selectorsAttempted: jalSelectorsAttempted(),
      });
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const result = extractJalMileageBankBalance(doc);
      if (result.success) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(doc.body ?? doc.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

export function waitForJalSignedIn(
  doc: Document,
  timeoutMs: number,
  intervalMs = 300
): Promise<boolean> {
  if (isJalSignedIn(doc)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const timer = setInterval(() => {
      if (isJalSignedIn(doc)) {
        clearInterval(timer);
        resolve(true);
      } else if (performance.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}

export function extractJalMembershipNumber(doc: Document): string | null {
  const inputSelectors = [
    'input[id*="jmb" i]',
    'input[name*="jmb" i]',
    'input[id*="member" i]',
    'input[name*="member" i]',
    'input[id*="customer" i]',
    'input[name*="customer" i]',
  ];

  for (const selector of inputSelectors) {
    for (const input of doc.querySelectorAll<HTMLInputElement>(selector)) {
      const number = parseNumberInput(input);
      if (number) return number;
    }
  }

  const textSelectors = [
    '[id*="jmb" i]',
    '[class*="jmb" i]',
    '[id*="member" i]',
    '[class*="member" i]',
    '[id*="customer" i]',
    '[class*="customer" i]',
    "header",
    ".details-wrap",
  ];

  for (const selector of textSelectors) {
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      const number = parseMembershipNumber(el.textContent ?? "");
      if (number) return number;
    }
  }

  return parseMembershipNumber(doc.body?.textContent ?? "");
}

export function extractJalOwnerLabel(doc: Document): string | null {
  const selectors = [
    "#JS_121_memberName",
    "#JS_memberName",
    '[id*="memberName" i]',
    '[class*="member-name" i]',
    '[class*="user-name" i]',
    "header",
  ];

  for (const selector of selectors) {
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      const label = parseOwnerLabel(el.textContent ?? "");
      if (label) return label;
    }
  }

  return parseOwnerLabel(doc.body?.textContent ?? "");
}

export function jalSelectorsAttempted(): string[] {
  return [
    JAL_MILE_BALANCE_SELECTOR,
    JAL_STATUS_SELECTOR,
    ...STRATEGIES.map((s) => s.name),
    'input[id*="jmb" i]',
    'input[name*="jmb" i]',
    '[id*="jmb" i]',
    '[class*="jmb" i]',
  ];
}

function isJalSignedIn(doc: Document): boolean {
  return (
    extractJalMileageBankBalance(doc).success ||
    !!doc.querySelector(JAL_STATUS_SELECTOR)
  );
}

function parseNumberInput(input: HTMLInputElement): string | null {
  const key = [
    input.id,
    input.name,
    input.getAttribute("aria-label"),
    input.getAttribute("placeholder"),
  ]
    .filter(Boolean)
    .join(" ");

  if (!/(jmb|member|membership|customer)/i.test(key)) return null;

  const value = cleanText(input.value);
  if (!/^[\d\s-]{7,16}$/.test(value)) return null;

  const digits = value.replace(/\D/g, "");
  return isPlausibleMemberNumber(digits) ? digits : null;
}

function parseMembershipNumber(text: string): string | null {
  const normalized = cleanText(text);
  const patterns = [
    /(?:JMB|JAL\s+Mileage\s+Bank)[^\d]{0,60}(?:membership|member|customer)?[^\d]{0,30}(?:No\.?|number|#)[^\d]{0,10}([\d\s-]{7,16})/i,
    /(?:membership|member|customer)\s*(?:No\.?|number|#)[^\d]{0,10}([\d\s-]{7,16})/i,
    /JMB\s*(?:No\.?|number|#)\s*([\d\s-]{7,16})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const digits = match[1].replace(/\D/g, "");
    if (isPlausibleMemberNumber(digits)) return digits;
  }

  return null;
}

function parseOwnerLabel(text: string): string | null {
  const normalized = cleanText(text);
  const match = normalized.match(
    /(?:welcome|hello|hi|good\s+(?:morning|afternoon|evening))\s*,?\s+([A-Z][A-Za-z' -]{1,60})/i
  );
  if (!match) return null;

  const label = match[1]
    .replace(/\b(?:JAL|Mileage|Bank|Miles|mile|points?)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return label && /[A-Za-z]/.test(label) ? label : null;
}

function parseJalMilesText(text: string): number | null {
  const normalized = cleanText(text);
  const labeled = normalized.match(/([\d,]+)\s*mile(?:\(s\)|s)?/i);
  const bare = normalized.match(/^(\d[\d,]*)$/);
  const raw = labeled?.[1] ?? bare?.[1];
  if (!raw) return null;

  const n = parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isPlausibleMemberNumber(digits: string): boolean {
  return /^\d{7,12}$/.test(digits);
}

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
