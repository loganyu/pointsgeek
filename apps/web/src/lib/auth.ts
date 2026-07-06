import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { Resend as ResendSDK } from "resend";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { users, accounts, sessions, verificationTokens } from "./db/schema";
import { verifyHandoffCode } from "./jwt";

/** Codes live this long. Short enough to make brute force impractical
 *  without rate limiting, long enough that switching apps to copy a
 *  code from email isn't a frustrating race. */
const CODE_TTL_SECONDS = 10 * 60; // 10 min

/** After this many failed code entries we delete the token row, forcing
 *  the user to request a fresh code. Keeps total guesses-per-code
 *  bounded at 5 against the 1M-combination search space. */
const MAX_ATTEMPTS = 5;

/**
 * Custom adapter that wraps Drizzle with attempt tracking on the
 * verification-token table. NextAuth's default `useVerificationToken`
 * does an exact `(identifier, token)` match and returns null on miss —
 * which lets a brute-forcer hammer 6-digit codes indefinitely. Our
 * version increments `attempts` on miss, deletes the row at 5 fails.
 *
 * On hit, behavior is unchanged: delete the row, return it, NextAuth
 * proceeds to create the session.
 */
const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

const adapter: Adapter = {
  ...baseAdapter,
  async useVerificationToken({ identifier, token }) {
    // 1. Exact match — happy path. If found, delete and return.
    const [match] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.token, token)
        )
      )
      .limit(1);

    if (match) {
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, token)
          )
        );
      // Strip our internal `attempts` column — NextAuth's adapter
      // contract returns just the canonical fields.
      return {
        identifier: match.identifier,
        token: match.token,
        expires: match.expires,
      };
    }

    // 2. No exact match — find the most recent token for this email
    //    (there should be only one, but order by expires DESC is
    //    defensive in case multiple ever coexist) and bump attempts.
    const [latest] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier))
      .orderBy(desc(verificationTokens.expires))
      .limit(1);

    if (!latest) return null;

    const newAttempts = latest.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, identifier));
    } else {
      await db
        .update(verificationTokens)
        .set({ attempts: newAttempts })
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, latest.token)
          )
        );
    }
    return null;
  },
};

/**
 * Custom Resend provider configuration:
 * - `generateVerificationToken` returns a 6-digit code instead of the
 *   default 32-char hex string. The code IS the token — same value
 *   verifies whether the user clicks the link or types the code.
 * - `sendVerificationRequest` skips NextAuth's default plain-text
 *   email and uses Resend's SDK directly so we can show the code
 *   prominently with the link as a fallback.
 * - `maxAge` shortens the default 24h expiry to 10 min — appropriate
 *   for the weaker entropy of a 6-digit code.
 */
const resendApiKey = process.env.AUTH_RESEND_KEY;
const fromAddress = process.env.AUTH_EMAIL_FROM || "noreply@example.com";
const resendClient = resendApiKey ? new ResendSDK(resendApiKey) : null;

function generateSixDigitCode(): string {
  // Math.random is fine here — codes are short-lived, attempt-limited,
  // and the bottleneck is the search space (1M), not predictability.
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface SendVerificationArgs {
  identifier: string;
  url: string;
  token: string;
  provider: { from?: string };
}

async function sendVerificationRequest({
  identifier,
  url,
  token,
  provider,
}: SendVerificationArgs) {
  if (!resendClient) {
    // Surfaces in dev when AUTH_RESEND_KEY isn't set — log so the dev
    // can still grab the code out of the console.
    console.warn(
      `[auth] AUTH_RESEND_KEY not set; skipping email. Code for ${identifier}: ${token}`
    );
    return;
  }

  const subject = `Your Points Geek code: ${token}`;
  const html = `
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; margin: 0; padding: 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width: 480px; background: #ffffff; border-radius: 12px; padding: 32px;">
      <tr>
        <td>
          <h1 style="margin: 0 0 8px 0; font-size: 20px; color: #111;">Sign in to Points Geek</h1>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: #555;">Enter this code in the verification page:</p>
          <div style="text-align: center; padding: 24px; background: #f3f0ff; border-radius: 8px; margin-bottom: 24px;">
            <div style="font-family: 'SF Mono', Menlo, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #6d28d9;">${token}</div>
          </div>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #555;">Or click this link to sign in directly:</p>
          <p style="margin: 0 0 24px 0; font-size: 13px;"><a href="${url}" style="color: #6d28d9; text-decoration: underline; word-break: break-all;">${url}</a></p>
          <p style="margin: 0; font-size: 12px; color: #888;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = `Sign in to Points Geek\n\nYour code: ${token}\n\nOr open this link: ${url}\n\nThis code expires in 10 minutes.`;

  await resendClient.emails.send({
    from: provider.from || fromAddress,
    to: identifier,
    subject,
    html,
    text,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [
    Google,
    Resend({
      from: fromAddress,
      maxAge: CODE_TTL_SECONDS,
      generateVerificationToken: generateSixDigitCode,
      sendVerificationRequest,
    }),
    // Extension → web "handoff". Not a user-facing sign-in method: the
    // /auth/handoff page calls signIn("handoff") with a one-time code minted
    // by /api/auth/handoff from a valid extension token. The code is a 60s,
    // issuer-scoped JWT; we still confirm the user row exists before issuing a
    // session so a deleted account can't be revived.
    Credentials({
      id: "handoff",
      name: "Extension handoff",
      credentials: { code: { label: "Code", type: "text" } },
      async authorize(credentials) {
        const code =
          typeof credentials?.code === "string" ? credentials.code : null;
        if (!code) return null;
        const result = await verifyHandoffCode(code);
        if (!result) return null;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, result.userId))
          .limit(1);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    // Custom routes replace NextAuth's default pages so we can brand
    // them and show the magic-link flow clearly. `/login` doubles as
    // NextAuth's sign-in screen; `/signup` is just new-user copy on
    // the same magic-link plumbing.
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
