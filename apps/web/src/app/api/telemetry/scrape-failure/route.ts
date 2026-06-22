import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Telemetry sink for failed extension scrapes.
 *
 * Fired by the per-page sync widget's "Report issue" button when a
 * provider scrape fails. Like the missing-asset sink, it just
 * structured-logs today — grep `event=scrape-failure-report` to see
 * what's breaking in the wild and which provider/selectors are stale.
 * This is intentionally shallow; it's not where we persist events.
 *
 * No auth gate: the report should go through even if the user's
 * extension session token is missing or expired (a failed scrape is
 * exactly the kind of broken state where auth might also be off). The
 * content script reaches this cross-origin via the extension's
 * host_permissions for WEB_BASE, so no CORS headers are needed.
 *
 * Everything is bounded + optional so a malformed client can't make us
 * log unbounded strings. `domSample` is a short, caller-redacted DOM
 * hint — capped hard here as a backstop.
 */
const payloadSchema = z.object({
  provider: z.string().min(1).max(64),
  code: z.string().max(128).optional(),
  message: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  selectorsAttempted: z.array(z.string().max(256)).max(50).optional(),
  domSample: z.string().max(4000).optional(),
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
      event: "scrape-failure-report",
      provider: parsed.data.provider,
      code: parsed.data.code,
      message: parsed.data.message,
      url: parsed.data.url,
      selectorsAttempted: parsed.data.selectorsAttempted,
      domSample: parsed.data.domSample,
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
    "Scrape failure reported"
  );
  return NextResponse.json({ ok: true });
}
