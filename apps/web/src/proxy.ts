import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const response = NextResponse.next();

  // CORS for Chrome extension
  const origin = req.headers.get("origin");
  const extensionId = process.env.EXTENSION_ID || "development";
  const allowedOrigin =
    extensionId === "development"
      ? origin // allow any in dev
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

export const config = {
  matcher: "/api/:path*",
};
