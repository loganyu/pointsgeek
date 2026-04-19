import type { BalancePayload } from "@points-geek/shared";
import { extLogger } from "./logger";

const API_BASE = "http://localhost:3100";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Submit a multi-program balance payload. The server handles all program
 * and card upserts, daily-dedup, and snapshot writes.
 */
export async function submitBalance(
  payload: BalancePayload,
  token: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  extLogger.info("api.request", {
    provider: payload.provider,
    balanceCount: payload.balances.length,
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
