"use client";

import { useState } from "react";
import type {
  ProgramKey,
  ProgramType,
  BalanceType,
} from "@points-geek/shared";
import { BrandLogo } from "./brand-logo";
import { CardArt } from "./card-art";

export interface CardRowData {
  id: string;
  cardName: string;
  lastFour: string | null;
  issuer: string;
  imageSlug: string | null;
  imageUrl: string | null;
  balance: number | null;
  balanceType: BalanceType | null;
  lastUpdated: string | null;
}

export interface ProgramRowData {
  programRowId: string;
  programKey: ProgramKey;
  programType: ProgramType;
  displayName: string;
  brandSlug: string;
  currency: "points" | "miles" | "usd_cents";
  ownerLabel: string | null;
  externalAccountId: string;
  syncUrl: string;
  totalBalance: number | null;
  lastUpdated: string | null;
  /** YTD earnings from an account-level scrape (e.g. Amex Marriott tile). */
  ytdBalance: number | null;
  ytdLastUpdated: string | null;
  cards: CardRowData[];
}

/**
 * Sub-line label beside a program row. When we have both an owner and a
 * loyalty number (e.g. Marriott: "Logan Yu" + "264636152"), both show,
 * joined by a middot. Falls back to whichever piece we have.
 */
function programIdentityLabel(p: ProgramRowData): string | null {
  const parts: string[] = [];
  if (p.ownerLabel && p.ownerLabel !== "Account") {
    parts.push(p.ownerLabel);
  }
  if (
    (p.programType === "airline" || p.programType === "hotel") &&
    p.externalAccountId.startsWith("loyalty:")
  ) {
    parts.push(p.externalAccountId.slice("loyalty:".length));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ── Formatting helpers ──────────────────────────────────── */

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 45) return "just now";

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;

  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function formatBalance(n: number, currency: ProgramRowData["currency"]): string {
  if (currency === "usd_cents") {
    const dollars = n / 100;
    return dollars.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }
  return n.toLocaleString();
}

/* ── Icons ───────────────────────────────────────────────── */

function Chevron({ open, size = 16 }: { open: boolean; size?: number }) {
  return (
    <svg
      className={`text-text-tertiary transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
      style={{ width: size, height: size }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function RefreshIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <path d="M21 2v6h-6" />
      <path d="M21 13a9 9 0 11-3-7.7L21 8" />
    </svg>
  );
}

/**
 * Last-scraped timestamp + refresh link. Clicking the icon opens the
 * program's primary sync URL so the content script can pick up fresh data.
 */
function LastUpdated({ iso, url }: { iso: string; url: string }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <span className="text-xs text-text-tertiary">{timeAgo(iso)}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Log in to refresh"
        className="group/tip relative inline-flex items-center justify-center p-1 -m-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
      >
        <RefreshIcon />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-[var(--text-primary)] text-[var(--background)] px-2.5 py-1.5 text-xs font-medium shadow-lg opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100"
        >
          Log in to refresh
          <span
            aria-hidden="true"
            className="absolute top-full right-2 h-0 w-0 border-4 border-transparent border-t-[var(--text-primary)]"
          />
        </span>
      </a>
    </div>
  );
}

/* ── Card row (innermost) ────────────────────────────────── */

function CardRow({
  card,
  ownerLabel,
  currency,
}: {
  card: CardRowData;
  ownerLabel: string | null;
  currency: ProgramRowData["currency"];
}) {
  const showOwner = !!ownerLabel && ownerLabel !== "Account";
  return (
    <div className="flex items-center justify-between py-2.5 pl-16 pr-4 border-b border-border-light last:border-b-0 bg-surface-secondary/40">
      <div className="flex items-center gap-3 min-w-0">
        <CardArt
          imageUrl={card.imageUrl}
          imageSlug={card.imageSlug}
          issuer={card.issuer}
          width={40}
          height={25}
        />
        <div className="min-w-0">
          <div className="text-sm text-text-primary truncate">
            {card.cardName}
            {card.lastFour && ` (...${card.lastFour})`}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
            <span>Credit Card</span>
            {showOwner && (
              <>
                <span className="text-border-light">•</span>
                <span className="truncate">{ownerLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 pl-4">
        {card.balance !== null ? (
          <span className="text-sm tabular-nums text-text-primary">
            {formatBalance(card.balance, currency)}
          </span>
        ) : (
          <span className="text-sm text-text-tertiary">—</span>
        )}
      </div>
    </div>
  );
}

/* ── Program row (expandable if it has cards) ────────────── */

function ProgramRow({ program }: { program: ProgramRowData }) {
  const [open, setOpen] = useState(false);
  const hasCards = program.cards.length > 0;
  const hasTotal = program.totalBalance !== null;
  const hasYtd = program.ytdBalance !== null;
  const hasAnyBalance = hasTotal || hasYtd;

  // Prefer the total's timestamp; fall back to YTD's if that's the only
  // data source (Marriott from Amex scraper, until marriott.com is wired).
  const displayedLastUpdated = program.lastUpdated ?? program.ytdLastUpdated;

  return (
    <>
      <div
        onClick={() => hasCards && setOpen(!open)}
        className={`flex items-center justify-between py-3 pl-4 pr-4 border-b border-border-light last:border-b-0 group ${
          hasCards ? "cursor-pointer hover:bg-surface-secondary/60" : ""
        } transition-colors`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-4 flex items-center justify-center shrink-0">
            {hasCards ? <Chevron open={open} /> : null}
          </span>
          <BrandLogo slug={program.brandSlug} size={36} />
          <div className="min-w-0">
            <div className="font-medium text-text-primary truncate group-hover:text-text-accent transition-colors">
              {program.displayName}
            </div>
            {programIdentityLabel(program) && (
              <div className="text-xs text-text-secondary mt-0.5 truncate tabular-nums">
                {programIdentityLabel(program)}
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 pl-4">
          {hasAnyBalance ? (
            <>
              <div className="flex items-baseline justify-end gap-2">
                <div className="text-base font-semibold tabular-nums text-text-primary">
                  {hasTotal
                    ? formatBalance(program.totalBalance!, program.currency)
                    : "—"}
                </div>
                {hasYtd && (
                  <div className="text-xs tabular-nums text-text-secondary">
                    {formatBalance(program.ytdBalance!, program.currency)}{" "}
                    <span className="uppercase tracking-wide text-text-tertiary">
                      YTD
                    </span>
                  </div>
                )}
              </div>
              {displayedLastUpdated && (
                <div className="mt-0.5">
                  <LastUpdated
                    iso={displayedLastUpdated}
                    url={program.syncUrl}
                  />
                </div>
              )}
            </>
          ) : (
            <a
              href={program.syncUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-text-accent hover:text-text-accent-hover transition-colors"
            >
              Get Balance
            </a>
          )}
        </div>
      </div>

      {open &&
        hasCards &&
        program.cards.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            ownerLabel={program.ownerLabel}
            currency={program.currency}
          />
        ))}
    </>
  );
}

/* ── Category section (Banks / Airlines / Hotels) ────────── */

function CategorySection({
  title,
  programs,
  emptyMessage,
  defaultOpen = true,
}: {
  title: string;
  programs: ProgramRowData[];
  emptyMessage: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Only sum programs whose currency matches what we can aggregate.
  // Mixing points + miles + cents would be nonsense, so the category
  // header only shows a total when every program shares a currency.
  const programsWithData = programs.filter((p) => p.totalBalance !== null);
  const currencies = new Set(programsWithData.map((p) => p.currency));
  const sameCurrency =
    programsWithData.length > 0 && currencies.size === 1
      ? programsWithData[0].currency
      : null;
  const total = sameCurrency
    ? programsWithData.reduce((sum, p) => sum + (p.totalBalance ?? 0), 0)
    : null;
  const programCount = programs.length;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between py-4 px-4 cursor-pointer hover:bg-surface-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Chevron open={open} size={20} />
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {programCount > 0 && (
            <span className="text-xs text-text-tertiary">
              {programCount} {programCount === 1 ? "program" : "programs"}
            </span>
          )}
        </div>
        <div className="text-right">
          {total !== null && sameCurrency ? (
            <div className="text-xl font-semibold tabular-nums text-text-primary">
              {formatBalance(total, sameCurrency)}
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">—</div>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-border">
          {programs.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-sm text-text-tertiary">{emptyMessage}</p>
            </div>
          ) : (
            programs.map((program) => (
              <ProgramRow key={program.programRowId} program={program} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main ProgramsList ───────────────────────────────────── */

export default function ProgramsList({
  banks,
  airlines,
  hotels,
}: {
  banks: ProgramRowData[];
  airlines: ProgramRowData[];
  hotels: ProgramRowData[];
}) {
  const allPrograms = [...banks, ...airlines, ...hotels];
  // Sum only point/mile programs into the headline; cash balances render
  // separately below.
  const pointsPrograms = allPrograms.filter(
    (p) => p.currency === "points" || p.currency === "miles"
  );
  const cashPrograms = allPrograms.filter((p) => p.currency === "usd_cents");

  const totalPointsAndMiles = pointsPrograms.reduce(
    (sum, p) => sum + (p.totalBalance ?? 0),
    0
  );
  const totalCashCents = cashPrograms.reduce(
    (sum, p) => sum + (p.totalBalance ?? 0),
    0
  );

  const hasAnyData = allPrograms.some((p) => p.totalBalance !== null);

  return (
    <div className="space-y-4">
      {hasAnyData && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary mb-1">
            Total across all programs
          </p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums text-text-primary">
            {totalPointsAndMiles.toLocaleString()}
            <span className="text-base font-normal text-text-secondary ml-2">
              points &amp; miles
            </span>
          </p>
          {totalCashCents > 0 && (
            <p className="text-sm text-text-secondary mt-2 tabular-nums">
              +{" "}
              {(totalCashCents / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}{" "}
              cash
            </p>
          )}
        </div>
      )}

      <CategorySection
        title="Banks"
        programs={banks}
        emptyMessage="No bank rewards programs yet. Sync an Amex, Chase, or Capital One account to get started."
      />
      <CategorySection
        title="Airlines"
        programs={airlines}
        emptyMessage="No airline programs yet."
      />
      <CategorySection
        title="Hotels"
        programs={hotels}
        emptyMessage="No hotel programs yet."
      />
    </div>
  );
}
