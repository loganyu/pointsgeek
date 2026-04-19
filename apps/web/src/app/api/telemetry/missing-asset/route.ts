import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Minimal client-side telemetry sink for missing design assets.
 *
 * Today it just structured-logs — which makes it easy to grep, pipe to a
 * log aggregator, or wire up an alert on `kind=brand-logo` events later.
 * Keep it intentionally shallow; this isn't where we persist events.
 *
 * The client dedupes per slug per tab session, so we don't expect high
 * volume. Still, no auth gate — a signed-out dashboard would never hit
 * this, but a misconfigured route shouldn't 401 either.
 */
const payloadSchema = z.object({
  kind: z.enum(["brand-logo"]),
  slug: z.string().min(1).max(64),
  reason: z.enum(["no_meta", "image_load_error"]),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  logger.warn(
    {
      kind: parsed.data.kind,
      slug: parsed.data.slug,
      reason: parsed.data.reason,
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
    "Missing asset reported"
  );
  return NextResponse.json({ ok: true });
}
