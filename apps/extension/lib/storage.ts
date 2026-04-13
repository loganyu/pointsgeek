import type { Provider } from "@point-portfolio/shared";

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface StoredBalance {
  provider: Provider;
  balance: number;
  syncedAt: string;
}

interface StoredState {
  token?: string;
  user?: UserInfo;
  latestBalance?: StoredBalance;
  lastError?: string;
}

export async function getState(): Promise<StoredState> {
  const result = await browser.storage.local.get([
    "token",
    "user",
    "latestBalance",
    "lastError",
  ]);
  return result as StoredState;
}

export async function setAuth(token: string, user: UserInfo): Promise<void> {
  await browser.storage.local.set({ token, user, lastError: undefined });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.local.remove(["token", "user"]);
}

export async function setLatestBalance(balance: StoredBalance): Promise<void> {
  await browser.storage.local.set({
    latestBalance: balance,
    lastError: undefined,
  });
}

export async function setLastError(error: string): Promise<void> {
  await browser.storage.local.set({ lastError: error });
}
