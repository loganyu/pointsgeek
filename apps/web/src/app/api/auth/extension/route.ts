import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { signExtensionToken } from "@/lib/jwt";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.googleAccessToken) {
    return NextResponse.json(
      { error: "Missing googleAccessToken" },
      { status: 400 }
    );
  }

  // Validate Google access token by fetching user info
  const googleRes = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${body.googleAccessToken}` } }
  );

  if (!googleRes.ok) {
    logger.warn("Invalid Google access token");
    return NextResponse.json(
      { error: "Invalid Google token" },
      { status: 401 }
    );
  }

  const googleUser = (await googleRes.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };

  if (!googleUser.email) {
    return NextResponse.json(
      { error: "No email in Google profile" },
      { status: 400 }
    );
  }

  // Find or create user
  let user = await db
    .select()
    .from(users)
    .where(eq(users.email, googleUser.email))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    const inserted = await db
      .insert(users)
      .values({
        email: googleUser.email,
        name: googleUser.name ?? null,
        image: googleUser.picture ?? null,
      })
      .returning();
    user = inserted[0];
    logger.info({ email: googleUser.email }, "Created new user from extension");
  }

  // Sign JWT
  const token = await signExtensionToken({
    userId: user.id,
    email: user.email,
  });

  logger.info({ userId: user.id }, "Extension token issued");

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    },
  });
}
