import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { verifyExtensionToken } from "@/lib/jwt";
import { logger } from "@/lib/logger";

// POST: create or find-existing card
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const tokenResult = await verifyExtensionToken(authHeader.slice(7));
  if (!tokenResult) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const { programId, cardName, lastFour, issuer } = body;

  if (!programId || !cardName || !issuer) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Find existing by programId + cardName + lastFour
  const conditions = [
    eq(cards.userId, tokenResult.userId),
    eq(cards.programId, programId),
    eq(cards.cardName, cardName),
  ];
  if (lastFour) conditions.push(eq(cards.lastFour, lastFour));

  const existing = await db
    .select()
    .from(cards)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(existing[0]);
  }

  const inserted = await db
    .insert(cards)
    .values({
      userId: tokenResult.userId,
      programId,
      cardName,
      lastFour: lastFour || null,
      issuer,
    })
    .returning();

  logger.info({ userId: tokenResult.userId, cardName }, "Card created");
  return NextResponse.json(inserted[0], { status: 201 });
}
