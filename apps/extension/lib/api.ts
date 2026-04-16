import type { BalancePayload, PointsProgram, Card } from "@point-portfolio/shared";
import { extLogger } from "./logger";

const API_BASE = "http://localhost:3100";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function submitBalance(
  payload: BalancePayload,
  token: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  extLogger.info("api.request", {
    provider: payload.provider,
    success: payload.scrapeEvent.success,
  });

  try {
    const res = await fetch(`${API_BASE}/api/balances`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      extLogger.error("api.error", { status: res.status, body });
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    }

    extLogger.info("api.response", { status: res.status });
    return { ok: true };
  } catch (err) {
    extLogger.error("api.network_error", { error: String(err) });
    return { ok: false, error: "Network error" };
  }
}

export async function findOrCreateProgram(
  token: string,
  data: { programType: string; name: string; currency: string; issuer: string }
): Promise<PointsProgram | null> {
  try {
    const res = await fetch(`${API_BASE}/api/programs`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function findOrCreateCard(
  token: string,
  data: { programId: string; cardName: string; lastFour?: string; issuer: string }
): Promise<Card | null> {
  try {
    const res = await fetch(`${API_BASE}/api/cards`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
