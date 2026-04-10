import type { Provider } from "@point-portfolio/shared";

interface StoredBalance {
  provider: Provider;
  balance: number;
  syncedAt: string;
}

interface StoredState {
  apiKey?: string;
  latestBalance?: StoredBalance;
  lastError?: string;
}

export async function getState(): Promise<StoredState> {
  const result = await browser.storage.local.get(["apiKey", "latestBalance", "lastError"]);
  return result as StoredState;
}

export async function setApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ apiKey: key });
}

export async function setLatestBalance(balance: StoredBalance): Promise<void> {
  await browser.storage.local.set({ latestBalance: balance, lastError: undefined });
}

export async function setLastError(error: string): Promise<void> {
  await browser.storage.local.set({ lastError: error });
}
