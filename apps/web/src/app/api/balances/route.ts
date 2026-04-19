import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, isNull } from "drizzle-orm";
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

    const programIdByKey = new Map<ProgramKey, string>();
    for (const [programKey, accountId] of accountByProgramKey) {
      const id = await upsertProgram(
        userId,
        programKey,
        accountId,
        ownerLabel
      );
      programIdByKey.set(programKey, id);
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

      const shouldInsert = await shouldInsertSnapshot({
        userId,
        programId,
        cardId,
        balanceType: bal.balanceType,
        newBalance: bal.balance,
      });

      if (!shouldInsert) {
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

async function upsertProgram(
  userId: string,
  programKey: ProgramKey,
  externalAccountId: string,
  ownerLabel: string | null | undefined
): Promise<string> {
  const existing = await db
    .select({ id: pointsPrograms.id })
    .from(pointsPrograms)
    .where(
      and(
        eq(pointsPrograms.userId, userId),
        eq(pointsPrograms.programKey, programKey),
        eq(pointsPrograms.externalAccountId, externalAccountId)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

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
  // Match on (programId, cardName, lastFour). If lastFour is null, match rows
  // where last_four is also null to prevent accidental collision with a
  // fully-numbered duplicate.
  const existing = await db
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        eq(cards.userId, userId),
        eq(cards.programId, programId),
        eq(cards.cardName, card.cardName),
        card.lastFour
          ? eq(cards.lastFour, card.lastFour)
          : isNull(cards.lastFour)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const inserted = await db
    .insert(cards)
    .values({
      userId,
      programId,
      cardName: card.cardName,
      lastFour: card.lastFour ?? null,
      issuer: card.issuer,
    })
    .returning({ id: cards.id });

  logger.info(
    { userId, programId, cardName: card.cardName, lastFour: card.lastFour },
    "Card created"
  );
  return inserted[0].id;
}

/**
 * Daily-dedup: skip insert if the most recent snapshot for the same
 * (user, program, card, balanceType) is from today (UTC) and carries the
 * same balance. Insert otherwise.
 */
async function shouldInsertSnapshot(args: {
  userId: string;
  programId: string;
  cardId: string | null;
  balanceType: "total" | "ytd_earned_on_card";
  newBalance: number;
}): Promise<boolean> {
  const { userId, programId, cardId, balanceType, newBalance } = args;

  const latest = await db
    .select({
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

  if (latest.length === 0) return true;

  const row = latest[0];
  const sameDayUtc = isSameUtcDay(row.scrapedAt, new Date());
  const sameBalance = BigInt(row.balance) === BigInt(newBalance);
  return !(sameDayUtc && sameBalance);
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
