import { useState, useEffect } from "react";
import { getState } from "../../lib/storage";
import { signInWithGoogle, signOut } from "../../lib/auth";
import type { Provider } from "@point-portfolio/shared";
import { STALE_THRESHOLD_MS } from "@point-portfolio/shared";

interface UserInfo {
  name: string | null;
  email: string;
  image: string | null;
}

interface BalanceInfo {
  balance: number;
  syncedAt: string;
}

const PROVIDER_CONFIG: { id: Provider; label: string; short: string; url: string }[] = [
  {
    id: "amex_mr",
    label: "Amex Membership Rewards",
    short: "Amex",
    url: "https://www.americanexpress.com",
  },
  {
    id: "chase_ur",
    label: "Chase Ultimate Rewards",
    short: "Chase",
    url: "https://ultimaterewardspoints.chase.com",
  },
];

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [balances, setBalances] = useState<Record<string, BalanceInfo>>({});
  const [lastError, setLastError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    const state = await getState();
    setUser(state.user ?? null);
    setBalances(state.balances ?? {});
    setLastError(state.lastError ?? null);
  }

  async function handleSignIn() {
    setSigningIn(true);
    const success = await signInWithGoogle();
    if (success) await loadState();
    setSigningIn(false);
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setBalances({});
    setLastError(null);
  }

  function formatBalance(n: number) {
    return n.toLocaleString();
  }

  function timeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function isStale(syncedAt: string) {
    return Date.now() - new Date(syncedAt).getTime() > STALE_THRESHOLD_MS;
  }

  if (!user) {
    return (
      <div style={{ width: 320, padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18, margin: "0 0 12px", fontWeight: 600 }}>
          Point Portfolio
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px" }}>
          Sign in to start tracking your points and miles.
        </p>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          style={{
            width: "100%",
            padding: "10px 0",
            background: "#fff",
            color: "#333",
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {signingIn ? "Signing in..." : "Sign in with Google"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: 320, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0, fontWeight: 600 }}>Point Portfolio</h1>
        <button
          onClick={handleSignOut}
          style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}
        >
          Sign out
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {user.image && (
          <img src={user.image} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />
        )}
        <span style={{ fontSize: 12, color: "#6B7280" }}>{user.email}</span>
      </div>

      {lastError && (
        <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{lastError}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROVIDER_CONFIG.map(({ id, label, short, url }) => {
          const b = balances[id];
          return (
            <div
              key={id}
              style={{
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{label}</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11,
                    color: "#fff",
                    background: "#3B82F6",
                    padding: "3px 10px",
                    borderRadius: 4,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {b ? "Refresh" : `Sync ${short}`}
                </a>
              </div>
              {b ? (
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>
                    {formatBalance(b.balance)}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF", marginLeft: 4 }}>
                      pts
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: isStale(b.syncedAt) ? "#EAB308" : "#9CA3AF" }}>
                    {timeAgo(b.syncedAt)}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: "#9CA3AF" }}>No data yet</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
