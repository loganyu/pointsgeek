import { useState, useEffect, CSSProperties } from "react";
import { getState, type StoredBalance } from "../../lib/storage";
import { signInWithGoogle, signOut } from "../../lib/auth";
import {
  PROGRAM_CATALOG,
  STALE_THRESHOLD_MS,
  type ProgramKey,
} from "@points-geek/shared";

interface UserInfo {
  name: string | null;
  email: string;
  image: string | null;
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [balances, setBalances] = useState<Record<string, StoredBalance>>({});
  const [lastError, setLastError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    loadState();

    // The popup can close mid-OAuth (Chrome closes it when focus leaves).
    // When the background / auth flow later writes to extension storage,
    // this listener makes sure any already-open popup picks up the change.
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== "local") return;
      if (
        "token" in changes ||
        "user" in changes ||
        "balances" in changes ||
        "lastError" in changes
      ) {
        loadState();
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  async function loadState() {
    const state = await getState();
    setUser(state.user ?? null);
    const b = state.balances ?? {};
    setBalances(b);
    const hasRecentSync = Object.values(b).length > 0;
    setLastError(hasRecentSync ? null : state.lastError ?? null);
    if (hasRecentSync && state.lastError) {
      browser.storage.local.remove(["lastError"]);
    }
  }

  async function handleSignIn() {
    setSigningIn(true);
    const success = await signInWithGoogle();
    await loadState();
    setSigningIn(false);
    if (!success) {
      // loadState pulls in any lastError signInWithGoogle set.
    }
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setBalances({});
    setLastError(null);
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <Wordmark />
        <p style={styles.lede}>
          Sign in to start tracking your points and miles.
        </p>
        {lastError && <ErrorAlert message={lastError} />}
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          style={styles.googleButton}
        >
          <GoogleIcon />
          {signingIn ? "Signing in..." : "Sign in with Google"}
        </button>
      </div>
    );
  }

  // Pool totals only — skip per-card rows for a clean popup display.
  const pooledTotals = Object.values(balances).filter(
    (b) => b.balanceType === "total" && !b.cardName
  );
  pooledTotals.sort((a, b) => {
    const byOwner = (a.ownerLabel ?? "").localeCompare(b.ownerLabel ?? "");
    if (byOwner !== 0) return byOwner;
    return getMeta(a.programKey).displayName.localeCompare(
      getMeta(b.programKey).displayName
    );
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Wordmark />
        <button onClick={handleSignOut} style={styles.signOutButton}>
          Sign out
        </button>
      </div>

      <div style={styles.userRow}>
        {user.image && (
          <img src={user.image} alt="" aria-hidden="true" style={styles.avatar} />
        )}
        <span style={styles.userEmail}>{user.email}</span>
      </div>

      {lastError && <ErrorAlert message={lastError} />}

      {pooledTotals.length === 0 ? (
        <div style={styles.emptyState}>
          Visit your bank's site to sync your first program.
        </div>
      ) : (
        <div style={styles.cardStack}>
          {pooledTotals.map((b) => (
            <ProgramCard key={`${b.programKey}|${b.externalAccountId}`} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function Wordmark() {
  return (
    <div style={styles.wordmark}>
      <img
        src="/icon/48.png"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        style={styles.wordmarkIcon}
      />
      <span style={styles.wordmarkText}>
        Points<span style={styles.wordmarkAccent}>Geek</span>
      </span>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return <div style={styles.errorAlert}>{message}</div>;
}

function ProgramCard({ b }: { b: StoredBalance }) {
  const meta = getMeta(b.programKey);
  const stale = isStale(b.syncedAt);
  return (
    <div style={styles.programCard}>
      <div style={styles.programCardHeader}>
        <span style={styles.programName}>{meta.displayName}</span>
        <a
          href={meta.primarySyncUrl}
          target="_blank"
          rel="noreferrer"
          style={styles.refreshButton}
        >
          Refresh
        </a>
      </div>
      <div style={styles.programCardBody}>
        <div style={styles.balance}>
          {formatBalance(b.balance, b.programKey)}
        </div>
        <span
          style={{
            ...styles.lastUpdated,
            color: stale ? "var(--status-stale)" : "var(--text-tertiary)",
          }}
        >
          {timeAgo(b.syncedAt)}
        </span>
      </div>
      {identityLabel(b) && (
        <div style={styles.identityLabel}>{identityLabel(b)}</div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/* ── Styles (CSS-in-JS, tokens via CSS vars) ─────────────── */

const styles: Record<string, CSSProperties> = {
  container: {
    width: 320,
    padding: 16,
    background: "var(--background)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  wordmark: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    userSelect: "none",
  },
  wordmarkIcon: {
    borderRadius: 6,
    flexShrink: 0,
  },
  wordmarkText: {
    fontSize: 18,
    fontWeight: 700,
    whiteSpace: "nowrap",
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
  },
  wordmarkAccent: {
    color: "var(--text-accent)",
  },
  signOutButton: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  lede: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "12px 0",
    lineHeight: 1.4,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--surface-secondary)",
  },
  userEmail: {
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  errorAlert: {
    fontSize: 12,
    color: "var(--status-error-fg)",
    background: "var(--status-error-bg)",
    border: "1px solid var(--status-error-border)",
    padding: "8px 10px",
    borderRadius: 8,
    marginBottom: 10,
    wordBreak: "break-word",
  },
  emptyState: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    lineHeight: 1.4,
  },
  cardStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  programCard: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    borderRadius: 12,
    padding: 12,
  },
  programCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  programName: {
    fontSize: 12,
    color: "var(--text-secondary)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  refreshButton: {
    fontSize: 11,
    color: "#ffffff",
    background: "var(--purple-primary)",
    padding: "3px 10px",
    borderRadius: 6,
    textDecoration: "none",
    whiteSpace: "nowrap",
    fontWeight: 500,
  },
  programCardBody: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  balance: {
    fontSize: 22,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
  },
  lastUpdated: {
    fontSize: 11,
  },
  identityLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
  },
  googleButton: {
    width: "100%",
    padding: "10px 0",
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
};

/* ── Helpers (unchanged) ─────────────────────────────────── */

function identityLabel(b: StoredBalance): string | null {
  const meta = PROGRAM_CATALOG[b.programKey];
  if (meta?.programType === "airline" || meta?.programType === "hotel") {
    if (b.externalAccountId.startsWith("loyalty:")) {
      return b.externalAccountId.slice("loyalty:".length);
    }
  }
  if (b.ownerLabel && b.ownerLabel !== "Account") return b.ownerLabel;
  return null;
}

function getMeta(key: ProgramKey) {
  return (
    PROGRAM_CATALOG[key] ?? {
      displayName: key,
      primarySyncUrl: "#",
      currency: "points" as const,
    }
  );
}

function formatBalance(n: number, programKey: ProgramKey) {
  const meta = PROGRAM_CATALOG[programKey];
  if (meta?.currency === "usd_cents") {
    return (n / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }
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
