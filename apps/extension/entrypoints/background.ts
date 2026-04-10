import type { ExtensionMessage, ScrapeResult } from "@point-portfolio/shared";
import { RETRY_DELAY_MS } from "@point-portfolio/shared";
import { submitBalance } from "../lib/api";
import { getState, setLatestBalance, setLastError } from "../lib/storage";
import { extLogger } from "../lib/logger";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, _sendResponse) => {
      if (message.type === "BALANCE_SCRAPED" || message.type === "SCRAPE_FAILED") {
        handleScrapeResult(message.payload!);
      }
    }
  );
});

async function handleScrapeResult(result: ScrapeResult, isRetry = false) {
  const { apiKey } = await getState();

  if (!apiKey) {
    extLogger.warn("background.no_api_key");
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EF4444" });
    return;
  }

  const payload = {
    provider: "amex_mr" as const,
    balance: result.balance,
    scrapedAt: new Date().toISOString(),
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

  const apiResult = await submitBalance(payload, apiKey);

  if (apiResult.ok && result.success && result.balance) {
    const display =
      result.balance >= 1000
        ? `${Math.round(result.balance / 1000)}k`
        : String(result.balance);
    browser.action.setBadgeText({ text: display });
    browser.action.setBadgeBackgroundColor({ color: "#22C55E" });
    await setLatestBalance({
      provider: "amex_mr",
      balance: result.balance,
      syncedAt: new Date().toISOString(),
    });
  } else if (!apiResult.ok && !isRetry) {
    extLogger.warn("background.retry", { error: apiResult.error });
    setTimeout(() => handleScrapeResult(result, true), RETRY_DELAY_MS);
  } else if (!apiResult.ok) {
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EF4444" });
    await setLastError(apiResult.error || "Unknown error");
  }
}
