import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthForm } from "../login/auth-form";

export const metadata = {
  title: "Sign up — PointsGeek",
};

/**
 * New-user Sign Up page. Identical plumbing to /login — Google OAuth
 * or email magic link — but the copy targets people creating an
 * account for the first time. NextAuth's `pages.signIn` still points
 * at `/login`; this route exists purely so the "Sign up" CTA has a
 * natural home with new-user framing.
 *
 * Supports the same `?route=/path` param as /login so a deep link
 * can carry its intended destination through the signup flow too.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string }>;
}) {
  const session = await auth();
  const { route } = await searchParams;
  const callbackUrl = sanitizeRoute(route);
  if (session?.user) redirect(callbackUrl);

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
          <h1 className="text-xl font-bold text-text-primary mb-1">Sign Up</h1>
          <p className="text-sm text-text-secondary mb-5">
            Track your credit card rewards in one place. No password — continue
            with Google or we&apos;ll email you a sign-in link.
          </p>
          <AuthForm
            emailButtonLabel="Sign up with email"
            sentMessage="Check your inbox — we sent a sign-up link."
            callbackUrl={callbackUrl}
          />
          <p className="mt-5 text-xs text-text-tertiary text-center">
            By continuing you agree to PointsGeek&apos;s terms of use and
            privacy policy.
          </p>
        </div>
        <p className="text-sm text-text-secondary text-center mt-5">
          Already have an account?{" "}
          <Link
            href={
              route ? `/login?route=${encodeURIComponent(route)}` : "/login"
            }
            className="font-semibold text-text-accent hover:text-text-accent-hover transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * Accepts only same-origin paths. Matches `/login`'s sanitizer so
 * cross-referenced routes (e.g. "Already have an account? Log in")
 * carry identical safety rules.
 */
function sanitizeRoute(route: string | undefined): string {
  if (!route) return "/dashboard";
  if (!route.startsWith("/") || route.startsWith("//")) return "/dashboard";
  return route;
}
