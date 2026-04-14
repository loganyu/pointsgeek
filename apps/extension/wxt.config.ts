import { defineConfig } from "wxt";

export default defineConfig({
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
    name: "Point Portfolio",
    description: "Track your credit card points and miles",
    permissions: ["storage", "activeTab", "identity"],
    host_permissions: [
      "https://www.americanexpress.com/*",
      "https://global.americanexpress.com/*",
      "https://ultimaterewardspoints.chase.com/*",
      "https://secure.chase.com/*",
      "https://myaccounts.capitalone.com/*",
      "https://verified.capitalone.com/*",
    ],
  },
});
