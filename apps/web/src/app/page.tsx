import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Public landing page. Unauth'd visitors hit this; signed-in users
 * bounce straight to the dashboard.
 *
 * Layout borrows from CardPointers / Monarch: top nav with brand +
 * Log In / Sign Up, then a hero split with headline on the left and a
 * brand illustration on the right. Below the hero sit the extension
 * download CTAs (Chrome live, Firefox "coming soon").
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <TopNav />
      <Hero />
      <ExtensionSection />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="border-b border-border/60 bg-background/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5 select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon.svg"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="rounded-md"
          />
          <span className="text-lg font-bold whitespace-nowrap">
            Points<span className="text-text-accent">Geek</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-[var(--purple-primary)] hover:bg-[var(--purple-hover)] text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
            Track your credit card{" "}
            <span className="text-text-accent">rewards</span> in one place.
          </h1>
          <p className="mt-5 text-lg text-text-secondary max-w-xl">
            See every point, mile, and cashback balance across your cards.
            Synced automatically from your browser — no logins to share.
          </p>
          <ul className="mt-8 space-y-3">
            <Bullet>
              Syncs balances from Amex, Chase, Capital One, Delta, United,
              Marriott, and more.
            </Bullet>
            <Bullet>
              Runs in your browser as a Chrome extension. Your credentials
              never leave your device.
            </Bullet>
            <Bullet>
              One dashboard for points &amp; miles, with per-card breakdowns
              and year-to-date earnings.
            </Bullet>
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-[var(--purple-primary)] hover:bg-[var(--purple-hover)] text-white px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              Get started — it&apos;s free
            </Link>
            <Link
              href="#extension"
              className="rounded-md border border-border bg-surface hover:bg-surface-hover text-text-primary px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              Install the extension
            </Link>
          </div>
        </div>
        <HeroArt />
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-text-secondary">
      <span
        aria-hidden="true"
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-text-accent"
      />
      <span className="text-sm sm:text-base">{children}</span>
    </li>
  );
}

/**
 * Hero illustration — a stylized "dashboard card" floating on a
 * lavender gradient tile. Placeholder: swap in a real product
 * screenshot once the app is stable. Pure CSS / SVG so there's no
 * binary asset to host yet.
 */
function HeroArt() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="aspect-[5/4] rounded-3xl overflow-hidden relative"
        style={{
          background:
            "linear-gradient(135deg, var(--purple-tint), var(--purple-primary))",
        }}
      >
        <div className="absolute inset-6 sm:inset-10 rounded-2xl bg-surface shadow-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-text-tertiary">Total balance</div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                2,345,678
                <span className="ml-1 text-sm font-normal text-text-secondary">
                  points &amp; miles
                </span>
              </div>
            </div>
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, var(--purple-tint), var(--purple-primary))",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/icon.svg"
                alt=""
                aria-hidden="true"
                width={28}
                height={28}
                className="rounded-md"
              />
            </span>
          </div>
          <div className="rounded-lg border border-border-light p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Chase Ultimate Rewards</div>
              <div className="text-xs text-text-tertiary">3 cards</div>
            </div>
            <div className="text-base font-semibold tabular-nums">780,441</div>
          </div>
          <div className="rounded-lg border border-border-light p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Delta SkyMiles</div>
              <div className="text-xs text-text-tertiary">Loyalty #...2575</div>
            </div>
            <div className="text-base font-semibold tabular-nums">147,709</div>
          </div>
          <div className="rounded-lg border border-border-light p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Marriott Bonvoy</div>
              <div className="text-xs text-text-tertiary">Shared</div>
            </div>
            <div className="text-base font-semibold tabular-nums">646,182</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtensionSection() {
  return (
    <section
      id="extension"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 border-t border-border/60"
    >
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Install the extension
        </h2>
        <p className="mt-3 text-text-secondary">
          Visit your bank and card issuer sites normally. The extension
          scrapes the balance off the page you&apos;re viewing and syncs it
          to your PointsGeek dashboard. No credentials collected.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href="#"
          aria-disabled="true"
          className="rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-text-primary hover:bg-surface-hover transition-colors inline-flex items-center gap-2"
        >
          <ChromeGlyph />
          Chrome
        </a>
        <a
          href="#"
          aria-disabled="true"
          className="rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-text-tertiary inline-flex items-center gap-2 cursor-not-allowed"
          title="Coming soon"
        >
          <FirefoxGlyph />
          Firefox — coming soon
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-xs text-text-tertiary">
      © {new Date().getFullYear()} PointsGeek
    </footer>
  );
}

function ChromeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#fff" />
      <circle cx="24" cy="24" r="10" fill="#4285F4" />
      <path
        d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-8.66 5L6.68 10.43A20 20 0 0 1 24 4z"
        fill="#EA4335"
      />
      <path
        d="M6.68 10.43L15.34 19A10 10 0 0 0 15 24a10 10 0 0 0 4.38 8.27L10.72 43.7A20 20 0 0 1 6.68 10.43z"
        fill="#FBBC05"
      />
      <path
        d="M41.32 14A20 20 0 0 1 24 44a20 20 0 0 1-13.28-.3L19.38 32.27A10 10 0 0 0 32.66 24v-10z"
        fill="#34A853"
      />
    </svg>
  );
}

function FirefoxGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M6 10c1-2 3-3 5-3 3 0 5 2 5 5s-2 5-5 5" />
    </svg>
  );
}
