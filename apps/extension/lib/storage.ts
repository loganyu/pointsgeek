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
  cardInfo?: { cardName: string; lastFour?: string };
  syncedAt: string;
}

function balanceKey(provider: string, cardInfo?: { cardName: string; lastFour?: string }): string {
  if (!cardInfo) return provider;
  return `${provider}|${cardInfo.cardName}${cardInfo.lastFour ? ` ${cardInfo.lastFour}` : ""}`;
}

interface StoredState {
  token?: string;
  user?: UserInfo;
  balances?: Record<string, StoredBalance>;
  lastError?: string;
}

export async function getState(): Promise<StoredState> {
  const result = await browser.storage.local.get([
    "token",
    "user",
    "balances",
    "latestBalance",
    "lastError",
  ]) as StoredState & { latestBalance?: StoredBalance };

  // Migrate old single-balance format to multi-provider format
  if (result.latestBalance && !result.balances) {
    const balances = { [result.latestBalance.provider]: result.latestBalance };
    await browser.storage.local.set({ balances });
    await browser.storage.local.remove(["latestBalance"]);
    result.balances = balances;
  }

  return result;
}

export async function setAuth(token: string, user: UserInfo): Promise<void> {
  await browser.storage.local.set({ token, user, lastError: undefined });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.local.remove(["token", "user"]);
}

export async function setLatestBalance(balance: StoredBalance): Promise<void> {
  const { balances = {} } = await getState();
  const key = balanceKey(balance.provider, balance.cardInfo);
  balances[key] = balance;
  await browser.storage.local.set({ balances, lastError: undefined });
}

export async function setLastError(error: string): Promise<void> {
  await browser.storage.local.set({ lastError: error });
}
