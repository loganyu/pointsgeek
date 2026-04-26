"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Code entry form. The 6-digit code IS the magic-link token, so we
 * just navigate to NextAuth's email callback with `email` + `token`
 * and let it handle session creation.
 *
 * Wrong codes redirect to `/login?error=Verification` (NextAuth's
 * default failure page). We pass the email through `callbackUrl` so
 * the user can retry without losing context.
 */
export function VerifyForm({
  email,
  callbackUrl,
}: {
  email: string;
  callbackUrl: string;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the code field on mount so the user can start typing
  // (or paste) immediately after landing on this page.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || code.length !== 6) return;
    setSubmitting(true);

    // Same URL as the magic link in the email — NextAuth's email
    // callback handles GET requests with `token` + `email`. Constructing
    // it client-side keeps everything inside the standard NextAuth
    // flow (cookies, redirects, error handling).
    const verifyUrl = new URL(
      "/api/auth/callback/resend",
      window.location.origin
    );
    verifyUrl.searchParams.set("token", code);
    verifyUrl.searchParams.set("email", email);
    verifyUrl.searchParams.set("callbackUrl", callbackUrl);
    window.location.href = verifyUrl.toString();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="code"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          6-digit code
        </label>
        <input
          ref={inputRef}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          aria-describedby="code-hint"
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-lg font-mono tracking-[0.5em] text-center text-text-primary placeholder:text-text-tertiary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
        />
        <p id="code-hint" className="mt-1.5 text-xs text-text-tertiary">
          The code expires in 10 minutes.
        </p>
      </div>
      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full rounded-md bg-[var(--purple-primary)] hover:bg-[var(--purple-hover)] disabled:bg-[var(--purple-tint)] disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
      >
        {submitting ? "Verifying…" : "Verify and sign in"}
      </button>
    </form>
  );
}
