import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  balanceSnapshots,
  cards,
  pointsPrograms,
  scrapeEvents,
} from "@/lib/db/schema";
import { verifyExtensionToken } from "@/lib/jwt";
import { auth } from "@/lib/auth";
import { balancePayloadSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";
import {
  PROGRAM_CATALOG,
  type ProgramKey,
  type BalanceRecord,
  type DiscoveredCard,
  type Provider,
} from "@points-geek/shared";

/**
 * Multi-program balance ingest.
 *
 *   1. Always write a `scrape_events` row for telemetry.
 *   2. If the scrape failed or carries no balances, stop there.
 *   3. Otherwise:
 *      a) upsert a `points_programs` row for every distinct
 *         (user, programKey, externalAccountId) combo.
 *      b) upsert every discovered `cards` row under its program.
 *      c) for each balance, resolve (programId, cardId), apply the
 *         daily-dedup rule (skip if latest row on UTC today has the
 *         same balance), and insert if it changed.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const tokenResult = await verifyExtensionToken(authHeader.slice(7));
  if (!tokenResult) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const parsed = balancePayloadSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ errors: parsed.error.issues }, "Invalid balance payload");
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    provider,
    externalAccountId,
    ownerLabel,
    scrapedAt,
    balances,
    cards: discoveredCards,
    scrapeEvent,
  } = parsed.data;
  const userId = tokenResult.userId;

  try {
    // 1. Always log the scrape attempt
    await db.insert(scrapeEvents).values({
      userId,
      provider,
      success: scrapeEvent.success,
      errorCode: scrapeEvent.errorCode ?? null,
      errorMessage: scrapeEvent.errorMessage ?? null,
      durationMs: scrapeEvent.durationMs,
      extensionVersion: scrapeEvent.extensionVersion,
      matchedSelector: scrapeEvent.matchedSelector ?? null,
      selectorsAttempted: JSON.stringify(scrapeEvent.selectorsAttempted),
      userAgent: req.headers.get("user-agent"),
    });

    // 1b. On failure, flag any programs this account owns as failed so the
    //     web app can surface a per-row "sync failed" badge. Best-effort:
    //     we match on (userId, externalAccountId) which covers the common
    //     case but may miss programs whose id was later upgraded to a
    //     `loyalty:...` fingerprint — acceptable for the v1 indicator.
    if (!scrapeEvent.success && externalAccountId) {
      await db
        .update(pointsPrograms)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: "failed",
          lastSyncError:
            scrapeEvent.errorCode ??
            scrapeEvent.errorMessage ??
            "unknown_error",
        })
        .where(
          and(
            eq(pointsPrograms.userId, userId),
            eq(pointsPrograms.externalAccountId, externalAccountId)
          )
        );
    }

    // 2. Nothing to persist if the scrape failed or carried neither
    //    balances nor cards. A partial success (cards but no balances)
    //    still falls through — we want the cards+program rows even if
    //    the rewards-tile extraction didn't land.
    const hasCards = (discoveredCards?.length ?? 0) > 0;
    if (!scrapeEvent.success || (balances.length === 0 && !hasCards)) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (!externalAccountId) {
      return NextResponse.json(
        { error: "Successful scrapes must include externalAccountId" },
        { status: 400 }
      );
    }

    // 3a. Determine which externalAccountId each program will key on.
    //
    // A balance can override the scrape-wide `externalAccountId` with its
    // own (e.g., Amex's Delta tile stamps "loyalty:<SkyMiles#>" so that
    // the same Delta account reported via amex.com and delta.com dedupes
    // into a single `points_programs` row).
    const accountByProgramKey = new Map<ProgramKey, string>();
    for (const b of balances) {
      if (b.externalAccountId) {
        // First write wins — scrapers shouldn't emit conflicting ids for
        // the same program in a single scrape, but if they do, trust the first.
        if (!accountByProgramKey.has(b.programKey)) {
          accountByProgramKey.set(b.programKey, b.externalAccountId);
        }
      }
    }
    for (const b of balances) {
      if (!accountByProgramKey.has(b.programKey)) {
        accountByProgramKey.set(b.programKey, externalAccountId);
      }
    }
    for (const c of discoveredCards ?? []) {
      if (c.programKey && !accountByProgramKey.has(c.programKey)) {
        accountByProgramKey.set(c.programKey, externalAccountId);
      }
    }

    // Collect payload-side last-fours per programKey so we can dedup against
    // an existing program via card identity. Chase's partner page reports
    // the same card (e.g. United Gateway ...8072) as united.com/myunited;
    // without this step the two scrapers would spawn separate
    // `united_mileageplus` rows since only united.com knows the
    // MileagePlus number.
    const lastFoursByProgramKey = new Map<ProgramKey, Set<string>>();
    for (const c of discoveredCards ?? []) {
      if (!c.programKey || !c.lastFour) continue;
      if (!lastFoursByProgramKey.has(c.programKey)) {
        lastFoursByProgramKey.set(c.programKey, new Set());
      }
      lastFoursByProgramKey.get(c.programKey)!.add(c.lastFour);
    }
    for (const b of balances) {
      const lf = b.linkedCard?.lastFour;
      if (!lf) continue;
      if (!lastFoursByProgramKey.has(b.programKey)) {
        lastFoursByProgramKey.set(b.programKey, new Set());
      }
      lastFoursByProgramKey.get(b.programKey)!.add(lf);
    }

    // Program-level total balances per programKey — the landing-page flow
    // (united.com nav-bar) has a miles figure but no cards, so card-based
    // dedup can't help it converge with a program that was first created
    // by the chaseloyalty scraper. Matching on the most recent program
    // total is the secondary signal. Per-card balances are excluded — they
    // can coincide across accounts for a given card and aren't a reliable
    // account identifier.
    const programTotalsByKey = new Map<ProgramKey, number[]>();
    for (const b of balances) {
      if (b.linkedCard) continue;
      if (b.balanceType !== "total") continue;
      if (!programTotalsByKey.has(b.programKey)) {
        programTotalsByKey.set(b.programKey, []);
      }
      programTotalsByKey.get(b.programKey)!.push(b.balance);
    }

    const programIdByKey = new Map<ProgramKey, string>();
    for (const [programKey, accountId] of accountByProgramKey) {
      const lastFours = Array.from(lastFoursByProgramKey.get(programKey) ?? []);
      const programTotals = programTotalsByKey.get(programKey) ?? [];
      const id = await resolveProgramId({
        userId,
        programKey,
        externalAccountId: accountId,
        ownerLabel,
        payloadLastFours: lastFours,
        payloadProgramTotals: programTotals,
      });
      programIdByKey.set(programKey, id);
    }

    // Mark every program this scrape touched as successfully synced. The
    // snapshot write below may still dedupe (same balance as today), but
    // we still want to stamp "we heard from this program just now" so the
    // UI stops showing a stale/failed indicator.
    const touchedProgramIds = Array.from(new Set(programIdByKey.values()));
    if (touchedProgramIds.length > 0) {
      await db
        .update(pointsPrograms)
        .set({
          lastSyncAt: new Date(scrapedAt),
          lastSyncStatus: "ok",
          lastSyncError: null,
        })
        .where(inArray(pointsPrograms.id, touchedProgramIds));
    }

    // 3b. Upsert all discovered cards (idempotent; safe to call repeatedly)
    for (const card of discoveredCards ?? []) {
      if (!card.programKey) continue; // can't place it without a program
      const programId = programIdByKey.get(card.programKey);
      if (!programId) continue;
      await upsertCard(userId, programId, card);
    }

    // 3c. For each balance: resolve FKs, dedup, insert
    const scrapedAtDate = new Date(scrapedAt);
    let insertedCount = 0;
    let skippedDedupCount = 0;

    for (const bal of balances) {
      const programId = programIdByKey.get(bal.programKey);
      if (!programId) continue;

      let cardId: string | null = null;
      if (bal.linkedCard) {
        // Ensure the card exists (even if it wasn't in payload.cards)
        cardId = await upsertCard(userId, programId, {
          cardName: bal.linkedCard.cardName,
          lastFour: bal.linkedCard.lastFour,
          issuer: inferIssuerFromProgram(bal.programKey, provider),
          programKey: bal.programKey,
        });
      }

      const decision = await computeSnapshotAction({
        userId,
        programId,
        cardId,
        balanceType: bal.balanceType,
        newBalance: bal.balance,
      });

      if (decision.action === "bump") {
        // Same-day, same-balance. Bump the latest row so the dashboard
        // shows a fresh "last updated" timestamp instead of staleness.
        await db
          .update(balanceSnapshots)
          .set({ scrapedAt: scrapedAtDate, receivedAt: new Date() })
          .where(eq(balanceSnapshots.id, decision.rowId));
        skippedDedupCount++;
        continue;
      }

      await db.insert(balanceSnapshots).values({
        userId,
        provider,
        programId,
        cardId,
        balance: BigInt(bal.balance),
        balanceType: bal.balanceType,
        scrapedAt: scrapedAtDate,
      });
      insertedCount++;
    }

    // 3d. For programs whose pool total = sum of per-card balances
    //     (Chase UR), recompute the pool whenever a per-card balance
    //     moves. Chase users freely transfer points between cards, and
    //     the individual-card pages only report one card at a time —
    //     without this step, visiting a single card's page would leave
    //     the dashboard showing a stale pool total.
    const programsToRecompute = new Set<string>();
    for (const bal of balances) {
      if (bal.programKey !== "chase_ur") continue;
      if (!bal.linkedCard) continue;
      const programId = programIdByKey.get(bal.programKey);
      if (programId) programsToRecompute.add(programId);
    }
    for (const programId of programsToRecompute) {
      const recomputed = await recomputePoolTotal({
        userId,
        programId,
        provider,
        scrapedAt: scrapedAtDate,
      });
      if (recomputed) insertedCount++;
    }

    logger.info(
      {
        userId,
        provider,
        success: scrapeEvent.success,
        balanceCount: balances.length,
        insertedCount,
        skippedDedupCount,
        durationMs: Date.now() - start,
      },
      "Balance payload processed"
    );

    return NextResponse.json(
      { ok: true, inserted: insertedCount, skipped: skippedDedupCount },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err, userId, provider }, "Failed to process balance payload");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select({
      id: balanceSnapshots.id,
      provider: balanceSnapshots.provider,
      balance: balanceSnapshots.balance,
      balanceType: balanceSnapshots.balanceType,
      programId: balanceSnapshots.programId,
      cardId: balanceSnapshots.cardId,
      scrapedAt: balanceSnapshots.scrapedAt,
    })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, session.user.id))
    .orderBy(desc(balanceSnapshots.scrapedAt))
    .limit(10);

  return NextResponse.json(
    results.map((r) => ({ ...r, balance: r.balance.toString() }))
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

/**
 * Pick the program row for a (user, programKey) landing in this scrape.
 *
 * Three-stage lookup:
 *   1. Card last-four overlap — if the payload mentions a card whose
 *      last-four already belongs to a card under an existing program
 *      (same user + programKey), reuse that program. Covers
 *      chaseloyalty + /myunited agreeing on "Gateway …8072".
 *   2. Program-level total balance — when no card overlap is possible
 *      (e.g., the united.com landing page reports miles but no card),
 *      reuse an existing program whose most recent program-level total
 *      equals a balance in this payload. Zero-balance doesn't count
 *      (two fresh accounts would falsely merge). Implicit assumption:
 *      the user hasn't spent points between the two scrapes.
 *   3. Fall back to (user, programKey, externalAccountId) and insert
 *      if nothing exists.
 *
 * Whenever a match is found, we opportunistically upgrade the existing
 * program's `externalAccountId` to a `loyalty:…` id when the payload
 * supplies one, and fill in a missing `ownerLabel`.
 */
async function resolveProgramId(args: {
  userId: string;
  programKey: ProgramKey;
  externalAccountId: string;
  ownerLabel: string | null | undefined;
  payloadLastFours: string[];
  payloadProgramTotals: number[];
}): Promise<string> {
  const {
    userId,
    programKey,
    externalAccountId,
    ownerLabel,
    payloadLastFours,
    payloadProgramTotals,
  } = args;

  const match =
    (await findProgramByCardLastFour(userId, programKey, payloadLastFours)) ??
    (await findProgramByLatestTotal(userId, programKey, payloadProgramTotals));

  if (match) {
    const nextExternalId = preferExternalAccountId(
      match.currentExternalId,
      externalAccountId
    );
    const nextOwnerLabel = preferOwnerLabel(
      match.currentOwnerLabel,
      ownerLabel
    );
    if (
      nextExternalId !== match.currentExternalId ||
      nextOwnerLabel !== match.currentOwnerLabel
    ) {
      await db
        .update(pointsPrograms)
        .set({
          externalAccountId: nextExternalId,
          ownerLabel: nextOwnerLabel,
        })
        .where(eq(pointsPrograms.id, match.programId));
      logger.info(
        {
          userId,
          programKey,
          via: match.via,
          from: match.currentExternalId,
          to: nextExternalId,
        },
        "Program consolidated"
      );
    }
    return match.programId;
  }

  return upsertProgramByExternalId(
    userId,
    programKey,
    externalAccountId,
    ownerLabel
  );
}

interface ExistingProgramMatch {
  programId: string;
  currentExternalId: string;
  currentOwnerLabel: string | null;
  via: "card_last4" | "latest_total";
}

async function findProgramByCardLastFour(
  userId: string,
  programKey: ProgramKey,
  lastFours: string[]
): Promise<ExistingProgramMatch | null> {
  if (lastFours.length === 0) return null;
  const rows = await db
    .select({
      programId: cards.programId,
      currentExternalId: pointsPrograms.externalAccountId,
      currentOwnerLabel: pointsPrograms.ownerLabel,
    })
    .from(cards)
    .innerJoin(pointsPrograms, eq(cards.programId, pointsPrograms.id))
    .where(
      and(
        eq(cards.userId, userId),
        eq(pointsPrograms.programKey, programKey),
        inArray(cards.lastFour, lastFours)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, via: "card_last4" };
}

/**
 * Look for an existing program whose most recent program-level total
 * matches any balance in the payload. Used as the tie-breaker when no
 * card overlap is available (e.g. the united.com landing page scrape,
 * which reports miles but no Chase card list).
 *
 * Only non-zero balances qualify — matching at zero would merge two
 * brand-new accounts that simply haven't earned miles yet.
 */
async function findProgramByLatestTotal(
  userId: string,
  programKey: ProgramKey,
  balances: number[]
): Promise<ExistingProgramMatch | null> {
  const candidates = Array.from(new Set(balances)).filter((b) => b > 0);
  if (candidates.length === 0) return null;

  const programs = await db
    .select({
      id: pointsPrograms.id,
      externalAccountId: pointsPrograms.externalAccountId,
      ownerLabel: pointsPrograms.ownerLabel,
    })
    .from(pointsPrograms)
    .where(
      and(
        eq(pointsPrograms.userId, userId),
        eq(pointsPrograms.programKey, programKey)
      )
    );

  for (const program of programs) {
    const latest = await db
      .select({ balance: balanceSnapshots.balance })
      .from(balanceSnapshots)
      .where(
        and(
          eq(balanceSnapshots.userId, userId),
          eq(balanceSnapshots.programId, program.id),
          isNull(balanceSnapshots.cardId),
          eq(balanceSnapshots.balanceType, "total")
        )
      )
      .orderBy(desc(balanceSnapshots.scrapedAt))
      .limit(1);
    if (latest.length === 0) continue;
    const latestBalance = Number(latest[0].balance);
    if (candidates.includes(latestBalance)) {
      return {
        programId: program.id,
        currentExternalId: program.externalAccountId,
        currentOwnerLabel: program.ownerLabel,
        via: "latest_total",
      };
    }
  }
  return null;
}

/**
 * Pick the "better" externalAccountId when we find an existing program via
 * card last4 and the scrape supplies a different id. `loyalty:…` — the
 * stable loyalty-account number — always wins. Otherwise the existing id
 * sticks so we don't bounce back and forth between e.g. `email` and
 * `name:…` just because two scrapers disagree on what's visible.
 */
function preferExternalAccountId(
  current: string,
  incoming: string
): string {
  if (current === incoming) return current;
  if (incoming.startsWith("loyalty:")) return incoming;
  return current;
}

/**
 * Upgrade owner label when a scraper supplies a longer one.
 *
 * Providers' APIs differ on how much name they hand us — Marriott's
 * /userDetails gives just "Logan" while /session adds the last name for
 * "Logan Yu"; Amex's greeting is usually first-name only. Picking the
 * longer string lets a later fuller-name scrape replace an earlier
 * short one, while a later short-name scrape leaves the full name
 * alone. Blank / null on either side keeps whichever is present.
 */
function preferOwnerLabel(
  current: string | null,
  incoming: string | null | undefined
): string | null {
  const cur = current?.trim() || null;
  const inc = incoming?.trim() || null;
  if (!inc) return cur;
  if (!cur) return inc;
  return inc.length > cur.length ? inc : cur;
}

async function upsertProgramByExternalId(
  userId: string,
  programKey: ProgramKey,
  externalAccountId: string,
  ownerLabel: string | null | undefined
): Promise<string> {
  const existing = await db
    .select({
      id: pointsPrograms.id,
      ownerLabel: pointsPrograms.ownerLabel,
    })
    .from(pointsPrograms)
    .where(
      and(
        eq(pointsPrograms.userId, userId),
        eq(pointsPrograms.programKey, programKey),
        eq(pointsPrograms.externalAccountId, externalAccountId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const nextOwnerLabel = preferOwnerLabel(row.ownerLabel, ownerLabel);
    if (nextOwnerLabel !== row.ownerLabel) {
      await db
        .update(pointsPrograms)
        .set({ ownerLabel: nextOwnerLabel })
        .where(eq(pointsPrograms.id, row.id));
    }
    return row.id;
  }

  const meta = PROGRAM_CATALOG[programKey];
  const inserted = await db
    .insert(pointsPrograms)
    .values({
      userId,
      programKey,
      externalAccountId,
      ownerLabel: ownerLabel ?? null,
      programType: meta.programType,
    })
    .returning({ id: pointsPrograms.id });

  logger.info(
    { userId, programKey, externalAccountId, ownerLabel },
    "Program created"
  );
  return inserted[0].id;
}

async function upsertCard(
  userId: string,
  programId: string,
  card: DiscoveredCard
): Promise<string> {
  // When we know the card's trailing digits, match on
  // (userId, programId, lastFour) alone — card names vary slightly
  // between scrape sources (e.g. Chase's /home says "Freedom Flex"
  // while /account-selector says "Chase Freedom FlexSM"), and the
  // digits are the reliable identity. When lastFour is unknown, fall
  // back to matching on the name plus a NULL last_four so we don't
  // collide with a fully-numbered duplicate.
  const existing = await db
    .select({
      id: cards.id,
      imageUrl: cards.imageUrl,
      imageSlug: cards.imageSlug,
    })
    .from(cards)
    .where(
      and(
        eq(cards.userId, userId),
        eq(cards.programId, programId),
        card.lastFour
          ? eq(cards.lastFour, card.lastFour)
          : and(eq(cards.cardName, card.cardName), isNull(cards.lastFour))
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Backfill a scraped image URL if we've learned one since the card was
    // first created. Never overwrite a user-set slug.
    const row = existing[0];
    if (card.imageUrl && !row.imageUrl) {
      await db
        .update(cards)
        .set({ imageUrl: card.imageUrl })
        .where(eq(cards.id, row.id));
    }
    return row.id;
  }

  const inserted = await db
    .insert(cards)
    .values({
      userId,
      programId,
      cardName: card.cardName,
      lastFour: card.lastFour ?? null,
      issuer: card.issuer,
      imageSlug: card.imageSlug ?? null,
      imageUrl: card.imageUrl ?? null,
    })
    .returning({ id: cards.id });

  logger.info(
    {
      userId,
      programId,
      cardName: card.cardName,
      lastFour: card.lastFour,
      hasImageUrl: !!card.imageUrl,
    },
    "Card created"
  );
  return inserted[0].id;
}

/**
 * Decide what to do with an incoming snapshot:
 *
 *   `insert` — no prior row for this balance key, OR the latest is from
 *   a different UTC day, OR the balance has changed.
 *
 *   `bump` — same UTC day + same balance as the latest row. Caller
 *   should bump that row's `scrapedAt`/`receivedAt` instead of inserting
 *   a duplicate. This keeps row count efficient while still advancing
 *   the dashboard's "last updated" timestamp — without this, stable
 *   programs like Marriott would look stale between daily visits even
 *   when a scrape actually happened.
 */
async function computeSnapshotAction(args: {
  userId: string;
  programId: string;
  cardId: string | null;
  balanceType: "total" | "ytd_earned_on_card";
  newBalance: number;
}): Promise<{ action: "insert" } | { action: "bump"; rowId: number }> {
  const { userId, programId, cardId, balanceType, newBalance } = args;

  const latest = await db
    .select({
      id: balanceSnapshots.id,
      balance: balanceSnapshots.balance,
      scrapedAt: balanceSnapshots.scrapedAt,
    })
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.userId, userId),
        eq(balanceSnapshots.programId, programId),
        cardId
          ? eq(balanceSnapshots.cardId, cardId)
          : isNull(balanceSnapshots.cardId),
        eq(balanceSnapshots.balanceType, balanceType)
      )
    )
    .orderBy(desc(balanceSnapshots.scrapedAt))
    .limit(1);

  if (latest.length === 0) return { action: "insert" };

  const row = latest[0];
  const sameDayUtc = isSameUtcDay(row.scrapedAt, new Date());
  const sameBalance = BigInt(row.balance) === BigInt(newBalance);
  if (sameDayUtc && sameBalance) {
    return { action: "bump", rowId: row.id };
  }
  return { action: "insert" };
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * When a balance record references a linkedCard that wasn't enumerated in
 * payload.cards[], we still need an issuer to create it. Best effort:
 * infer from the program brand + provider. Amex-issued Marriott cards
 * have issuer=amex, not marriott — so fall back to provider when the
 * program's brand is an airline/hotel (since those aren't card issuers).
 */
function inferIssuerFromProgram(
  programKey: ProgramKey,
  provider: string
): string {
  const meta = PROGRAM_CATALOG[programKey];
  const brand = meta.brandSlug;
  // amex, chase, capitalone are the only slugs that are also issuers
  if (brand === "amex" || brand === "chase" || brand === "capitalone") {
    return brand;
  }
  return provider;
}

/**
 * For programs where the account total is the sum of per-card balances
 * (currently Chase UR — users transfer points between cards freely),
 * re-sum the latest per-card snapshot for every card and write a new
 * pool-total snapshot if it changed.
 *
 * This keeps the dashboard's pool total in sync even when the user
 * scrapes only one card at a time (via the individual-card page),
 * rather than always going through /account-selector.
 *
 * Returns true if a new total snapshot was inserted, false if the
 * daily-dedup rule said no-op.
 */
async function recomputePoolTotal(args: {
  userId: string;
  programId: string;
  provider: Provider;
  scrapedAt: Date;
}): Promise<boolean> {
  const { userId, programId, provider, scrapedAt } = args;

  const cardRows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.programId, programId)));

  let sum = 0;
  for (const card of cardRows) {
    const latest = await db
      .select({ balance: balanceSnapshots.balance })
      .from(balanceSnapshots)
      .where(
        and(
          eq(balanceSnapshots.userId, userId),
          eq(balanceSnapshots.cardId, card.id),
          eq(balanceSnapshots.balanceType, "total")
        )
      )
      .orderBy(desc(balanceSnapshots.scrapedAt))
      .limit(1);
    if (latest[0]) sum += Number(latest[0].balance);
  }

  if (sum === 0) return false;

  const decision = await computeSnapshotAction({
    userId,
    programId,
    cardId: null,
    balanceType: "total",
    newBalance: sum,
  });
  if (decision.action === "bump") {
    // Same-day, same sum: bump the pool-total row's timestamp so the
    // dashboard reflects the fresh scrape instead of yesterday's time.
    await db
      .update(balanceSnapshots)
      .set({ scrapedAt, receivedAt: new Date() })
      .where(eq(balanceSnapshots.id, decision.rowId));
    return false;
  }

  await db.insert(balanceSnapshots).values({
    userId,
    provider,
    programId,
    cardId: null,
    balance: BigInt(sum),
    balanceType: "total",
    scrapedAt,
  });
  logger.info(
    { userId, programId, sum, cardCount: cardRows.length },
    "Pool total recomputed"
  );
  return true;
}
