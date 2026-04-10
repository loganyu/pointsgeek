import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { balanceSnapshots, scrapeEvents } from "@/lib/db/schema";
import { validateApiKey } from "@/lib/api-key";
import { auth } from "@/lib/auth";
import { balancePayloadSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const start = Date.now();
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const apiKeyResult = await validateApiKey(authHeader.slice(7));
  if (!apiKeyResult) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
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

  const { provider, balance, scrapedAt, scrapeEvent } = parsed.data;
  const userId = apiKeyResult.userId;

  try {
    // Always log the scrape event
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

    // If successful scrape, store the balance
    if (scrapeEvent.success && balance !== undefined) {
      await db.insert(balanceSnapshots).values({
        userId,
        provider,
        balance: BigInt(balance),
        scrapedAt: new Date(scrapedAt),
      });
    }

    logger.info(
      {
        userId,
        provider,
        success: scrapeEvent.success,
        balance,
        durationMs: Date.now() - start,
      },
      "Balance payload processed"
    );

    return NextResponse.json({ ok: true }, { status: 201 });
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
      scrapedAt: balanceSnapshots.scrapedAt,
    })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, session.user.id))
    .orderBy(desc(balanceSnapshots.scrapedAt))
    .limit(10);

  return NextResponse.json(
    results.map((r) => ({
      ...r,
      balance: r.balance.toString(),
    }))
  );
}
