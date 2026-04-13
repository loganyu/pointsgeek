import type { BalancePayload } from "@point-portfolio/shared";
import { extLogger } from "./logger";

const API_BASE = "http://localhost:3100";

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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
