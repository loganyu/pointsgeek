/**
 * Single source of truth for the web-app URL the extension talks to.
 *
 * Configured via the `WXT_WEB_BASE` env var, which WXT loads from
 * `.env.development` (during `pnpm dev`) or `.env.production`
 * (during `pnpm build`). You can also override at build time:
 *
 *   WXT_WEB_BASE=https://pointsgeek-staging.vercel.app pnpm build
 *
 * Falls back to localhost so the type is always `string`.
 *
 * Any trailing slash is stripped: callers build URLs as `${WEB_BASE}/api/...`,
 * so a trailing slash would produce a `//api/...` double slash. That gets
 * normalized via a redirect, and redirects drop the `Authorization` header —
 * so authed POSTs (e.g. /api/balances) would 401 with a perfectly valid token
 * while body-based requests (sign-in) still work.
 */
export const WEB_BASE: string = (
  import.meta.env.WXT_WEB_BASE ?? "http://localhost:3001"
).replace(/\/+$/, "");
