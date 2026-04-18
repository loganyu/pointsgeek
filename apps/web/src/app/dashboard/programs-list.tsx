"use client";

import { useState } from "react";
import { ProgramLogo } from "./program-logo";

export interface CardData {
  id: string;
  cardName: string;
  lastFour: string | null;
  balance: number | null;
  lastUpdated: string | null;
}

export interface ProgramData {
  providerId: string;
  label: string;
  short: string;
  url: string;
  issuer: string;
  programName: string;
  programType: "bank_rewards" | "airline" | "hotel";
  totalBalance: number | null;
  lastUpdated: string | null;
  cards: CardData[];
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

function formatBalance(n: number): string {
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
 * Timestamp + refresh link
 * Clicking the refresh icon opens the issuer's site in a new tab — once the
 * user logs in there, the content script scrapes and updates the balance.
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
        {/* style dark tooltip */}
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-[var(--text-primary)] text-[var(--background)] px-2.5 py-1.5 text-xs font-medium shadow-lg opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100"
        >
          Log in to refresh
          {/* Arrow pointing down at the icon */}
          <span
            aria-hidden="true"
            className="absolute top-full right-2 h-0 w-0 border-4 border-transparent border-t-[var(--text-primary)]"
          />
        </span>
      </a>
    </div>
  );
}

/* ── Card row (innermost, rendered under an expanded program) ── */

function CardRow({ card, issuer }: { card: CardData; issuer: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 pl-16 pr-4 border-b border-border-light last:border-b-0 bg-surface-secondary/40">
      <div className="flex items-center gap-3 min-w-0">
        <ProgramLogo issuer={issuer} size={24} />
        <span className="text-sm text-text-primary truncate">
          {card.cardName}
          {card.lastFour && ` (...${card.lastFour})`}
        </span>
      </div>
      <div className="text-right shrink-0 pl-4">
        {card.balance !== null ? (
          <span className="text-sm tabular-nums text-text-primary">
            {formatBalance(card.balance)}
          </span>
        ) : (
          <span className="text-sm text-text-tertiary">—</span>
        )}
      </div>
    </div>
  );
}

/* ── Program row (expandable if it has cards) ────────────── */

function ProgramRow({ program }: { program: ProgramData }) {
  const [open, setOpen] = useState(false);
  const hasCards = program.cards.length > 0;
  const hasData = program.totalBalance !== null;

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
          <ProgramLogo issuer={program.issuer} size={36} />
          <div className="min-w-0">
            <div className="font-medium text-text-primary truncate group-hover:text-text-accent transition-colors">
              {program.label}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
              {program.programName}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0 pl-4">
          {hasData ? (
            <>
              <div className="text-base font-semibold tabular-nums text-text-primary">
                {formatBalance(program.totalBalance!)}
              </div>
              {program.lastUpdated && (
                <div className="mt-0.5">
                  <LastUpdated iso={program.lastUpdated} url={program.url} />
                </div>
              )}
            </>
          ) : (
            <a
              href={program.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-text-accent hover:text-text-accent-hover transition-colors"
            >
              Sync →
            </a>
          )}
        </div>
      </div>

      {open &&
        hasCards &&
        program.cards.map((card) => (
          <CardRow key={card.id} card={card} issuer={program.issuer} />
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
  programs: ProgramData[];
  emptyMessage: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const programsWithData = programs.filter((p) => p.totalBalance !== null);
  const total = programsWithData.reduce(
    (sum, p) => sum + (p.totalBalance ?? 0),
    0,
  );
  const hasAnyData = programsWithData.length > 0;
  const programCount = programs.length;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Category header (clickable) */}
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
          {hasAnyData ? (
            <div className="text-xl font-semibold tabular-nums text-text-primary">
              {formatBalance(total)}
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">—</div>
          )}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="border-t border-border">
          {programs.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-sm text-text-tertiary">{emptyMessage}</p>
            </div>
          ) : (
            programs.map((program) => (
              <ProgramRow key={program.providerId} program={program} />
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
  banks: ProgramData[];
  airlines: ProgramData[];
  hotels: ProgramData[];
}) {
  const allPrograms = [...banks, ...airlines, ...hotels];
  const totalPoints = allPrograms.reduce(
    (sum, p) => sum + (p.totalBalance ?? 0),
    0,
  );
  const hasAnyData = allPrograms.some((p) => p.totalBalance !== null);

  return (
    <div className="space-y-4">
      {/* Total summary card */}
      {hasAnyData && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary mb-1">
            Total across all programs
          </p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums text-text-primary">
            {totalPoints.toLocaleString()}
            <span className="text-base font-normal text-text-secondary ml-2">
              points &amp; miles
            </span>
          </p>
        </div>
      )}

      {/* Category cards */}
      <CategorySection
        title="Banks"
        programs={banks}
        emptyMessage="No bank rewards programs yet."
      />
      <CategorySection
        title="Airlines"
        programs={airlines}
        emptyMessage="No airline programs yet."
      />
      <CategorySection
        title="Hotels"
        programs={hotels}
        emptyMessage="No hotel programs yet. Sync a hotel rewards site to get started."
      />
    </div>
  );
}
