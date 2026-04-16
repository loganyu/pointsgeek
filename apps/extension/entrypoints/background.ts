import type { ExtensionMessage, ScrapeResult, Provider } from "@point-portfolio/shared";
import { RETRY_DELAY_MS } from "@point-portfolio/shared";
import { submitBalance, findOrCreateProgram, findOrCreateCard } from "../lib/api";
import { getState, setLatestBalance, setLastError } from "../lib/storage";
import { extLogger } from "../lib/logger";

// Map provider to program metadata for auto-creation
const PROGRAM_DEFAULTS: Record<Provider, { programType: string; name: string; currency: string; issuer: string }> = {
  amex_mr: { programType: "bank_rewards", name: "Membership Rewards", currency: "points", issuer: "amex" },
  chase_ur: { programType: "bank_rewards", name: "Ultimate Rewards", currency: "points", issuer: "chase" },
  capital_one: { programType: "bank_rewards", name: "Capital One Miles", currency: "miles", issuer: "capital_one" },
};

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, _sendResponse) => {
      if (message.type === "BALANCE_SCRAPED" || message.type === "SCRAPE_FAILED") {
        handleScrapeResult(message);
      }
    }
  );
});

async function handleScrapeResult(message: ExtensionMessage, isRetry = false) {
  const provider = message.provider || "amex_mr";
  const result = message.payload!;
  const { token } = await getState();

  if (!token) {
    extLogger.warn("background.not_signed_in");
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EF4444" });
    return;
  }

  // Auto-create program if scrape succeeded
  let programId: string | undefined;
  let cardId: string | undefined;

  if (result.success && result.balance) {
    const programDef = PROGRAM_DEFAULTS[provider];
    const program = await findOrCreateProgram(token, programDef);
    programId = program?.id;

    // If scrape detected a specific card (rewards page), auto-create it
    if (programId && result.cardInfo) {
      const card = await findOrCreateCard(token, {
        programId,
        cardName: result.cardInfo.cardName,
        lastFour: result.cardInfo.lastFour,
        issuer: programDef.issuer,
      });
      cardId = card?.id;
    }

    // If summary page discovered multiple cards, create them all
    if (programId && result.discoveredCards?.length) {
      extLogger.info("background.creating_discovered_cards", {
        provider,
        count: result.discoveredCards.length,
      });
      for (const discovered of result.discoveredCards) {
        await findOrCreateCard(token, {
          programId,
          cardName: discovered.cardName,
          lastFour: discovered.lastFour,
          issuer: programDef.issuer,
        });
      }
    }
  }

  const payload = {
    provider,
    balance: result.balance,
    programId,
    cardId,
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

  const apiResult = await submitBalance(payload, token);

  if (apiResult.ok && result.success && result.balance) {
    browser.action.setBadgeText({ text: "" });
    await setLatestBalance({
      provider,
      balance: result.balance,
      cardInfo: result.cardInfo,
      syncedAt: new Date().toISOString(),
    });
  } else if (!apiResult.ok && apiResult.status === 401) {
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EAB308" });
    await setLastError("Session expired — please sign in again");
  } else if (!apiResult.ok && !isRetry) {
    extLogger.warn("background.retry", { provider, error: apiResult.error });
    setTimeout(() => handleScrapeResult(message, true), RETRY_DELAY_MS);
  } else if (!apiResult.ok) {
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#EF4444" });
    await setLastError(apiResult.error || "Unknown error");
  }
}
