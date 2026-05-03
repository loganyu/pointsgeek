import { resolveIdentifier } from "../lib/identifier";
import { extLogger } from "../lib/logger";
import { syncWidget } from "../lib/sync-widget";
import type {
  ScrapeResult,
  BalanceRecord,
  DiscoveredCard,
} from "@points-geek/shared";

/**
 * Capital One scraper — calls the customer-facing JSON APIs directly.
 *
 *   GET /web-api/protected/636178/customer-accounts
 *     → list of every account on the profile (credit cards + deposits)
 *       with branding.images.cardArt URLs and product names.
 *
 *   POST /web-api/protected/375751/loyalty/accounts/digital-account-view/get-accounts
 *     → loyaltyTile.balances[0].balance (pool total miles) +
 *       per-account balances for cards that earn miles.
 *
 * Auth is cookie-based — Capital One's session cookies (`C1_AMT`,
 * `C1_AuthSrc`, etc.) ride along automatically with `credentials:
 * "include"`. No bearer extraction.
 *
 * The two paths share `accountReferenceId` so we merge them: walk
 * customer-accounts for cards, look up each card's miles balance from
 * the loyalty map. Cash-back cards (Quicksilver) appear in
 * customer-accounts but not in loyalty — they get card art with no
 * balance. Miles-earning cards (Venture/VentureOne/Venture X) appear
 * in both.
 *
 * The two numeric segments in the URL paths (`636178`, `375751`) are
 * Capital One's API-gateway consumer IDs — they identify the calling
 * web client to the gateway and are stable across users. If they ever
 * rotate, scrape will fail and we'd need to extract them from the
 * page's own outgoing requests.
 */
const CUSTOMER_ACCOUNTS_URL =
  "https://myaccounts.capitalone.com/web-api/protected/636178/customer-accounts?density=4&retrieveBusinessName=true&versionUpgrade=true";
const LOYALTY_ACCOUNTS_URL =
  "https://myaccounts.capitalone.com/web-api/protected/375751/loyalty/accounts/digital-account-view/get-accounts?include=LOYALTY_TILE,PARTNER_DETAILS";

interface CustomerAccount {
  accountReferenceId: string;
  lastFour?: string;
  businessLine?: string;
  product?: { productName?: string; productId?: string };
  branding?: {
    images?: {
      cardArt?: { assetLocationUrl?: string } | null;
      smallBackgroundImage?: { assetLocationUrl?: string } | null;
    } | null;
  };
}

interface CustomerAccountsResponse {
  entries?: CustomerAccount[];
}

interface LoyaltyBalance {
  balance?: number;
  loyaltyCurrencyCode?: string;
}

interface LoyaltyAccount {
  accountReferenceId?: string;
  balance?: LoyaltyBalance;
}

interface LoyaltyResponse {
  loyaltyTile?: { balances?: LoyaltyBalance[] };
  accounts?: LoyaltyAccount[];
}

export default defineContentScript({
  matches: [
    "https://myaccounts.capitalone.com/*",
    "https://verified.capitalone.com/*",
  ],
  async main() {
    const url = window.location.href;
    const isSummaryPage = /\/accountSummary/i.test(url);
    extLogger.info("scrape.start", {
      provider: "capitalone",
      url,
      isSummaryPage,
    });

    // The APIs only return useful data when the user is on the post-
    // login summary page. Other pages (verified.capitalone.com auth
    // gate, individual card pages, transfer flows, etc.) silently skip
    // — the next /accountSummary visit will pick up the data.
    if (!isSummaryPage) {
      extLogger.info("scrape.skipped", {
        provider: "capitalone",
        reason: "not_summary_page",
      });
      return;
    }

    syncWidget.start({ label: "Capital One" });
    const start = performance.now();

    // Sequential, not parallel — the loyalty endpoint requires the
    // account references in its body, which we get from the customer-
    // accounts response.
    const customerAccounts = await fetchCustomerAccounts();
    if (!customerAccounts) {
      extLogger.warn("scrape.failed", {
        provider: "capitalone",
        reason: "customer_accounts_failed",
      });
      sendResult({
        success: false,
        error: {
          code: "API_ERROR",
          message: "Capital One customer-accounts request failed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [CUSTOMER_ACCOUNTS_URL],
      });
      return;
    }

    // Collect credit-card refs + their product IDs. The loyalty
    // endpoint requires both per entry — `accountReferenceId` IDs the
    // account, `productLineId` (= `product.productId` from customer-
    // accounts) tells the gateway which product schema to apply.
    const creditCardQueries: LoyaltyQuery[] = [];
    for (const e of customerAccounts.entries ?? []) {
      if (e.businessLine !== "CREDIT_CARDS") continue;
      const ref = e.accountReferenceId;
      const productId = e.product?.productId;
      if (typeof ref !== "string" || !ref || !productId) continue;
      creditCardQueries.push({
        accountReferenceId: ref,
        productLineId: productId,
      });
    }

    const loyalty = await fetchLoyaltyAccounts(creditCardQueries);
    if (!loyalty) {
      extLogger.warn("scrape.failed", {
        provider: "capitalone",
        reason: "loyalty_failed",
        refCount: creditCardRefs.length,
      });
      sendResult({
        success: false,
        error: {
          code: "API_ERROR",
          message: "Capital One loyalty request failed",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [LOYALTY_ACCOUNTS_URL],
      });
      return;
    }

    // Pool total miles (sum across miles-earning cards). Loyalty tile
    // shows MILES; ignore other currencies (cash-back, etc).
    const poolBalance = pickMilesBalance(loyalty.loyaltyTile?.balances);

    // Per-card balance map keyed by accountReferenceId. Only includes
    // accounts whose currency is MILES; cash-back cards return no
    // entry and we just don't emit a per-card record for them.
    const balanceByRef = new Map<string, number>();
    for (const acc of loyalty.accounts ?? []) {
      const ref = acc.accountReferenceId;
      const bal = pickMilesBalance(acc.balance ? [acc.balance] : []);
      if (ref && bal != null) {
        balanceByRef.set(ref, bal);
      }
    }

    if (poolBalance == null && balanceByRef.size === 0) {
      extLogger.warn("scrape.failed", {
        provider: "capitalone",
        reason: "no_miles_in_response",
      });
      sendResult({
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: "Capital One loyalty response had no MILES data",
        },
        durationMs: Math.round(performance.now() - start),
        selectorsAttempted: [LOYALTY_ACCOUNTS_URL],
      });
      return;
    }

    // Walk customer-accounts entries → emit cards + per-card balances.
    const cards: DiscoveredCard[] = [];
    const balances: BalanceRecord[] = [];

    // Pool total comes from the tile, not any single account. Emit it
    // first as the canonical "Capital One Miles" balance.
    if (poolBalance != null) {
      balances.push({
        programKey: "capitalone_miles",
        balance: poolBalance,
        balanceType: "total",
        // No linkedCard — pool sum.
      });
    }

    const skippedNonCreditCards: string[] = [];
    for (const account of customerAccounts.entries ?? []) {
      // Skip non-credit-card products (360 Checking, savings, etc).
      if (account.businessLine !== "CREDIT_CARDS") {
        if (account.businessLine) skippedNonCreditCards.push(account.businessLine);
        continue;
      }

      const cardName = account.product?.productName?.trim();
      const lastFour = account.lastFour?.trim() || undefined;
      const imageUrl = account.branding?.images?.cardArt?.assetLocationUrl;
      if (!cardName) continue;

      cards.push({
        cardName,
        lastFour,
        issuer: "capitalone",
        programKey: "capitalone_miles",
        imageUrl,
      });

      // Per-card miles, if the loyalty endpoint had this account.
      const perCardBalance = balanceByRef.get(account.accountReferenceId);
      if (perCardBalance != null) {
        balances.push({
          programKey: "capitalone_miles",
          balance: perCardBalance,
          balanceType: "total",
          linkedCard: { cardName, lastFour },
        });
      }
    }

    const ident = resolveIdentifier(document);

    extLogger.info("scrape.success", {
      provider: "capitalone",
      poolBalance,
      perCardBalanceCount: balanceByRef.size,
      cardCount: cards.length,
      skippedNonCreditCards: skippedNonCreditCards.length,
      cards: cards.map((c) => ({
        cardName: c.cardName,
        lastFour: c.lastFour,
        imageUrl: c.imageUrl ?? null,
      })),
      externalAccountId: ident.externalAccountId,
      identifierSource: ident.source,
    });

    sendResult({
      success: true,
      externalAccountId: ident.externalAccountId,
      ownerLabel: ident.ownerLabel,
      identifierSource: ident.source,
      balances,
      cards,
      durationMs: Math.round(performance.now() - start),
      selectorsAttempted: [CUSTOMER_ACCOUNTS_URL, LOYALTY_ACCOUNTS_URL],
      matchedSelector: CUSTOMER_ACCOUNTS_URL,
    });
  },
});

/**
 * Pick the first balance whose `loyaltyCurrencyCode === "MILES"` from
 * an array. Capital One mixes cash-back balances into the same payload
 * shape, and we only track miles in `capitalone_miles`.
 */
function pickMilesBalance(
  balances: LoyaltyBalance[] | undefined
): number | null {
  if (!balances) return null;
  for (const b of balances) {
    if (b.loyaltyCurrencyCode === "MILES" && typeof b.balance === "number") {
      return Math.round(b.balance);
    }
  }
  return null;
}

async function fetchCustomerAccounts(): Promise<CustomerAccountsResponse | null> {
  return fetchJson<CustomerAccountsResponse>(CUSTOMER_ACCOUNTS_URL, {
    method: "GET",
    headers: {
      // Same Accept Capital One's web app uses — version pinning matters.
      accept: "application/json;v=1",
      "accept-language": "en-US",
      "c1-card-accept-language": "en-US",
      "c1-xhr": "true",
      "channel-type": "WEB",
      "content-type": "application/json;v=1",
      "x-ui-routing-id": "accountSummary",
    },
  });
}

interface LoyaltyQuery {
  accountReferenceId: string;
  productLineId: string;
}

async function fetchLoyaltyAccounts(
  accountQueryList: LoyaltyQuery[]
): Promise<LoyaltyResponse | null> {
  // Body shape captured from the page's actual request:
  //   {"accountQueryList": [{"accountReferenceId": "…", "productLineId": "…"}, ...]}
  // `productLineId` matches `product.productId` from the customer-
  // accounts response (e.g. "1057" Quicksilver, "1213" Venture X).
  return fetchJson<LoyaltyResponse>(LOYALTY_ACCOUNTS_URL, {
    method: "POST",
    headers: {
      accept: "application/json;v=2",
      "accept-language": "en-US",
      "api-key": "EASE",
      "content-type": "application/json",
      "x-ui-routing-id": "accountSummary",
    },
    body: JSON.stringify({ accountQueryList }),
  });
}

async function fetchJson<T>(
  url: string,
  init: RequestInit
): Promise<T | null> {
  try {
    const r = await fetch(url, {
      credentials: "include",
      ...init,
    });
    if (!r.ok) {
      extLogger.warn("scrape.fetch_non_ok", {
        provider: "capitalone",
        url,
        status: r.status,
      });
      return null;
    }
    return (await r.json()) as T;
  } catch (err) {
    extLogger.warn("scrape.fetch_error", {
      provider: "capitalone",
      url,
      error: String(err),
    });
    return null;
  }
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
    provider: "capitalone",
    payload,
  });
}
