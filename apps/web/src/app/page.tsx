import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BrandLogo } from "./dashboard/brand-logo";
import { LogoStampMark } from "@/components/marketing/logo";
import { HeroDashboardChip } from "@/components/marketing/hero-dashboard-chip";
import { PrivacyDiagram } from "@/components/marketing/privacy-diagram";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Public landing page. Unauth'd visitors hit this; signed-in users
 * bounce straight to the dashboard.
 *
 * Five sections, single scroll, max-width 1280:
 *   1. Header (logo + nav + Get started)
 *   2. Hero — copy left, dashboard mockup floating on a tinted paper card
 *   3. How it works — 3-step grid with mini illustrations
 *   4. Programs supported — 12 brand tiles, 4 cols
 *   5. Privacy by architecture — large card + SVG diagram
 *   6. Footer
 *
 * The whole page is static (no `"use client"`); section anchors
 * (#how, #programs, #privacy) match the IDs the marketing header
 * smooth-scrolls to.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <MarketingHeader />
      <Hero />
      <HowItWorks />
      <ProgramsGrid />
      <Privacy />
      <MarketingFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="max-w-[1280px] mx-auto px-12 pt-[72px] pb-24 grid [grid-template-columns:1.05fr_1fr] gap-16 items-center">
      <div>
        {/* Eyebrow chip — pill with purple dot */}
        <div
          className="inline-flex items-center gap-2 px-[11px] py-[5px] pl-[7px] rounded-full bg-surface border border-border text-xs text-text-secondary mb-7"
          style={{ letterSpacing: "0.01em" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--purple-deep)" }}
          />
          A quiet ledger for points &amp; miles
        </div>

        {/* Headline — Source Serif 4, italic accent on the third line */}
        <h1
          className="text-text-primary m-0"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-display)",
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
          }}
        >
          Every point.
          <br />
          Every mile.
          <br />
          <span
            style={{
              fontStyle: "italic",
              fontWeight: 400,
              color: "var(--purple-deep)",
            }}
          >
            One statement.
          </span>
        </h1>

        <p
          className="text-text-secondary"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 17,
            lineHeight: 1.55,
            maxWidth: 460,
            margin: "28px 0 36px",
          }}
        >
          PointsGeek pulls your balances from every loyalty program you use —
          banks, airlines, hotels — and rolls them into a single, readable view.
          No passwords shared. No data sold.
        </p>

        {/* CTA row — Google sign-up + extension link */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2.5 bg-white border border-border px-[18px] py-[11px] pl-[14px] rounded-[10px] text-sm font-medium text-text-primary no-underline transition-colors hover:bg-surface-hover"
            style={{ boxShadow: "0 1px 0 rgba(34,32,29,0.04)" }}
          >
            <GoogleG />
            Sign up with Google
          </Link>
          <a
            href="#"
            className="inline-flex items-center gap-2 px-4 py-[11px] rounded-[10px] text-sm font-medium text-text-secondary no-underline transition-colors hover:text-text-primary"
          >
            Install Chrome extension
            <ArrowUpRightIcon />
          </a>
        </div>

        {/* Trust strip */}
        <div
          className="mt-9 pt-6 border-t border-border-light flex gap-8 text-text-tertiary"
          style={{ fontSize: 12.5, letterSpacing: "0.01em" }}
        >
          <div>
            <span className="text-text-secondary font-medium">
              End-to-end private
            </span>
            {" · sessions stay in your browser"}
          </div>
          <div>
            <span className="text-text-secondary font-medium">Free</span>
            {" · no upsell, no premium tier"}
          </div>
        </div>
      </div>

      {/* Right column — rotated paper card backdrop + dashboard chip */}
      <div className="relative h-[540px] flex items-center justify-center">
        {/* Tinted paper backdrop — subtly rotated for hand-stamped feel */}
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background:
              "linear-gradient(180deg, #f0e9f9 0%, #e8dff5 100%)",
            transform: "rotate(-1.2deg)",
          }}
        />
        {/* Stamp watermark, faded */}
        <div
          className="absolute top-6 right-7"
          style={{ opacity: 0.18 }}
          aria-hidden="true"
        >
          <LogoStampMark size={92} />
        </div>
        {/* Top-left mono caps meta */}
        <div
          className="absolute top-7 left-8 uppercase"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--purple-deep)",
            opacity: 0.7,
          }}
        >
          STATEMENT · 2026
        </div>
        {/* Bottom-left serif italic flourish */}
        <div
          className="absolute bottom-7 left-8 italic"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 13,
            color: "var(--purple-deep)",
            opacity: 0.7,
          }}
        >
          7 programs · 14 cards · 1 ledger
        </div>
        <div className="relative z-[2]">
          <HeroDashboardChip />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// HOW IT WORKS
// ─────────────────────────────────────────────────────────────────

interface Step {
  n: string;
  title: string;
  body: string;
  art: React.ReactNode;
}

function HowItWorks() {
  const steps: Step[] = [
    {
      n: "01",
      title: "Install the extension",
      body:
        "Add PointsGeek to Chrome. Sign in with the same Google account on web and extension.",
      art: <ExtensionStepArt />,
    },
    {
      n: "02",
      title: "Visit your bank, like normal",
      body:
        "Open Amex, Chase, Capital One, Delta, United, Marriott. The extension reads your balance off the page you're already viewing.",
      art: <SyncStepArt />,
    },
    {
      n: "03",
      title: "See everything in one ledger",
      body:
        "Balances appear on your dashboard within seconds — grouped by Banks, Airlines, and Hotels. Per-card breakdowns. Year-to-date earnings.",
      art: <LedgerStepArt />,
    },
  ];
  return (
    <section
      id="how"
      className="max-w-[1280px] mx-auto px-12 py-24 border-t border-border-light"
    >
      <div className="grid [grid-template-columns:1fr_2.4fr] gap-16 items-start mb-14">
        <div>
          <div className="pg-eyebrow mb-3">How it works</div>
          <h2
            className="text-text-primary m-0"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Three quiet steps.
            <br />
            <span
              style={{ fontStyle: "italic", color: "var(--purple-deep)" }}
            >
              No scraper services.
            </span>
          </h2>
        </div>
        <p
          className="text-text-secondary mt-2 mb-0"
          style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 580 }}
        >
          PointsGeek doesn&apos;t store your bank passwords or run on a server
          farm. Your sessions live in your browser; the extension just reads
          what&apos;s already on screen and forwards the balance.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {steps.map((s) => (
          <article
            key={s.n}
            className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4"
          >
            <div className="h-[200px] rounded-[10px] bg-surface-secondary overflow-hidden relative">
              {s.art}
            </div>
            <div className="flex items-baseline gap-2.5">
              <span
                className="pg-eyebrow"
                style={{ fontSize: 11, letterSpacing: "0.12em" }}
              >
                {s.n}
              </span>
              <h3
                className="m-0 text-text-primary"
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {s.title}
              </h3>
            </div>
            <p
              className="m-0 text-text-secondary"
              style={{ fontSize: 14, lineHeight: 1.55 }}
            >
              {s.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// Mini illustrations used inside the HowItWorks step cards. Each is
// absolutely positioned inside its 200px-tall art slot so step-card
// padding doesn't push them off-grid.

function ExtensionStepArt() {
  return (
    <div className="absolute inset-0 p-6 flex items-center justify-center">
      <div
        className="w-[240px] bg-white border border-border rounded-xl overflow-hidden"
        style={{ boxShadow: "0 8px 24px -8px rgba(34,32,29,0.12)" }}
      >
        <div className="px-3 py-2.5 border-b border-border-light flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoStampMark size={20} />
            <span className="text-xs font-semibold">PointsGeek</span>
          </div>
          <span
            className="text-text-tertiary"
            style={{ fontSize: 10 }}
          >
            Chrome
          </span>
        </div>
        <div className="px-3.5 py-3.5">
          <div
            className="text-text-tertiary uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
            }}
          >
            Total balance
          </div>
          <div
            className="font-bold tabular-nums tracking-tight"
            style={{ fontSize: 22, marginTop: 2 }}
          >
            2,345,678
          </div>
          <div
            className="mt-3 w-full text-white border-0 py-2 rounded-lg text-xs font-medium text-center"
            style={{ background: "var(--purple-deep)" }}
          >
            Sign in with Google
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncStepArt() {
  const rows = [
    { logo: "/logos/brands/amex.png", host: "americanexpress.com", val: "780,441 pts" },
    { logo: "/logos/brands/chase.png", host: "chase.com", val: "189,360 pts" },
    { logo: "/logos/brands/delta.png", host: "delta.com", val: "147,709 mi" },
  ];
  return (
    <div className="absolute inset-0 p-5 flex flex-col gap-2 justify-center">
      {rows.map((r) => (
        <div
          key={r.host}
          className="bg-white border border-border rounded-lg px-2.5 py-2 flex items-center gap-2"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          <div className="w-[18px] h-[18px] rounded-full bg-white border border-border-light flex items-center justify-center">
            <Image
              src={r.logo}
              alt=""
              width={13}
              height={13}
              className="w-[13px] h-[13px] object-contain"
            />
          </div>
          <span
            className="text-text-tertiary flex-1"
            style={{ fontSize: 10 }}
          >
            {r.host}
          </span>
          <span
            className="font-semibold"
            style={{ color: "var(--purple-deep)" }}
          >
            ↳ {r.val}
          </span>
        </div>
      ))}
    </div>
  );
}

function LedgerStepArt() {
  const rows = [
    { logo: "/logos/brands/amex.png", n: "Membership Rewards", v: "780,441" },
    { logo: "/logos/brands/chase.png", n: "Ultimate Rewards", v: "189,360" },
    { logo: "/logos/brands/capitalone.png", n: "Capital One Miles", v: "87,200" },
  ];
  return (
    <div className="absolute inset-0 p-4 flex flex-col justify-center">
      <div className="bg-white border border-border rounded-[10px] overflow-hidden">
        <div
          className="px-3 py-2.5 bg-surface-hover border-b border-border-light flex justify-between font-semibold"
          style={{ fontSize: 10.5 }}
        >
          <span>Banks</span>
          <span className="tabular-nums">1,549,840</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.n}
            className={`flex items-center gap-2 px-3 py-2 ${i ? "border-t border-border-light" : ""}`}
          >
            <div className="w-[18px] h-[18px] rounded-full bg-white border border-border-light flex items-center justify-center">
              <Image
                src={r.logo}
                alt=""
                width={12}
                height={12}
                className="w-3 h-3 object-contain"
              />
            </div>
            <span className="flex-1" style={{ fontSize: 11 }}>
              {r.n}
            </span>
            <span
              className="tabular-nums font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            >
              {r.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PROGRAMS GRID
// ─────────────────────────────────────────────────────────────────

interface ProgramTile {
  /** Brand slug → resolves to the BrandLogo PNG. Null = use letter fallback. */
  brandSlug: string | null;
  name: string;
  sub: string;
  type: "Bank" | "Airline" | "Hotel";
  /** Letter to render if the brand has no logo asset yet. */
  initial?: string;
  /** Background for letter-fallback chips. */
  bg?: string;
}

// 12 tiles, mixing programs we have art for (BrandLogo) with programs
// we want to advertise on the marketing page even though their
// scrapers aren't shipped yet (Hilton, Hyatt, Southwest, American).
// Letter fallbacks render with a brand-tinted bg per the design.
const PROGRAMS: ProgramTile[] = [
  { brandSlug: "amex", name: "American Express", sub: "Membership Rewards", type: "Bank" },
  { brandSlug: "chase", name: "Chase", sub: "Ultimate Rewards", type: "Bank" },
  { brandSlug: "capitalone", name: "Capital One", sub: "Miles", type: "Bank" },
  { brandSlug: "citi", name: "Citi", sub: "ThankYou Points", type: "Bank" },
  { brandSlug: "bilt", name: "Bilt", sub: "Bilt Rewards", type: "Bank" },
  { brandSlug: "delta", name: "Delta", sub: "SkyMiles", type: "Airline" },
  { brandSlug: "united", name: "United", sub: "MileagePlus", type: "Airline" },
  { brandSlug: "aa", name: "American", sub: "AAdvantage", type: "Airline" },
  { brandSlug: null, name: "Southwest", sub: "Rapid Rewards", type: "Airline", initial: "S", bg: "#304CB2" },
  { brandSlug: "marriott", name: "Marriott", sub: "Bonvoy", type: "Hotel" },
  { brandSlug: null, name: "Hilton", sub: "Honors", type: "Hotel", initial: "H", bg: "#002F61" },
  { brandSlug: null, name: "Hyatt", sub: "World of Hyatt", type: "Hotel", initial: "H", bg: "#0F4C81" },
];

function ProgramsGrid() {
  return (
    <section
      id="programs"
      className="max-w-[1280px] mx-auto px-12 py-24 border-t border-border-light"
    >
      <div className="grid [grid-template-columns:1fr_2.4fr] gap-16 items-start mb-12">
        <div>
          <div className="pg-eyebrow mb-3">Programs supported</div>
          <h2
            className="text-text-primary m-0"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            The cards in your wallet,
            <br />
            <span
              style={{ fontStyle: "italic", color: "var(--purple-deep)" }}
            >
              the airlines you actually fly.
            </span>
          </h2>
        </div>
        <div>
          <p
            className="text-text-secondary m-0"
            style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 540 }}
          >
            New programs are added regularly. Don&apos;t see one you use? Let us
            know and it goes on the queue.
          </p>
          <div className="mt-4 flex gap-2 flex-wrap">
            {[
              { label: "5 banks", solid: true },
              { label: "4 airlines", solid: true },
              { label: "3 hotels", solid: true },
              { label: "more soon", solid: false },
            ].map((t) => (
              <span
                key={t.label}
                className={`px-2.5 py-[5px] rounded-full text-xs text-text-secondary ${t.solid ? "bg-surface border border-border" : "border border-border border-dashed"}`}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {PROGRAMS.map((p) => (
          <ProgramTileCard key={p.name} program={p} />
        ))}
      </div>
    </section>
  );
}

function ProgramTileCard({ program }: { program: ProgramTile }) {
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-4 flex items-center gap-3">
      {/* Logo chip — BrandLogo for known brands, manual letter chip for the
       * "advertise but not yet scraped" set. The 36px size matches the
       * design's circle-chip diameter and the dashboard ProgramsList. */}
      {program.brandSlug ? (
        <BrandLogo slug={program.brandSlug} size={36} />
      ) : (
        <div
          className="shrink-0 rounded-full flex items-center justify-center text-white font-semibold"
          style={{
            width: 36,
            height: 36,
            background: program.bg ?? "var(--brand-default-chip)",
            fontSize: 14,
          }}
          aria-hidden="true"
        >
          {program.initial ?? program.name[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary truncate tracking-[-0.005em]">
          {program.name}
        </div>
        <div
          className="text-text-tertiary truncate"
          style={{ fontSize: 11.5, marginTop: 1 }}
        >
          {program.sub}
        </div>
      </div>
      <span
        className="uppercase text-text-tertiary"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.06em",
        }}
      >
        {program.type.slice(0, 3)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PRIVACY
// ─────────────────────────────────────────────────────────────────

const PRIVACY_BULLETS = [
  "No bank passwords collected, ever",
  "Sessions stay in your browser — we don't proxy them",
  "Only balance numbers + program names sync to your dashboard",
  "Open-source extension; review the code on GitHub",
] as const;

function Privacy() {
  return (
    <section
      id="privacy"
      className="max-w-[1280px] mx-auto px-12 py-24 border-t border-border-light"
    >
      <div className="bg-surface border border-border rounded-[20px] p-14 grid [grid-template-columns:1.1fr_1fr] gap-16 items-center">
        <div>
          <div className="pg-eyebrow mb-3">Privacy by architecture</div>
          <h2
            className="text-text-primary"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 38,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: "0 0 20px",
            }}
          >
            Your credentials
            <br />
            <span
              style={{ fontStyle: "italic", color: "var(--purple-deep)" }}
            >
              never leave your device.
            </span>
          </h2>
          <p
            className="text-text-secondary"
            style={{
              fontSize: 15.5,
              lineHeight: 1.6,
              margin: "0 0 24px",
              maxWidth: 460,
            }}
          >
            Other points trackers ask for your bank passwords. We don&apos;t,
            and we can&apos;t — PointsGeek runs entirely as a Chrome extension
            that reads balances off the pages you&apos;ve already logged into.
            No third-party scrapers. No stored sessions.
          </p>
          <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
            {PRIVACY_BULLETS.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2.5 text-sm text-text-primary"
              >
                <CheckIcon />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative h-[380px]">
          <PrivacyDiagram accent="#4a2f85" />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Inline SVG icons used in the page
// ─────────────────────────────────────────────────────────────────

function GoogleG() {
  // Official Google "G" mark — 4-color SVG, used on the primary CTA.
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function CheckIcon() {
  // Tinted accent disc + check stroke. Marked decorative — the bullet
  // text next to it carries the meaning.
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      style={{ flexShrink: 0, marginTop: 2 }}
      aria-hidden="true"
    >
      <circle
        cx="9"
        cy="9"
        r="9"
        fill="var(--purple-deep)"
        opacity="0.12"
      />
      <path
        d="M5.5 9.2 L8 11.5 L12.5 6.5"
        stroke="var(--purple-deep)"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
