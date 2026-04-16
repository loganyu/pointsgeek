import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { pointsPrograms } from "@/lib/db/schema";
import { verifyExtensionToken } from "@/lib/jwt";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

// GET: list all programs for the authenticated user
export async function GET(req: NextRequest) {
  // Support both session auth (dashboard) and JWT auth (extension)
  let userId: string | undefined;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const result = await verifyExtensionToken(authHeader.slice(7));
    userId = result?.userId;
  } else {
    const session = await auth();
    userId = session?.user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const programs = await db
    .select()
    .from(pointsPrograms)
    .where(eq(pointsPrograms.userId, userId));

  return NextResponse.json(programs);
}

// POST: create or find-existing program
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
  const { programType, name, currency, issuer } = body;

  if (!programType || !name || !issuer) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Find existing or create
  const existing = await db
    .select()
    .from(pointsPrograms)
    .where(
      and(
        eq(pointsPrograms.userId, tokenResult.userId),
        eq(pointsPrograms.issuer, issuer),
        eq(pointsPrograms.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(existing[0]);
  }

  const inserted = await db
    .insert(pointsPrograms)
    .values({
      userId: tokenResult.userId,
      programType,
      name,
      currency: currency || "points",
      issuer,
    })
    .returning();

  logger.info({ userId: tokenResult.userId, name }, "Program created");
  return NextResponse.json(inserted[0], { status: 201 });
}
