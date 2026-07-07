import { defineConfig } from "wxt";
import { loadEnv } from "vite";

/**
 * Sites the extension reads balances from. Stable across all builds.
 */
const FINANCIAL_SITES = [
  "https://www.aa.com/*",
  "https://alaskaair.com/*",
  "https://www.alaskaair.com/*",
  "https://www.americanexpress.com/*",
  "https://global.americanexpress.com/*",
  "https://www.bilt.com/*",
  // Bilt's web app calls api.biltrewards.com cross-origin. host_permission
  // is required for our content-script fetch to ride along even though
  // CORS allow-origin already permits www.bilt.com.
  "https://api.biltrewards.com/*",
  "https://www.cathaypacific.com/*",
  // Same cross-origin pattern as Bilt — cathay's profile endpoint
  // lives on a separate api.* host and CORS allows www.cathaypacific.com.
  "https://api.cathaypacific.com/*",
  "https://ultimaterewardspoints.chase.com/*",
  "https://chaseloyalty.chase.com/*",
  "https://secure.chase.com/*",
  "https://myaccounts.capitalone.com/*",
  "https://verified.capitalone.com/*",
  "https://online.citi.com/*",
  "https://www.delta.com/*",
  "https://www.united.com/*",
  "https://www.marriott.com/*",
  "https://www.hyatt.com/*",
  "https://jal.co.jp/*",
  "https://www.jal.co.jp/*",
  "https://www121.jal.co.jp/*",
  "https://jetblue.com/*",
  "https://www.jetblue.com/*",
  "https://www.qatarairways.com/*",
];

/**
 * Build a host pattern (`https://example.com/*`) from a base URL.
 * Strips trailing slashes so we don't end up with `…com//*`.
 */
function hostPermissionFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/*`;
}

/**
 * Three build modes: development, staging, production. Each loads
 * its own `.env.[mode]` and produces a distinct unpacked extension
 * (different manifest name + outDir) so dev/staging/prod can all be
 * loaded into Chrome side-by-side without overwriting each other.
 *
 * The mode is selected by:
 *  1. WXT_MODE env var (explicit) — set by package.json scripts;
 *  2. NODE_ENV — wxt build sets this to "production" automatically;
 *  3. defaults to "development".
 *
 * Run staging builds via `pnpm dev:staging` / `pnpm build:staging` —
 * those scripts set WXT_MODE=staging.
 */
type BuildMode = "development" | "staging" | "production";

function resolveMode(): BuildMode {
  const explicit = process.env.WXT_MODE;
  if (explicit === "staging") return "staging";
  if (explicit === "production") return "production";
  if (explicit === "development") return "development";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export default defineConfig(() => {
  // WXT's `defineConfig` accepts a function but doesn't pass env to it
  // (c12 invokes it lazily without args). Derive the build mode here
  // and use Vite's loadEnv to pick up `.env.[mode]` + `.env`, so the
  // manifest's `host_permissions` always lines up with the URL the
  // bundled code actually calls.
  const mode = resolveMode();
  const env = loadEnv(mode, process.cwd(), "WXT_");
  const webBase = env.WXT_WEB_BASE ?? "http://localhost:3001";

  // Suffix the manifest name + use a mode-specific outDir for non-prod
  // builds. Lets you load the dev and staging builds in chrome at the
  // same time and see at a glance which one fired the toast.
  // Production keeps a clean "Points Geek" name and the default outDir
  // because that's what gets uploaded to the Web Store.
  const isProd = mode === "production";
  const nameSuffix =
    mode === "staging" ? " (Staging)" : mode === "development" ? " (Local)" : "";
  const outDir = isProd ? ".output" : `.output-${mode}`;

  return {
    modules: ["@wxt-dev/module-react"],
    outDir,
    // Inject WXT_WEB_BASE into the bundle from the SAME `webBase` we use
    // for host_permissions. WXT's own `import.meta.env` loads `.env` by
    // NODE_ENV (always production for `wxt build`), so without this the
    // bundled code would call the prod URL while the manifest allowed
    // localhost — a silent mismatch. This define makes the two agree for
    // every mode (local / staging / prod).
    vite: () => ({
      define: {
        "import.meta.env.WXT_WEB_BASE": JSON.stringify(webBase),
      },
    }),
    dev: {
      server: {
        // 3002, not 3001 — the local web app now runs on 3001, and the
        // WXT dev-server (HMR/reload) must not collide with it.
        port: 3002,
      },
      browser: {
        disabled: true,
      },
    },
    manifest: {
      name: `Points Geek${nameSuffix}`,
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
