"use client";

import { useState } from "react";

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
  currency: string;
  totalBalance: number | null;
  lastUpdated: string | null;
  cards: CardData[];
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatBalance(n: number): string {
  return n.toLocaleString();
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg
      className="w-4 h-4 text-text-tertiary shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
      />
    </svg>
  );
}

/* ── Program Group (collapsible) ─────────────────────────── */

function ProgramGroup({ program }: { program: ProgramData }) {
  const [open, setOpen] = useState(false);
  const hasCards = program.cards.length > 0;
  const hasData = program.totalBalance !== null;

  return (
    <>
      {/* Program header row */}
      <tr
        onClick={() => hasCards && setOpen(!open)}
        className={`border-b border-border group ${
          hasCards ? "cursor-pointer" : ""
        }`}
      >
        {/* Expand chevron + program name */}
        <td className="py-3 pr-3 pl-3">
          <div className="flex items-center gap-3">
            <span className="w-4 flex items-center justify-center shrink-0">
              {hasCards ? <ChevronIcon open={open} /> : null}
            </span>
            <span className="font-medium text-text-primary group-hover:text-text-accent transition-colors">
              {program.label}
            </span>
          </div>
        </td>

        {/* Currency */}
        <td className="py-3 px-3 text-text-secondary text-sm hidden sm:table-cell">
          {program.currency === "miles" ? "Miles" : "Points"}
        </td>

        {/* Last updated */}
        <td className="py-3 px-3 text-text-secondary text-sm hidden md:table-cell">
          {hasData && program.lastUpdated
            ? timeAgo(program.lastUpdated)
            : !hasData
              ? (
                <a
                  href={program.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-text-accent hover:text-text-accent-hover transition-colors"
                >
                  Sync
                </a>
              )
              : "—"}
        </td>

        {/* Balance */}
        <td className="py-3 pl-3 pr-3 text-right">
          {hasData ? (
            <span className="text-lg font-semibold tabular-nums text-text-primary">
              {formatBalance(program.totalBalance!)}
            </span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
      </tr>

      {/* Expanded card rows */}
      {open &&
        hasCards &&
        program.cards.map((card) => (
          <tr
            key={card.id}
            className="border-b border-border-light bg-surface-secondary/50"
          >
            {/* Card name indented */}
            <td className="py-2.5 pr-3 pl-3">
              <div className="flex items-center gap-3 pl-7">
                <CardIcon />
                <span className="text-sm text-text-secondary">
                  {card.cardName}
                </span>
                {card.lastFour && (
                  <span className="text-xs text-text-tertiary">
                    ...{card.lastFour}
                  </span>
                )}
              </div>
            </td>

            {/* Currency — empty for cards */}
            <td className="py-2.5 px-3 hidden sm:table-cell" />

            {/* Last updated */}
            <td className="py-2.5 px-3 text-sm text-text-tertiary hidden md:table-cell">
              {card.lastUpdated ? timeAgo(card.lastUpdated) : "—"}
            </td>

            {/* Balance */}
            <td className="py-2.5 pl-3 pr-3 text-right">
              {card.balance !== null ? (
                <span className="text-sm tabular-nums text-text-secondary">
                  {formatBalance(card.balance)}
                </span>
              ) : (
                <span className="text-sm text-text-tertiary">—</span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

/* ── Main Programs Table ─────────────────────────────────── */

export default function ProgramsList({
  programs,
}: {
  programs: ProgramData[];
}) {
  const totalPoints = programs.reduce(
    (sum, p) => sum + (p.totalBalance ?? 0),
    0
  );
  const hasAnyData = programs.some((p) => p.totalBalance !== null);

  return (
    <div className="space-y-6">
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

      {/* Programs table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-surface-secondary/50">
              <th className="py-2.5 pr-3 pl-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Program
              </th>
              <th className="py-2.5 px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary hidden sm:table-cell">
                Type
              </th>
              <th className="py-2.5 px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary hidden md:table-cell">
                Last Updated
              </th>
              <th className="py-2.5 pl-3 pr-3 text-xs font-medium uppercase tracking-wider text-text-tertiary text-right">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <ProgramGroup key={program.providerId} program={program} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
