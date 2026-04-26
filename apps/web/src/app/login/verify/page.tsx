import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VerifyForm } from "./verify-form";

export const metadata = {
  title: "Verify code — PointsGeek",
};

/**
 * Code-entry page after the user submits their email on /login or
 * /signup. Lands here with `?email=<addr>&route=<dest>` so we can
 * pre-fill the form and forward the post-sign-in destination on
 * through to NextAuth's callback.
 *
 * The same 6-digit code that appears in the email also makes up the
 * `token` query param on the magic link, so the user can either
 * click the link in their inbox or type the code here — both end up
 * at /api/auth/callback/resend with identical params.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; route?: string }>;
}) {
  const session = await auth();
  const { email, route } = await searchParams;
  const callbackUrl = sanitizeRoute(route);
  if (session?.user) redirect(callbackUrl);

  // No email in the URL means the user landed here directly without
  // going through /login. Bounce them back so they can request a code.
  if (!email) redirect(routeToLogin(route));

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
          <h1 className="text-xl font-bold text-text-primary mb-1">
            Check your email
          </h1>
          <p className="text-sm text-text-secondary mb-5">
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-text-primary">{email}</span>.
            Enter it below to sign in.
          </p>
          <VerifyForm email={email} callbackUrl={callbackUrl} />
        </div>
        <p className="text-sm text-text-secondary text-center mt-5">
          Didn&apos;t get a code?{" "}
          <Link
            href={routeToLogin(route)}
            className="font-semibold text-text-accent hover:text-text-accent-hover transition-colors"
          >
            Try a different email
          </Link>
        </p>
      </div>
    </main>
  );
}

function sanitizeRoute(route: string | undefined): string {
  if (!route) return "/dashboard";
  if (!route.startsWith("/") || route.startsWith("//")) return "/dashboard";
  return route;
}

function routeToLogin(route: string | undefined): string {
  return route ? `/login?route=${encodeURIComponent(route)}` : "/login";
}
