import { setAuth, clearAuth } from "./storage";
import { extLogger } from "./logger";

const API_BASE = "http://localhost:3100";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export async function signInWithGoogle(): Promise<boolean> {
  try {
    const redirectUri = browser.identity.getRedirectURL();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("scope", "openid email profile");

    extLogger.info("auth.starting", { redirectUri });

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const googleAccessToken = params.get("access_token");

    if (!googleAccessToken) {
      extLogger.error("auth.no_token", { responseUrl });
      return false;
    }

    // Exchange Google token for our JWT
    const res = await fetch(`${API_BASE}/api/auth/extension`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ googleAccessToken }),
    });

    if (!res.ok) {
      extLogger.error("auth.exchange_failed", { status: res.status });
      return false;
    }

    const data = await res.json();
    await setAuth(data.token, data.user);
    extLogger.info("auth.success", { email: data.user.email });
    return true;
  } catch (err) {
    extLogger.error("auth.error", { error: String(err) });
    return false;
  }
}

export async function signOut(): Promise<void> {
  await clearAuth();
  extLogger.info("auth.signed_out");
}
