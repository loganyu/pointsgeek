import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 `proxy` handler — replaces the older `middleware` file.
 * Two concerns colocated here because only one proxy file is allowed
 * per app:
 *
 *  1. Auth redirect for protected page routes. Monarch's pattern:
 *     a deep link to a gated page becomes `/login?route=<path>` so
 *     the user lands back where they tried to go after sign-in.
 *     We only check for the *presence* of NextAuth's session cookie
 *     here (cheap, edge-safe, no DB). The real `auth()` validation
 *     still runs inside each page.
 *
 *  2. CORS headers for `/api/*` requests coming from the Chrome
 *     extension. Scoped to the configured `EXTENSION_ID` in prod,
 *     permissive in dev (any origin).
 */

const PROTECTED = /^\/(dashboard|accounts|settings|welcome)(\/|$)/;

/** NextAuth v5 JWT cookie names — dev + prod (HTTPS) variants. */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PROTECTED.test(pathname)) {
    const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
    if (hasSession) return NextResponse.next();
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("route", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    const origin = req.headers.get("origin");
    const extensionId = process.env.EXTENSION_ID || "development";
    const allowedOrigin =
      extensionId === "development"
        ? origin
        : `chrome-extension://${extensionId}`;

    if (origin && (extensionId === "development" || origin === allowedOrigin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type"
      );
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/accounts/:path*",
    "/settings/:path*",
    "/welcome/:path*",
    "/api/:path*",
  ],
};
