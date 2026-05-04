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
      <div className="max-w-[1280px] mx-auto px-12 py-5 flex items-center justify-between">
        <Link href="/" className="select-none" aria-label="PointsGeek home">
          <LogoLockup kind="stamp" size={32} />
        </Link>
        <nav className="flex items-center gap-8">
          <a
            href="#how"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            How it works
          </a>
          <a
            href="#programs"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Programs
          </a>
          <a
            href="#privacy"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
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
