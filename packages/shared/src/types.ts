export const PROVIDERS = ["amex_mr"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ScrapeResult {
  success: boolean;
  balance?: number;
  error?: { code: string; message: string };
  durationMs: number;
  selectorsAttempted: string[];
  matchedSelector?: string;
}

export interface BalancePayload {
  provider: Provider;
  balance?: number;
  scrapedAt: string;
  scrapeEvent: {
    success: boolean;
    durationMs: number;
    extensionVersion: string;
    matchedSelector?: string;
    selectorsAttempted: string[];
    errorCode?: string;
    errorMessage?: string;
  };
}

export interface BalanceResponse {
  id: number;
  provider: Provider;
  balance: string;
  scrapedAt: string;
}

export interface ExtensionMessage {
  type: "BALANCE_SCRAPED" | "SCRAPE_FAILED" | "SYNC_NOW";
  payload?: ScrapeResult;
}
