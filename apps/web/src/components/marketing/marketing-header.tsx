import Link from "next/link";
import { LogoLockup } from "./logo";

/**
 * Top chrome for the landing page. Plain border-bottom (not actually
 * sticky — the design wants it to scroll out of view) so we don't fight
 * with section anchors when smooth-scrolling.
 *
 * Anchor links (#how, #programs, #privacy) match section IDs in
 * page.tsx. "Sign in" goes to /login (NextAuth route), "Get started"
 * to /signup which the auth flow handles.
 */
export function MarketingHeader() {
  return (
    <header className="border-b border-border-light">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-12 py-4 sm:py-5 flex items-center justify-between">
        <Link href="/" className="select-none" aria-label="PointsGeek home">
          <LogoLockup kind="stamp" size={32} />
        </Link>
        {/* Section anchors hide below md — on a phone the sections are one
         * short scroll away, and five links don't fit next to the lockup. */}
        <nav className="flex items-center gap-4 sm:gap-6 lg:gap-8">
          <a
            href="#how"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            How it works
          </a>
          <a
            href="#programs"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Programs
          </a>
          <a
            href="#privacy"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Privacy
          </a>
          <Link
            href="/login"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium text-white px-4 py-[9px] rounded-lg transition-colors"
            style={{ background: "var(--purple-deep)" }}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
