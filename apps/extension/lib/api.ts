import type { BalancePayload } from "@points-geek/shared";
import { extLogger } from "./logger";
import { WEB_BASE as API_BASE } from "./config";

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

/**
 * Fire-and-forget failure telemetry. Posted on every failed scrape so we
 * (the devs) can see what's breaking in the wild and fix stale selectors,
 * without asking the user to do anything.
 *
 * Deliberately unauthenticated and decoupled from `submitBalance`: a
 * failed scrape is exactly the state where the user might also be signed
 * out, and we still want the report. The background reaches this
 * cross-origin via the extension's host_permissions for WEB_BASE. Never
 * throws — telemetry must never break the sync path.
 */
export async function reportScrapeFailure(report: {
  provider: string;
  code?: string;
  message?: string;
  url?: string;
  selectorsAttempted?: string[];
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/telemetry/scrape-failure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    });
  } catch (err) {
    extLogger.warn("api.report_failure_error", { error: String(err) });
  }
}
