/**
 * Best-effort "which logged-in account did we just scrape from" detection.
 *
 * The returned `externalAccountId` becomes the stable per-account key on
 * `points_programs.external_account_id`. We commit to a single strategy
 * per scrape — once a row exists for a given externalAccountId, later
 * scrapes that produce a DIFFERENT id will be treated as a separate
 * account (creating duplicate program rows). So pick whatever is most
 * stable that the page reliably exposes.
 *
 * Fallback strategy: email → customer id → display name + one card
 * last-four → greeting name → constant `"default"`. Card last-fours are
 * intentionally a bank-only fallback: they distinguish multiple issuer
 * logins when the site exposes no email/customer id. The server also
 * matches by card last-four overlap so normal card-list drift can keep
 * the same row even if a later scrape chooses a different card as the
 * account label.
 */

export interface IdentifierResult {
  externalAccountId: string;
  /**
   * Human-facing display label (first name or email local part). Null when
   * we couldn't extract a real name — we never fall back to a generic
   * "Account" string; the UI should render nothing in that case.
   */
  ownerLabel: string | null;
  source:
    | "email"
    | "customer_id"
    | "card_last_four"
    | "greeting_name"
    | "default";
}

/**
 * Scan common header / greeting elements for "Hello, X" / "Hi, X" / "Welcome, X".
 * Returns just the first-name portion (e.g. "Logan"), never a last name.
 *
 * The previous version was matching "Offer" out of marketing copy like
 * "Welcome, Offer of the week" — so we now:
 *   - require a word boundary before the greeting token
 *   - require a literal comma (not just whitespace) after it
 *   - require a capitalized first letter
 *   - filter out a small set of known-bad words that can slip through
 */
const GREETING_PATTERN =
  /^\s*(?:hello|hi|welcome(?:\s+back)?|good\s+(?:morning|afternoon|evening))\s*,\s*([A-Z][A-Za-z'’-]{1,30})/i;

const GREETING_SKIP = new Set([
  "offer",
  "offers",
  "deal",
  "deals",
  "member",
  "customer",
  "guest",
  "back",
  "you",
  "everyone",
  "friend",
  "user",
]);

export function tryExtractGreetingName(doc: Document): string | null {
  // Pass 1: targeted — fast path for elements whose attributes advertise
  // that they hold a greeting.
  const targeted = doc.querySelectorAll(
    'h1, h2, h3, ' +
      '[class*="greeting" i], [class*="welcome" i], [class*="hello" i], ' +
      '[class*="title__default" i], ' + // Delta medallion banner
      '[data-testid*="greeting" i], [data-locator-id*="greeting" i]'
  );
  for (const el of targeted) {
    const name = extractFromElement(el);
    if (name) return name;
  }

  // Pass 2: broad body scan for short text nodes matching the pattern.
  // Cap the scan so we don't walk an entire long page.
  const all = doc.body?.querySelectorAll("*") ?? [];
  const limit = Math.min(all.length, 1500);
  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const text = el.textContent?.trim();
    // Skip containers with large text blobs — the greeting is almost
    // always in a small leaf element.
    if (!text || text.length > 120) continue;
    const name = extractFromElement(el);
    if (name) return name;
  }

  return null;
}

function extractFromElement(el: Element): string | null {
  const text = el.textContent?.trim() ?? "";
  const match = text.match(GREETING_PATTERN);
  if (!match) return null;
  const first = match[1].split(/\s+/)[0].trim();
  if (!first) return null;
  if (GREETING_SKIP.has(first.toLowerCase())) return null;
  return first;
}

/** Any mailto: link on the page is our best shot at the account's email. */
export function tryExtractEmail(doc: Document): string | null {
  const mailto = doc.querySelector('a[href^="mailto:"]');
  if (!mailto) return null;
  const href = mailto.getAttribute("href") ?? "";
  const email = href.replace(/^mailto:/i, "").split("?")[0];
  return email.includes("@") ? email.trim() : null;
}

/** Deterministic bank fallback from display name + one scraped card last-four. */
export function accountCardIdFromCards(
  cards: Array<{ lastFour?: string }> | undefined,
  displayName?: string | null
): string | null {
  const name = normalizeDisplayName(displayName);
  for (const card of cards ?? []) {
    const normalized = normalizeLastFour(card.lastFour);
    if (normalized) {
      return name ? `card:${name}:${normalized}` : `card:${normalized}`;
    }
  }
  return null;
}

function normalizeLastFour(value: string | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

/**
 * Resolve an identifier with the canonical fallback chain:
 * email → customer id → display name + one card last-four → greeting →
 * constant `"default"`. Callers can pass pre-extracted values (e.g. a
 * provider-specific loyalty number) by filling `override`.
 *
 * Machine identifier (externalAccountId) and display label (ownerLabel)
 * are chosen independently — so we can key a Delta scrape on the
 * SkyMiles number while still displaying "Logan" from the greeting.
 */
export function resolveIdentifier(
  doc: Document,
  override?: {
    email?: string | null;
    customerId?: string | null;
    greetingName?: string | null;
    cards?: Array<{ lastFour?: string }>;
  }
): IdentifierResult {
  const email = override?.email ?? tryExtractEmail(doc);
  const greeting = override?.greetingName ?? tryExtractGreetingName(doc);
  const cardAccountId = accountCardIdFromCards(override?.cards, greeting);

  let externalAccountId: string;
  let source: IdentifierResult["source"];
  if (email) {
    externalAccountId = email.toLowerCase();
    source = "email";
  } else if (override?.customerId) {
    externalAccountId = `id:${override.customerId}`;
    source = "customer_id";
  } else if (cardAccountId) {
    externalAccountId = cardAccountId;
    source = "card_last_four";
  } else if (greeting) {
    externalAccountId = `name:${greeting.toLowerCase()}`;
    source = "greeting_name";
  } else {
    // No reliable identifier. Use a constant so one logged-in account
    // reuses the same row across scrapes. Trade-off: if the user later
    // signs into a second account and the site exposes no email, id, or
    // cards, its scrape will overwrite the first.
    externalAccountId = "default";
    source = "default";
  }

  let ownerLabel: string | null;
  if (greeting) {
    ownerLabel = greeting;
  } else if (email) {
    ownerLabel = email.split("@")[0];
  } else {
    ownerLabel = null;
  }

  return { externalAccountId, ownerLabel, source };
}
