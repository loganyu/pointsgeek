import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
const ISSUER = "points-geek";
const EXPIRY = "30d";

// Web sign-in "handoff": the extension trades its long-lived API token for one
// of these short-lived codes, opens /auth/handoff?code=..., and the web app
// exchanges it for a session. A distinct issuer means a handoff code can't be
// replayed as an API token (or vice-versa); the 60s TTL bounds how long the
// code is useful if the URL leaks (logs, history).
const HANDOFF_ISSUER = "points-geek-handoff";
const HANDOFF_EXPIRY = "60s";

export async function signExtensionToken(payload: {
  userId: string;
  email: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

export async function verifyExtensionToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export async function signHandoffCode(payload: {
  userId: string;
  email: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(HANDOFF_ISSUER)
    .setIssuedAt()
    .setExpirationTime(HANDOFF_EXPIRY)
    .sign(secret);
}

export async function verifyHandoffCode(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: HANDOFF_ISSUER,
    });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}
