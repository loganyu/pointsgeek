import type { Provider, ProgramKey, BalanceType } from "@points-geek/shared";

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

/**
 * Per-balance record kept in extension storage purely for the popup UI.
 * The authoritative copy lives in Postgres via /api/balances — this cache
 * exists so the popup has something to show instantly without a round-trip.
 */
export interface StoredBalance {
  provider: Provider;
  programKey: ProgramKey;
  externalAccountId: string;
  /** Nullable — scrapers without a greeting leave this blank; UI hides. */
  ownerLabel: string | null;
  balance: number;
  balanceType: BalanceType;
  cardName?: string;
  lastFour?: string;
  syncedAt: string;
}

/** Composite key so multi-account / per-card entries don't collide. */
export function balanceKey(b: {
  provider: Provider;
  programKey: ProgramKey;
  externalAccountId: string;
  cardName?: string;
  lastFour?: string;
}): string {
  return [
    b.provider,
    b.programKey,
    b.externalAccountId,
    b.cardName ?? "",
    b.lastFour ?? "",
  ].join("|");
}

interface StoredState {
  token?: string;
  user?: UserInfo;
  balances?: Record<string, StoredBalance>;
  lastError?: string;
}

export async function getState(): Promise<StoredState> {
  return (await browser.storage.local.get([
    "token",
    "user",
    "balances",
    "lastError",
  ])) as StoredState;
}

export async function setAuth(token: string, user: UserInfo): Promise<void> {
  await browser.storage.local.set({ token, user, lastError: undefined });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.local.remove(["token", "user", "balances"]);
}

export async function upsertBalances(records: StoredBalance[]): Promise<void> {
  if (records.length === 0) return;
  const { balances = {} } = await getState();
  for (const rec of records) {
    balances[balanceKey(rec)] = rec;
  }
  await browser.storage.local.set({ balances, lastError: undefined });
}

export async function setLastError(error: string): Promise<void> {
  await browser.storage.local.set({ lastError: error });
}
