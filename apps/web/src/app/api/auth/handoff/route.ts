import { NextRequest, NextResponse } from "next/server";
import { verifyExtensionToken, signHandoffCode } from "@/lib/jwt";
import { logger } from "@/lib/logger";

/**
 * Mint a short-lived web sign-in "handoff" code.
 *
 * The extension calls this with its long-lived API token (Bearer). We verify
 * that token and hand back a 60s code the extension can put in a one-time
 * /auth/handoff?code=... URL, which the web app exchanges for a real session
 * (see the `handoff` Credentials provider in lib/auth.ts). This lets "Open
 * PointsGeek" land the user on their dashboard already signed in, without ever
 * exposing the long-lived token in a URL.
 */
export async function POST(req: NextRequest) {
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

  const code = await signHandoffCode({
    userId: tokenResult.userId,
    email: tokenResult.email,
  });

  logger.info({ userId: tokenResult.userId }, "Handoff code issued");
  return NextResponse.json({ code });
}
