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
    permissions: ["storage", "activeTab", "identity"],
    oauth2: {
      client_id: process.env.AUTH_GOOGLE_ID || "",
      scopes: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    },
    key: process.env.EXTENSION_PUBLIC_KEY || "",
    host_permissions: [
      "https://www.americanexpress.com/*",
      "https://global.americanexpress.com/*",
    ],
  },
});
