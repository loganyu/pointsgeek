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
 */
export const WEB_BASE: string =
  import.meta.env.WXT_WEB_BASE ?? "http://localhost:3000";
