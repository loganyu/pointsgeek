import { useState, useEffect } from "react";
import { getState, setApiKey } from "../../lib/storage";
import { STALE_THRESHOLD_MS } from "@point-portfolio/shared";

export default function App() {
  const [balance, setBalance] = useState<number | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    const state = await getState();
    setHasKey(!!state.apiKey);
    if (state.latestBalance) {
      setBalance(state.latestBalance.balance);
      setSyncedAt(state.latestBalance.syncedAt);
    }
    if (state.lastError) {
      setLastError(state.lastError);
    }
  }

  async function saveKey() {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    await setApiKey(apiKeyInput.trim());
    setHasKey(true);
    setApiKeyInput("");
    setSaving(false);
  }

  function getStatusColor() {
    if (lastError) return "#EF4444";
    if (!syncedAt) return "#9CA3AF";
    const age = Date.now() - new Date(syncedAt).getTime();
    if (age < STALE_THRESHOLD_MS) return "#22C55E";
    return "#EAB308";
  }

  function formatBalance(n: number) {
    return n.toLocaleString();
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <div style={{ width: 320, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 12px", fontWeight: 600 }}>
        Point Portfolio
      </h1>

      {!hasKey ? (
        <div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px" }}>
            Paste your API key from the web dashboard to get started.
          </p>
          <input
            type="password"
            placeholder="pp_..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveKey()}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={saveKey}
            disabled={saving || !apiKeyInput.trim()}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 0",
              background: "#3B82F6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {saving ? "Saving..." : "Save API Key"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: getStatusColor(),
              }}
            />
            <span style={{ fontSize: 12, color: "#6B7280" }}>
              {lastError
                ? `Error: ${lastError}`
                : syncedAt
                  ? `Synced ${formatTime(syncedAt)}`
                  : "Not synced yet"}
            </span>
          </div>

          {balance !== null ? (
            <div style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>
              {formatBalance(balance)}
              <span style={{ fontSize: 14, fontWeight: 400, color: "#6B7280", marginLeft: 4 }}>
                MR pts
              </span>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "#6B7280" }}>
              Visit americanexpress.com to sync your balance.
            </p>
          )}

          <button
            onClick={() => browser.runtime.sendMessage({ type: "SYNC_NOW" })}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 0",
              background: "#3B82F6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Sync Now
          </button>

          <a
            href="http://localhost:3000/dashboard"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 8,
              fontSize: 12,
              color: "#3B82F6",
            }}
          >
            Open Dashboard
          </a>
        </div>
      )}
    </div>
  );
}
