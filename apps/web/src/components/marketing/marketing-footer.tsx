import Link from "next/link";
import { LogoLockup } from "./logo";

/**
 * Marketing footer — 4-column nav + meta strip. The first column is
 * the brand lockup with a tagline; the next three are link groups.
 *
 * Every link resolves to a real target — on-page anchors (#how,
 * #programs), the contact mailto, or the /privacy and /terms routes.
 * Don't add placeholder `href="#"` links here; leave a group out until
 * its destination exists.
 */
const FOOTER_GROUPS: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Programs", href: "#programs" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: "mailto:pointsgeekxyz@gmail.com" },
    ],
  },
  {
    heading: "Legal",
    links: [
      // /privacy is also the Chrome Web Store privacy-policy URL; the
      // header's #privacy anchor still scrolls to the on-page section.
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];

export function MarketingFooter() {
  // Stamp the build year client-side-safe by rendering on the server
  // — `new Date().getFullYear()` is fine because this is a Server
  // Component (no "use client" directive).
  const year = new Date().getFullYear();
  return (
    <footer className="px-12 pb-12">
      <div className="max-w-[1280px] mx-auto">
        <div className="border-t border-border-light pt-[72px] pb-14 grid gap-12 [grid-template-columns:1.4fr_1fr_1fr_1fr] items-start">
          <div>
            <Link href="/" className="select-none" aria-label="PointsGeek home">
              <LogoLockup kind="stamp" size={32} />
            </Link>
            <p className="mt-4 text-[13.5px] leading-relaxed text-text-secondary max-w-[280px]">
              A quiet ledger for points and miles. Built by travelers, kept honest.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading}>
              <div
                className="text-[10.5px] tracking-[0.12em] uppercase text-text-tertiary mb-3.5"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {group.heading}
              </div>
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                {group.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-[13.5px] text-text-secondary no-underline hover:text-text-primary transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border-light pt-5 flex justify-between text-xs text-text-tertiary">
          <span>© {year} PointsGeek. Made for travelers, not advertisers.</span>
          <span
            className="tracking-wider"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            v 0.4.1 · CHI
          </span>
        </div>
      </div>
    </footer>
  );
}
