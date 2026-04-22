"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Shared sign-in form for /login and /signup. Same plumbing, different
 * copy: Google OAuth button + email magic link. After the user
 * submits their email, we show a "check your inbox" confirmation and
 * hide the form — the magic link lands them back in the app.
 */
export function AuthForm({
  emailButtonLabel,
  sentMessage,
  callbackUrl = "/dashboard",
}: {
  emailButtonLabel: string;
  sentMessage: string;
  /** Where NextAuth should send the user after successful sign-in.
   *  Typically the `?route=` param captured on /login and /signup. */
  callbackUrl?: string;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGoogle() {
    setError(null);
    // NextAuth redirects to `callbackUrl` after a successful sign-in.
    // New users without a completed profile still get bounced into
    // `/welcome` via `requireCompletedProfile` in the target page.
    await signIn("google", { callbackUrl });
  }

  async function onEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn("resend", {
        email: email.trim(),
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        setError("We couldn't send the sign-in email. Try again in a moment.");
        return;
      }
      setSent(true);
    } catch {
      setError("We couldn't send the sign-in email. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 text-center">
        <p className="text-sm font-medium text-text-primary">{sentMessage}</p>
        <p className="mt-1 text-xs text-text-tertiary">
          Sent to {email}. The link is good for a short time.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
          className="mt-3 text-sm font-semibold text-text-accent hover:text-text-accent-hover transition-colors"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onGoogle}
        className="w-full rounded-md border border-border bg-background hover:bg-surface-hover text-sm font-semibold text-text-primary px-4 py-2.5 flex items-center justify-center gap-2.5 transition-colors"
      >
        <GoogleGlyph />
        Continue with Google
      </button>

      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center"
        >
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-surface px-2 text-xs uppercase tracking-wide text-text-tertiary">
            Or
          </span>
        </div>
      </div>

      <form onSubmit={onEmailSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
          />
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-md bg-[var(--purple-primary)] hover:bg-[var(--purple-hover)] disabled:bg-[var(--purple-tint)] disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          {submitting ? "Sending…" : emailButtonLabel}
        </button>
      </form>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.086 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
