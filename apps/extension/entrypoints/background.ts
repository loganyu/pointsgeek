import type {
  ExtensionMessage,
  ScrapeResult,
  BalancePayload,
  Provider,
} from "@points-geek/shared";
import { RETRY_DELAY_MS } from "@points-geek/shared";
import { submitBalance } from "../lib/api";
import {
  getState,
  upsertBalances,
  setLastError,
  type StoredBalance,
} from "../lib/storage";
import { performSignIn, performSignOut } from "../lib/auth-flow";
import { extLogger } from "../lib/logger";

type BackgroundMessage =
  | ExtensionMessage
  | { type: "SIGN_IN_REQUEST" }
  | { type: "SIGN_OUT_REQUEST" };

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message: BackgroundMessage,
      _sender,
      sendResponse: (response?: unknown) => void
    ) => {
      // Auth requests: the popup will close as soon as the OAuth window
      // opens, so we own the full flow here. Returning `true` keeps the
      // message channel open for the async response (Chrome contract).
      if (message.type === "SIGN_IN_REQUEST") {
        performSignIn().then(sendResponse).catch((err) => {
          extLogger.error("background.sign_in_failed", { error: String(err) });
          sendResponse({ ok: false, error: String(err) });
        });
        return true;
      }

      if (message.type === "SIGN_OUT_REQUEST") {
        performSignOut()
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            extLogger.error("background.sign_out_failed", {
              error: String(err),
            });
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      if (
        message.type === "BALANCE_SCRAPED" ||
        message.type === "SCRAPE_FAILED"
      ) {
        handleScrapeResult(message);
      }
    }
  );
});

async function handleScrapeResult(message: ExtensionMessage, isRetry = false) {
  const provider = message.provider;
  const result = message.payload;
  if (!provider || !result) return;

  const { token } = await getState();
  if (!token) {
    extLogger.warn("background.not_signed_in");
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EF4444" });
    return;
  }

  const payload: BalancePayload = {
    provider,
    externalAccountId: result.externalAccountId,
    ownerLabel: result.ownerLabel,
    scrapedAt: new Date().toISOString(),
    balances: result.balances ?? [],
    cards: result.cards,
    scrapeEvent: {
      success: result.success,
      durationMs: result.durationMs,
      extensionVersion: browser.runtime.getManifest().version,
      matchedSelector: result.matchedSelector,
      selectorsAttempted: result.selectorsAttempted,
      errorCode: result.error?.code,
      errorMessage: result.error?.message,
    },
  };

  const apiResult = await submitBalance(payload, token);

  if (apiResult.ok && result.success) {
    browser.action.setBadgeText({ text: "" });
    await cacheBalancesForPopup(provider, result);
    return;
  }

  if (!apiResult.ok && apiResult.status === 401) {
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EAB308" });
    await setLastError("Session expired — please sign in again");
    return;
  }

  if (!apiResult.ok && !isRetry) {
    extLogger.warn("background.retry", { provider, error: apiResult.error });
    setTimeout(() => handleScrapeResult(message, true), RETRY_DELAY_MS);
    return;
  }

  if (!apiResult.ok) {
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EF4444" });
    await setLastError(apiResult.error || "Unknown error");
  }
}

/**
 * Mirror successful balance records into local extension storage so the
 * popup can render them without hitting the API.
 */
async function cacheBalancesForPopup(
  provider: Provider,
  result: ScrapeResult
): Promise<void> {
  if (!result.externalAccountId) return;
  const syncedAt = new Date().toISOString();

  const records: StoredBalance[] = (result.balances ?? []).map((b) => ({
    provider,
    programKey: b.programKey,
    // Prefer the balance-level id (e.g. "loyalty:9289872575") when set.
    externalAccountId: b.externalAccountId ?? result.externalAccountId!,
    ownerLabel: result.ownerLabel ?? null,
    balance: b.balance,
    balanceType: b.balanceType,
    cardName: b.linkedCard?.cardName,
    lastFour: b.linkedCard?.lastFour,
    syncedAt,
  }));

  await upsertBalances(records);
}
