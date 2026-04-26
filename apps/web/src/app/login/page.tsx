import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthForm } from "./auth-form";

export const metadata = {
  title: "Log in — PointsGeek",
};

/**
 * Dedicated Log In page. Authed users skip straight to the requested
 * route (or dashboard). Copy targets returning users; plumbing is
 * identical to /signup — both route Google OAuth via NextAuth and
 * email through the Resend magic-link provider. Shared UI lives in
 * `AuthForm`.
 *
 * Accepts a `?route=/some/path` query (like Monarch does) so deep
 * links into gated pages can redirect back to them after sign-in.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string; error?: string }>;
}) {
  const session = await auth();
  const { route, error } = await searchParams;
  const callbackUrl = sanitizeRoute(route);
  if (session?.user) redirect(callbackUrl);

  // NextAuth bounces here with `?error=Verification` after a wrong or
  // expired code. Show a friendly inline message so the user knows
  // why they were kicked back instead of getting silent re-entry.
  const errorMessage = errorCopy(error);

  return (
    <main className="min-h-screen flex items-start justify-center bg-background px-4 pt-16 pb-12 sm:pt-24">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon.svg"
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
            className="rounded-lg"
          />
          <span className="text-2xl font-bold">
            Points<span className="text-text-accent">Geek</span>
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-xl font-bold text-text-primary mb-1">Log In</h1>
          <p className="text-sm text-text-secondary mb-5">
            Welcome back. Continue with Google or we&apos;ll email you a 6-digit
            sign-in code.
          </p>
          {errorMessage && (
            <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}
          <AuthForm
            emailButtonLabel="Send sign-in code"
            callbackUrl={callbackUrl}
          />
        </div>
        <p className="text-sm text-text-secondary text-center mt-5">
          Don&apos;t have an account?{" "}
          <Link
            href={
              route ? `/signup?route=${encodeURIComponent(route)}` : "/signup"
            }
            className="font-semibold text-text-accent hover:text-text-accent-hover transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * Accepts only same-origin paths. Guards against an attacker crafting
 * `/login?route=//evil.com/phish` as an open redirect — a protocol-
 * relative URL would otherwise be treated as absolute by browsers.
 */
function sanitizeRoute(route: string | undefined): string {
  if (!route) return "/dashboard";
  if (!route.startsWith("/") || route.startsWith("//")) return "/dashboard";
  return route;
}

/**
 * Map NextAuth's error codes to user-facing copy. We mostly care about
 * `Verification` (wrong/expired code) — other auth errors are rare
 * enough to share a generic catch-all.
 */
function errorCopy(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "Verification") {
    return "That code was invalid or has expired. Enter your email below to get a new one.";
  }
  return "Something went wrong signing you in. Please try again.";
}
