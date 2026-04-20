import { useState, useEffect, CSSProperties } from "react";
import { getState, type StoredBalance } from "../../lib/storage";
import { signInWithGoogle, signOut } from "../../lib/auth";
import { PROGRAM_CATALOG, type ProgramKey } from "@points-geek/shared";

interface UserInfo {
  name: string | null;
  email: string;
  image: string | null;
}

// Web app base URL. Will become env-driven once the staging deploy lands.
const WEB_BASE = "http://localhost:3000";

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "pg-theme";

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [balances, setBalances] = useState<Record<string, StoredBalance>>({});
  const [lastError, setLastError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());

  // Apply theme to <html> so the `.dark` class flips the CSS variables
  // in `style.css`.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // storage disabled — still applies for this session
    }
  }, [theme]);

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
    await signInWithGoogle();
    await loadState();
    setSigningIn(false);
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setBalances({});
    setLastError(null);
  }

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.topRow}>
          <OpenAppButton />
          <div style={styles.rightControls}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
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
      <div style={styles.topRow}>
        <OpenAppButton />
        <div style={styles.rightControls}>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            onClick={handleSignOut}
            style={styles.signOutButton}
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={styles.email} title={user.email}>
        {user.email}
      </div>

      {lastError && <ErrorAlert message={lastError} />}

      {pooledTotals.length === 0 ? (
        <div style={styles.emptyState}>
          Visit your bank's site to sync your first program.
        </div>
      ) : (
        <div style={styles.table}>
          {pooledTotals.map((b, i) => (
            <ProgramRow
              key={`${b.programKey}|${b.externalAccountId}`}
              b={b}
              isLast={i === pooledTotals.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

/**
 * Clickable header that both identifies the popup and launches the web
 * dashboard. "Geek" renders in the brand accent — same 2-tone treatment
 * as the web wordmark.
 */
function OpenAppButton() {
  return (
    <a
      href={`${WEB_BASE}/dashboard`}
      target="_blank"
      rel="noreferrer"
      style={styles.openAppButton}
    >
      <img
        src="/icon/48.png"
        alt=""
        aria-hidden="true"
        width={22}
        height={22}
        style={styles.openAppIcon}
      />
      <span style={styles.openAppLabel}>
        Open Points<span style={styles.openAppAccent}>Geek</span>
      </span>
      <span aria-hidden="true" style={styles.openAppArrow}>
        →
      </span>
    </a>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={onToggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      style={styles.iconButton}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return <div style={styles.errorAlert}>{message}</div>;
}

function ProgramRow({
  b,
  isLast,
}: {
  b: StoredBalance;
  isLast: boolean;
}) {
  const meta = getMeta(b.programKey);
  const sub = identityLabel(b);
  return (
    <div
      style={{
        ...styles.row,
        borderBottom: isLast ? "none" : "1px solid var(--border-light)",
      }}
    >
      <div style={styles.rowLeft}>
        <div style={styles.rowName}>{meta.displayName}</div>
        {sub && <div style={styles.rowSub}>{sub}</div>}
      </div>
      <div style={styles.rowBalance}>
        {formatBalance(b.balance, b.programKey)}
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────── */

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
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
    width: 300,
    padding: 12,
    background: "var(--background)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 6,
  },
  rightControls: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  openAppButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    userSelect: "none",
    lineHeight: 1,
  },
  openAppIcon: {
    borderRadius: 5,
    flexShrink: 0,
  },
  openAppLabel: {
    whiteSpace: "nowrap",
    letterSpacing: "-0.01em",
  },
  openAppAccent: {
    color: "var(--text-accent)",
  },
  openAppArrow: {
    fontSize: 14,
    color: "var(--text-tertiary)",
    lineHeight: 1,
  },
  iconButton: {
    width: 26,
    height: 26,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    background: "var(--surface-secondary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    cursor: "pointer",
  },
  signOutButton: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    padding: "4px 4px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  email: {
    fontSize: 11,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginBottom: 10,
  },
  lede: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "10px 0",
    lineHeight: 1.4,
  },
  errorAlert: {
    fontSize: 11,
    color: "var(--status-error-fg)",
    background: "var(--status-error-bg)",
    border: "1px solid var(--status-error-border)",
    padding: "6px 8px",
    borderRadius: 6,
    marginBottom: 8,
    wordBreak: "break-word",
  },
  emptyState: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    lineHeight: 1.4,
    padding: "8px 0",
  },
  table: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--surface)",
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
  },
  rowLeft: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    gap: 1,
  },
  rowName: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.25,
  },
  rowSub: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.2,
  },
  rowBalance: {
    fontSize: 13,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    letterSpacing: "-0.01em",
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
    marginTop: 8,
  },
};

/* ── Helpers ─────────────────────────────────────────────── */

function readInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage disabled
  }
  // Fall back to OS preference for the first-ever open.
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

/**
 * Sub-line under a program name. Combines owner + loyalty number with a
 * middot, same pattern as the web dashboard. Kept compact — two atoms
 * max, no timestamps (those live on the web app now).
 */
function identityLabel(b: StoredBalance): string | null {
  const meta = PROGRAM_CATALOG[b.programKey];
  const parts: string[] = [];
  if (b.ownerLabel && b.ownerLabel !== "Account") parts.push(b.ownerLabel);
  if (
    (meta?.programType === "airline" || meta?.programType === "hotel") &&
    b.externalAccountId.startsWith("loyalty:")
  ) {
    parts.push(b.externalAccountId.slice("loyalty:".length));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
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
