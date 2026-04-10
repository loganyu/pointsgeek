import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  dev: {
    server: {
      port: 3001,
    },
  },
  manifest: {
    name: "Point Portfolio",
    description: "Track your credit card points and miles",
    permissions: ["storage", "activeTab"],
    host_permissions: [
      "https://www.americanexpress.com/*",
      "https://global.americanexpress.com/*",
    ],
  },
});
