import { setAuth, clearAuth, setLastError } from "./storage";
import { extLogger } from "./logger";

/**
 * Background-side sign-in/out implementation. Runs inside the service
 * worker, not the popup — the popup closes as soon as the OAuth window
 * takes focus, so any auth flow kicked off from there is guaranteed to
 * be torn down mid-flight. The service worker persists, so OAuth + API
 * exchange + storage writes all complete reliably.
 *
 * The popup talks to this via `browser.runtime.sendMessage({type:"SIGN_IN_REQUEST"})`.
 */

const API_BASE = "http://localhost:3000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export interface AuthFlowResult {
  ok: boolean;
  error?: string;
}

export async function performSignIn(): Promise<AuthFlowResult> {
  if (!GOOGLE_CLIENT_ID) {
    const msg = "Missing VITE_GOOGLE_CLIENT_ID in extension .env";
    extLogger.error("auth.no_client_id");
    await setLastError(msg);
    return { ok: false, error: msg };
  }

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

    if (!responseUrl) {
      const msg = "Google sign-in was cancelled.";
      extLogger.error("auth.no_response_url");
      await setLastError(msg);
      return { ok: false, error: msg };
    }

    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const googleAccessToken = params.get("access_token");

    if (!googleAccessToken) {
      const oauthError = params.get("error");
      const msg = oauthError
        ? `Google rejected sign-in: ${oauthError}`
        : "Google sign-in did not return a token.";
      extLogger.error("auth.no_token", { responseUrl, oauthError });
      await setLastError(msg);
      return { ok: false, error: msg };
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/extension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleAccessToken }),
      });
    } catch (err) {
      const msg = `Can't reach ${API_BASE}. Is the web server running?`;
      extLogger.error("auth.fetch_failed", { error: String(err) });
      await setLastError(msg);
      return { ok: false, error: msg };
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = JSON.stringify(await res.json());
      } catch {
        detail = await res.text().catch(() => "");
      }
      const msg = `Server rejected sign-in (${res.status}). ${detail}`;
      extLogger.error("auth.exchange_failed", { status: res.status, detail });
      await setLastError(msg);
      return { ok: false, error: msg };
    }

    const data = await res.json();
    if (!data?.token || !data?.user) {
      const msg = "Server response was missing token or user.";
      extLogger.error("auth.bad_response", { data });
      await setLastError(msg);
      return { ok: false, error: msg };
    }

    await setAuth(data.token, data.user);
    extLogger.info("auth.success", { email: data.user.email });
    return { ok: true };
  } catch (err) {
    const msg = `Sign-in error: ${String(err)}`;
    extLogger.error("auth.error", { error: String(err) });
    await setLastError(msg);
    return { ok: false, error: msg };
  }
}

export async function performSignOut(): Promise<void> {
  await clearAuth();
  extLogger.info("auth.signed_out");
}
