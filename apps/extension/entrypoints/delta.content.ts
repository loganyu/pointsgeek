import { waitForDeltaBalance } from "../lib/scraper-delta";
import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult } from "@points-geek/shared";

/**
 * Delta SkyMiles content script.
 *
 * Delta's website shows the authoritative SkyMiles balance — this is a
 * single-program scraper producing one `total` record for `delta`. Delta
 * doesn't issue cards itself, so no card discovery.
 */
export default defineContentScript({
  matches: ["https://www.delta.com/*"],
  async main() {
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "delta", url });

    // Don't flash the widget on the signed-out delta.com homepage.
    // Our content script runs on every delta.com page, and the balance
    // scraper below polls for up to ~15s before giving up — showing
    // "Syncing Delta…" that whole time (then "Sync failed") on a
    // marketing page the user didn't expect to sync is noisy. Probe
    // briefly for any authenticated element; if nothing shows up,
    // silently skip without mounting the widget.
    const signedIn = await waitForSignedIn(document, 3_000);
    if (!signedIn) {
      extLogger.info("scrape.skipped", {
        provider: "delta",
        reason: "not_signed_in",
      });
      return;
    }
    syncWidget.start({ label: "Delta" });

    const extraction = await waitForDeltaBalance(document);

    if (!extraction.success || extraction.balance == null) {
      extLogger.warn("scrape.failed", {
        provider: "delta",
        error: extraction.error,
      });
      sendResult({
        success: false,
        error: extraction.error,
        durationMs: extraction.durationMs,
        selectorsAttempted: extraction.selectorsAttempted,
        matchedSelector: extraction.matchedSelector,
      });
      return;
    }

    // Prefer the SkyMiles number as a stable per-account identifier when
    // we can read it off the page; fall back to the usual greeting/fingerprint.
    const skyMilesNumber = extractSkyMilesNumber(document);
    // Delta surfaces a "Good Evening, Logan" greeting in an Angular banner
    // whose class doesn't match the shared helper's selectors — pull it
    // manually so the owner chip on the dashboard says "Logan" instead
    // of the default "Account".
    const greetingName = extractDeltaGreeting(document);

    const ident = resolveIdentifier(document, {
      customerId: skyMilesNumber,
      greetingName,
    });

    const result: ScrapeResult = {
      success: true,
      externalAccountId: ident.externalAccountId,
      ownerLabel: ident.ownerLabel,
      identifierSource: ident.source,
      balances: [
        {
          programKey: "delta",
          balance: extraction.balance,
          balanceType: "total",
          // Stamp the SkyMiles # so this program row dedupes against the
          // Amex overview's Delta tile (which reports the same number).
          externalAccountId: skyMilesNumber
            ? `loyalty:${skyMilesNumber}`
            : undefined,
        },
      ],
      cards: [],
      durationMs: extraction.durationMs,
      selectorsAttempted: extraction.selectorsAttempted,
      matchedSelector: extraction.matchedSelector,
    };

    extLogger.info("scrape.success", {
      provider: "delta",
      balance: extraction.balance,
      externalAccountId: ident.externalAccountId,
      identifierSource: ident.source,
    });

    sendResult(result);
  },
});

/**
 * Poll briefly for any Delta element that only renders when the user
 * is signed in. Three selectors cover the spots a balance-or-miles
 * figure can appear:
 *   - `.pax-miles` in the global header/flyout (any logged-in page)
 *   - `.skymiles-medallion-banner` on the landing page
 *   - `.skymiles-landing-page-tracker__container` on the dashboard
 */
async function waitForSignedIn(
  doc: Document,
  timeoutMs: number
): Promise<boolean> {
  const selectors = [
    ".pax-miles",
    ".skymiles-medallion-banner",
    ".skymiles-landing-page-tracker__container",
  ];
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    for (const sel of selectors) {
      if (doc.querySelector(sel)) return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function sendResult(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Miles synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "delta",
    payload,
  });
}

/**
 * Delta's medallion banner renders a greeting like:
 *   <span class="...__title__default">
 *     <div>Good Evening,</div>
 *     <div>Logan</div>
 *   </span>
 * The shared greeting extractor doesn't reach this element (its classes
 * are Delta-specific), so we handle it ourselves.
 */
function extractDeltaGreeting(doc: Document): string | null {
  const titleEl = doc.querySelector(
    ".skymiles-medallion-banner__details__container__left__title"
  );
  const text = titleEl?.textContent?.trim();
  if (!text) return null;
  const match = text.match(
    /^(?:hello|hi|welcome|good\s+(?:morning|afternoon|evening))\s*,\s*([A-Z][A-Za-z'’-]{1,30})/i
  );
  if (!match) return null;
  const first = match[1].split(/\s+/)[0].trim();
  return first || null;
}

/**
 * Delta surfaces a "SkyMiles # XXXXXXXXX" subtitle in the medallion banner
 * and a few other header-adjacent spots. We match a long all-digit block
 * within any node whose text contains "SkyMiles" and some digits.
 */
function extractSkyMilesNumber(doc: Document): string | null {
  const subtitles = doc.querySelectorAll(
    ".skymiles-medallion-banner__details__container__right__skymiles-wrapper__subtitle, " +
      ".skymiles-medallion-banner__details__container__right__skymiles-wrapper, " +
      "idp-login-wrapper, header"
  );
  for (const el of subtitles) {
    const text = el.textContent ?? "";
    const match = text.match(/(?:SkyMiles[^\d]*)?(\d{7,12})/);
    if (match) {
      const digits = match[1];
      // Avoid catching phone numbers or irrelevant digits — require "sky" nearby
      if (/sky\s*miles/i.test(text)) return digits;
    }
  }
  return null;
}
