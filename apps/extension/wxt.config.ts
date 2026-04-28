import { defineConfig } from "wxt";
import { loadEnv } from "vite";

/**
 * Sites the extension reads balances from. Stable across all builds.
 */
const FINANCIAL_SITES = [
  "https://www.aa.com/*",
  "https://www.americanexpress.com/*",
  "https://global.americanexpress.com/*",
  "https://www.bilt.com/*",
  // Bilt's web app calls api.biltrewards.com cross-origin. host_permission
  // is required for our content-script fetch to ride along even though
  // CORS allow-origin already permits www.bilt.com.
  "https://api.biltrewards.com/*",
  "https://ultimaterewardspoints.chase.com/*",
  "https://chaseloyalty.chase.com/*",
  "https://secure.chase.com/*",
  "https://myaccounts.capitalone.com/*",
  "https://verified.capitalone.com/*",
  "https://online.citi.com/*",
  "https://www.delta.com/*",
  "https://www.united.com/*",
  "https://www.marriott.com/*",
];

/**
 * Build a host pattern (`https://example.com/*`) from a base URL.
 * Strips trailing slashes so we don't end up with `…com//*`.
 */
function hostPermissionFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/*`;
}

export default defineConfig(() => {
  // WXT's `defineConfig` accepts a function but doesn't pass env to it
  // (c12 invokes it lazily without args). Derive the build mode from
  // NODE_ENV — `wxt build` sets it to "production", `wxt` (dev) leaves
  // it as "development". Then load `.env`, `.env.[mode]`, etc. the same
  // way Vite would, so the manifest's `host_permissions` always lines
  // up with the URL the bundled code actually calls.
  const mode =
    process.env.NODE_ENV === "production" ? "production" : "development";
  const env = loadEnv(mode, process.cwd(), "WXT_");
  const webBase = env.WXT_WEB_BASE ?? "http://localhost:3000";

  return {
    modules: ["@wxt-dev/module-react"],
    dev: {
      server: {
        port: 3001,
      },
      browser: {
        disabled: true,
      },
    },
    manifest: {
      name: "Points Geek",
      description: "Track your credit card points and miles",
      permissions: ["storage", "activeTab", "identity"],
      host_permissions: [
        ...FINANCIAL_SITES,
        // Web app — derived from WXT_WEB_BASE so dev / staging / prod
        // builds each declare *only* the URL they actually call. Keeps
        // the production manifest tight for Web Store review.
        hostPermissionFor(webBase),
      ],
    },
  };
});
