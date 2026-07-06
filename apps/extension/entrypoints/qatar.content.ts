import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type { ScrapeResult, BalanceRecord } from "@points-geek/shared";

/**
 * qatarairways.com scraper — DOM-based with a programmatic click to
 * trigger Qatar's `partner/fetchSVB` API call.
 *
 * Why a click: Qatar's site renders the avatar flyout markup
 * (`#qmiles`, `#qpoints`, `#membershipnumber`, …) into every signed-in
 * page, but the values inside those elements only get filled in when
 * the user actually opens the flyout — opening it triggers the page's
 * own GET to `eisffp.qatarairways.com/ffp-services/partner/fetchSVB`,
 * which then writes the response into the DOM.
 *
 * We click the avatar ourselves, poll until both the balance AND the
 * membership number have populated (they arrive on different async
 * callbacks — balance from fetchSVB, membership from `verifyUser`), then
 * close the flyout. One click is enough: once Qatar's JS writes the
 * values into the DOM they stay there for the lifetime of the page,
 * so the only thing left to vary is *how long we wait*.
 *
 * Why not the API directly: Qatar's fetchSVB requires a body shape we
 * couldn't enumerate (multiple required field names like `cid`, `ffpNo`
 * we tried failed with `FFP_FFP_CID_MDT`), and the bearer
 * (`window.tokenDS`) lives in the page's main world — outside our
 * isolated content-script context. Driving the page's own click flow
 * sidesteps both problems.
 *
 * Two flavors of balance show up in the markup:
 *  - `#privilege_bal` — only on `/avios-balance.html`; Privilege Club
 *    balance only (excludes any linked British Airways Avios).
 *  - `#qmiles` — on every signed-in page's avatar flyout; the combined
 *    "Total Avios for flights" the user sees in the UI (PC + linked
 *    partners). For users without a linked partner the two are equal.
 */
const AVATAR_SELECTOR = ".login-block-avatar";
const FLYOUT_SELECTOR = ".profileflyout";
/** How long we wait for the page to enter logged-in state — i.e. for
 *  the QRTOKEN cookie to be set AND for the verifyUser callback to
 *  populate the avatar with the user's name. Without that, an avatar
 *  click would fire fetchSVB before the auth cookie is in place and
 *  the request would silently fail. */
const LOGIN_READY_TIMEOUT_MS = 20_000;
/** Total budget for `#qmiles` / `#privilege_bal` to populate AFTER
 *  the avatar click. Independent of the login-ready wait above. */
const POPULATE_TIMEOUT_MS = 15_000;

interface CompleteData {
  balance: number;
  source: string;
  membershipNumber: string;
}

export default defineContentScript({
  matches: ["https://www.qatarairways.com/*"],
  async main() {
    const start = performance.now();
    const url = window.location.href;
    extLogger.info("scrape.start", { provider: "qatar", url });

    // Wait for the page to fully enter logged-in state before doing
    // anything. The avatar element is in the DOM from the start, but
    // clicking it before:
    //   - The QRTOKEN cookie is set, AND
    //   - Qatar's `verifyUser` callback has run and populated names
    // …results in fetchSVB firing without an auth token (silently
    // fails) and `#membershipnumber` staying empty.
    //
    // Both signals settle within a couple seconds of page load, but
    // we wait up to 20s for slower connections / cold cache scenarios.
    const ready = await waitForLoggedInState(LOGIN_READY_TIMEOUT_MS);
    if (!ready) {
      extLogger.info("scrape.skipped", {
        provider: "qatar",
        reason: "login_state_timeout",
        hasQRToken: hasQRToken(),
        hasName: hasPopulatedUserName(),
      });
      return;
    }

    const avatar = document.querySelector<HTMLElement>(AVATAR_SELECTOR);
    if (!avatar) {
      extLogger.info("scrape.skipped", {
        provider: "qatar",
        reason: "no_avatar",
      });
      return;
    }

    // One click is enough — Qatar's JS writes the populated values
    // into the DOM and they stay there. Just keep polling until they
    // show up, then close the flyout.
    ensureFlyoutOpen(avatar);
    const data = await pollForCompleteData(POPULATE_TIMEOUT_MS);
    ensureFlyoutClosed(avatar);

    if (!data) {
      extLogger.info("scrape.skipped", {
        provider: "qatar",
        reason: whyMissing(),
      });
      return;
    }

    if (!(await syncWidget.start({ label: "Qatar" }))) return;

    const ownerLabel = extractFirstName(document);

    const balances: BalanceRecord[] = [
      {
        programKey: "qatar_avios",
        balance: data.balance,
        balanceType: "total",
        externalAccountId: `loyalty:${data.membershipNumber}`,
      },
    ];

    extLogger.info("scrape.success", {
      provider: "qatar",
      balance: data.balance,
      source: data.source,
      membershipNumber: data.membershipNumber,
      ownerLabel,
    });

    send({
      success: true,
      externalAccountId: `loyalty:${data.membershipNumber}`,
      ownerLabel,
      identifierSource: "customer_id",
      balances,
      cards: [],
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [
        "#privilege_bal",
        "#qmiles",
        "#membershipnumber",
        ".userNameLoggedIn",
      ],
      matchedSelector: data.source,
    });
  },
});

/**
 * Wait for the page to enter "logged-in and primed" state before we
 * start interacting with it.
 *
 * Two signals must both line up:
 *  1. **`QRTOKEN` cookie present** — Qatar's auth cookie. Without it
 *     the fetchSVB call our click triggers will fire without auth and
 *     silently return no data.
 *  2. **`.userNameLoggedIn` populated** — written by the `verifyUser`
 *     ajax callback. Same callback that populates `#membershipnumber`,
 *     so when this is filled in the membership number is too.
 *
 * Both settle within ~2 seconds of page load on a warm cache. The
 * timeout is 20s to handle a slow first paint right after login.
 */
async function waitForLoggedInState(timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    // A populated `.userNameLoggedIn` is the strongest "logged in AND primed"
    // signal: Qatar only writes it after its own verifyUser auth call succeeds,
    // which itself needs the token in place — so it subsumes the QRTOKEN check.
    // We used to AND-require the QRTOKEN cookie too, but Qatar appears to have
    // made it undetectable to document.cookie (HttpOnly), which made this time
    // out even while signed in. Keep QRTOKEN as an OR fallback in case the name
    // markup ever changes.
    if (hasPopulatedUserName() || hasQRToken()) return true;
    await sleep(300);
  }
  return false;
}

function hasQRToken(): boolean {
  return /(?:^|;\s*)QRTOKEN=[^;]+/.test(document.cookie);
}

function hasPopulatedUserName(): boolean {
  const el = document.querySelector<HTMLElement>(".userNameLoggedIn");
  const text = (el?.textContent ?? "").trim();
  // Server-rendered placeholder text is empty or just whitespace; a
  // real name is at least 2 chars and contains a letter.
  return text.length >= 2 && /[A-Za-z]/.test(text);
}

/**
 * Poll until both a balance number AND a membership number have
 * populated. Balance comes from `partner/fetchSVB` (triggered by the
 * click); membership number comes from `verifyUser` (fired earlier on
 * page load, but the value can lag the click-triggered fetch by a
 * beat). Both must be present before we report a success — without
 * the membership number we can't form a stable `externalAccountId`.
 */
async function pollForCompleteData(
  timeoutMs: number
): Promise<CompleteData | null> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const balanceInfo = readBalance();
    const membershipNumber = extractMembershipNumber(document);
    if (balanceInfo && membershipNumber) {
      return { ...balanceInfo, membershipNumber };
    }
    await sleep(300);
  }
  return null;
}

/** Try `#privilege_bal` first (Privilege Club only — most accurate);
 *  fall back to `#qmiles` (combined total in the avatar flyout). */
function readBalance(): { balance: number; source: string } | null {
  const PRIORITY = ["#privilege_bal", "#qmiles"];
  for (const sel of PRIORITY) {
    const el = document.querySelector<HTMLElement>(sel);
    const balance = parseInteger(el?.textContent ?? "");
    if (balance != null && balance > 0) {
      return { balance, source: sel };
    }
  }
  return null;
}

/**
 * After a failed poll, surface which piece was missing. Helps debug
 * when retries succeed — the log reason narrows down the slow signal.
 */
function whyMissing(): string {
  const haveBalance = readBalance() != null;
  const haveMembership = extractMembershipNumber(document) != null;
  if (!haveBalance && !haveMembership) return "no_balance_no_membership";
  if (!haveBalance) return "no_balance";
  return "no_membership_number";
}

/**
 * Open the flyout if it isn't already. We track state via the avatar's
 * `aria-expanded` attribute that Bootstrap toggles, so re-clicking on
 * an already-open flyout doesn't accidentally close it.
 */
function ensureFlyoutOpen(avatar: HTMLElement) {
  if (avatar.getAttribute("aria-expanded") !== "true") {
    avatar.click();
  }
}

/** Close the flyout if open. Try the explicit X button first
 *  (cleanest), fall back to clicking the avatar to toggle. */
function ensureFlyoutClosed(avatar: HTMLElement) {
  if (avatar.getAttribute("aria-expanded") !== "true") return;
  const closeBtn = document.querySelector<HTMLElement>(
    `${FLYOUT_SELECTOR} .dismissDropdown`
  );
  if (closeBtn) {
    closeBtn.click();
    return;
  }
  avatar.click();
}

function extractMembershipNumber(doc: Document): string | null {
  const el = doc.querySelector<HTMLElement>("#membershipnumber");
  const raw = el?.textContent ?? "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

/**
 * Multiple selectors expose the user's name across Qatar's pages:
 *  - `.userNameLoggedIn` — homepage avatar flyout, full name "Logan Yu"
 *  - `.usrLastname`      — Privilege Club pages, "Welcome, Mr. Logan"
 */
function extractFirstName(doc: Document): string | null {
  const fullNameEl = doc.querySelector<HTMLElement>(".userNameLoggedIn");
  const fullName = (fullNameEl?.textContent ?? "").trim();
  if (fullName) {
    const first = fullName.split(/\s+/)[0];
    if (first && /^[A-Z]/i.test(first)) return first;
  }

  const greetingEl = doc.querySelector<HTMLElement>(".usrLastname");
  const greeting = (greetingEl?.textContent ?? "").trim();
  const match = greeting.match(
    /welcome\s*,\s*(?:mr|mrs|ms|miss|dr)?\.?\s*([A-Z][A-Za-z'’-]{1,30})/i
  );
  return match ? match[1] : null;
}

function parseInteger(text: string): number | null {
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function waitForElement<T extends Element = Element>(
  doc: Document,
  selector: string,
  timeoutMs: number,
  intervalMs = 300
): Promise<T | null> {
  const immediate = doc.querySelector(selector) as T | null;
  if (immediate) return immediate;

  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += intervalMs;
      const el = doc.querySelector(selector) as T | null;
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, intervalMs);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(payload: ScrapeResult) {
  if (payload.success) {
    syncWidget.success("Avios synced");
  } else {
    syncWidget.fail({
      code: payload.error?.code,
      message: payload.error?.message,
    });
  }
  browser.runtime.sendMessage({
    type: payload.success ? "BALANCE_SCRAPED" : "SCRAPE_FAILED",
    provider: "qatar",
    payload,
  });
}
