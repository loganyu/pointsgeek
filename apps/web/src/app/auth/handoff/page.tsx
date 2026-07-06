"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * Extension → web sign-in bridge. The extension's "Open PointsGeek" button
 * opens /auth/handoff?code=<one-time-code>; we exchange that code for a real
 * NextAuth session via the `handoff` Credentials provider, then land the user
 * on their dashboard. The page is public (the user isn't signed in yet).
 */
function HandoffInner() {
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; the code is single-window so
    // guard against firing signIn twice.
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    if (!code) {
      setFailed(true);
      return;
    }

    signIn("handoff", { code, redirect: false })
      .then((res) => {
        if (res && !res.error) {
          // Full navigation so the dashboard's server render sees the new
          // session cookie.
          window.location.href = "/dashboard";
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-text-primary px-6">
      <div className="text-center">
        {failed ? (
          <>
            <p className="text-base text-text-primary mb-2">
              That sign-in link didn&apos;t work.
            </p>
            <p className="text-sm text-text-secondary mb-5">
              It may have expired — they&apos;re only valid for a minute. Try
              &ldquo;Open PointsGeek&rdquo; from the extension again.
            </p>
            <a
              href="/login"
              className="text-sm font-medium text-text-accent hover:text-text-accent-hover no-underline"
            >
              Sign in instead
            </a>
          </>
        ) : (
          <p className="text-sm text-text-secondary">Signing you in…</p>
        )}
      </div>
    </div>
  );
}

export default function HandoffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-text-secondary text-sm">
          Signing you in…
        </div>
      }
    >
      <HandoffInner />
    </Suspense>
  );
}
