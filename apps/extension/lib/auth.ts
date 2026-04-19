import { extLogger } from "./logger";

/**
 * Popup-side auth stubs. These do not run the OAuth flow themselves —
 * they delegate to the background service worker because the popup
 * closes the instant the OAuth window takes focus, which kills any
 * in-flight promise chain. The background worker persists.
 *
 * Heavy lifting lives in `./auth-flow.ts`.
 */

interface AuthResponse {
  ok: boolean;
  error?: string;
}

export async function signInWithGoogle(): Promise<boolean> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: "SIGN_IN_REQUEST",
    })) as AuthResponse | undefined;

    // If the popup is still alive when this resolves we also get the flag
    // back directly; otherwise the background has already written to
    // storage and the popup's onChanged listener will pick it up whenever
    // it next opens.
    return response?.ok ?? false;
  } catch (err) {
    // If the popup closed mid-flight the channel drops with an error —
    // that's fine, the background is still doing the work.
    extLogger.info("auth.popup_channel_lost", { error: String(err) });
    return false;
  }
}

export async function signOut(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: "SIGN_OUT_REQUEST" });
  } catch (err) {
    extLogger.info("auth.popup_channel_lost", { error: String(err) });
  }
}
