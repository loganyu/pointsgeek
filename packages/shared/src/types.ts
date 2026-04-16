export const PROVIDERS = ["amex_mr", "chase_ur", "capital_one"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROGRAM_TYPES = ["bank_rewards", "airline", "hotel"] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const CURRENCIES = ["points", "miles"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface PointsProgram {
  id: string;
  programType: ProgramType;
  name: string;
  currency: Currency;
  issuer: string;
  active: boolean;
}

export interface Card {
  id: string;
  programId: string;
  cardName: string;
  lastFour?: string;
  issuer: string;
  active: boolean;
}

export interface ScrapeResult {
  success: boolean;
  balance?: number;
  cardInfo?: { cardName: string; lastFour?: string };
  discoveredCards?: Array<{ cardName: string; lastFour?: string }>;
  error?: { code: string; message: string };
  durationMs: number;
  selectorsAttempted: string[];
  matchedSelector?: string;
}

export interface BalancePayload {
  provider: Provider;
  balance?: number;
  programId?: string;
  cardId?: string;
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
  programId?: string;
  cardId?: string;
  scrapedAt: string;
}

export interface ExtensionMessage {
  type: "BALANCE_SCRAPED" | "SCRAPE_FAILED" | "SYNC_NOW";
  provider?: Provider;
  programId?: string;
  cardId?: string;
  payload?: ScrapeResult;
}
