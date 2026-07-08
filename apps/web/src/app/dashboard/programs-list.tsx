"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  /** Denormalized from `points_programs.last_sync_*`. When the most
   *  recent scrape attempt failed, `lastSyncStatus` is "failed" and the
   *  row surfaces a red "Sync failed" badge next to the timestamp. */
  lastSyncStatus: "ok" | "failed" | null;
  lastSyncError: string | null;
  cards: CardRowData[];
}

type SectionKey = "banks" | "rewards" | "airlines" | "hotels";

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "banks",
  "rewards",
  "airlines",
  "hotels",
];
const SECTION_ORDER_KEY = "pg-section-order";
const PROGRAM_ORDERS_KEY = "pg-program-orders";
const SECTION_EXPANDED_KEY = "pg-section-expanded";
const PROGRAM_EXPANDED_KEY = "pg-program-expanded";

/**
 * Scoped collision detection. By default `closestCenter` considers every
 * droppable in the DndContext, which means dragging a *section* into an
 * area overlapping another section's expanded rows picks a row as the
 * collision (row centers are closer than the section's center). The
 * sections SortableContext can't honor that target (rows aren't in its
 * items list), so the section reorder flickers on and off as the
 * collision flips between section vs row targets.
 *
 * We filter the droppable candidates to match the dragged item's kind:
 *   - section drag → only other sections
 *   - program drag → only programs in the same section
 *
 * This also makes the row-reorder animation work smoothly: the row's
 * SortableContext always gets a valid sibling row as `over`, so adjacent
 * rows animate aside instead of snapping when a distant section grabs
 * the collision first.
 */
const scopedCollisionDetection: CollisionDetection = (args) => {
  const { active, droppableContainers } = args;
  const activeData = active.data.current as
    | { type: "section" }
    | { type: "program"; sectionKey: SectionKey }
    | undefined;

  if (!activeData) return closestCenter(args);

  const filtered =
    activeData.type === "section"
      ? droppableContainers.filter(
          (c) => c.data.current?.type === "section"
        )
      : droppableContainers.filter((c) => {
          const data = c.data.current as
            | { type?: string; sectionKey?: SectionKey }
            | undefined;
          return (
            data?.type === "program" &&
            data.sectionKey === activeData.sectionKey
          );
        });

  return closestCenter({ ...args, droppableContainers: filtered });
};

/**
 * Reads the full boolean map stored at `mapKey`. Returns an empty object
 * on SSR, missing data, or malformed JSON — callers fall back to the
 * provided default per-item.
 */
function loadBooleanMap(mapKey: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(mapKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // fall through
  }
  return {};
}

function saveBooleanEntry(mapKey: string, itemKey: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    const current = loadBooleanMap(mapKey);
    localStorage.setItem(
      mapKey,
      JSON.stringify({ ...current, [itemKey]: value })
    );
  } catch {
    // ignore — preference will simply not persist this toggle
  }
}

/**
 * React state bound to a boolean entry inside a JSON map in localStorage.
 * The lazy initializer reads the map once on first render (safe here
 * because the parent `mounted` gate ensures this runs on the client).
 */
function usePersistedBoolean(
  mapKey: string,
  itemKey: string,
  defaultValue: boolean
): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const map = loadBooleanMap(mapKey);
    const stored = map[itemKey];
    return typeof stored === "boolean" ? stored : defaultValue;
  });

  function set(next: boolean) {
    setValue(next);
    saveBooleanEntry(mapKey, itemKey, next);
  }

  return [value, set];
}

/**
 * Sub-line label beside a program row. Direct loyalty accounts prefer an
 * owner / membership number; bank rows can fall back to the card portion
 * of the display-name/card id so same-provider accounts are readable.
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
  if (p.programType === "bank_rewards") {
    const cardLastFour = accountCardLastFour(p);
    if (cardLastFour) {
      parts.push(`Account with card ${cardLastFour}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function accountCardLastFour(p: ProgramRowData): string | null {
  if (p.externalAccountId.startsWith("card:")) {
    const lastFour = p.externalAccountId.split(":").at(-1);
    return lastFour && /^\d{4}$/.test(lastFour) ? lastFour : null;
  }
  const card = p.cards.find((c) => c.lastFour);
  return card?.lastFour ?? null;
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

/**
 * Re-orders `items` to match the persisted `order` array. Items whose ids
 * don't appear in `order` (e.g. newly added programs) are appended at the
 * end in their incoming order. Items in `order` that no longer exist are
 * silently skipped. Stable and deterministic — good for a drag reorder
 * that needs to survive data refreshes.
 */
function sortByIds<T>(
  items: T[],
  order: string[],
  getId: (item: T) => string
): T[] {
  if (order.length === 0) return items;
  const map = new Map(items.map((i) => [getId(i), i]));
  const known = new Set<string>();
  const result: T[] = [];
  for (const id of order) {
    const item = map.get(id);
    if (item) {
      result.push(item);
      known.add(id);
    }
  }
  for (const item of items) {
    if (!known.has(getId(item))) result.push(item);
  }
  return result;
}

/* ── Icons ───────────────────────────────────────────────── */

/**
 * Expand/collapse caret. Wrapped in a rounded hitbox so that the row's
 * `group` hover state can paint a subtle circle outline around it —
 * matches the Monarch "affordance appears on hover" pattern.
 */
function Chevron({
  open,
  size = 12,
  hitbox = 22,
}: {
  open: boolean;
  size?: number;
  hitbox?: number;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: hitbox, height: hitbox }}
      className="shrink-0 inline-flex items-center justify-center rounded-full border border-transparent group-hover:border-border transition-colors duration-150"
    >
      <svg
        className={`text-text-tertiary transition-transform duration-200 ${
          open ? "rotate-90" : ""
        }`}
        style={{ width: size, height: size }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.25}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </span>
  );
}

/**
 * Monarch-style drag affordance: tiny 2×4 dot grid that fades in on row
 * hover. Positioned absolutely in the row's left padding so it hugs the
 * edge without pushing content. `pointer-events-none` so the whole row
 * (not just the dots) can act as the drag handle.
 */
function DragDots({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none grid grid-cols-2 gap-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${className}`}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          className="block w-[2px] h-[2px] rounded-full bg-text-tertiary"
        />
      ))}
    </span>
  );
}

/**
 * Animated show/hide wrapper using the grid-template-rows trick: when
 * `open`, the outer grid row holds `1fr` (content's natural height);
 * when closed, `0fr` clips it to zero. The inner `overflow-hidden` hides
 * overflowing content during the transition. Content stays in the DOM
 * so React state/scroll position inside persists between toggles.
 */
function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={!open}
      className="grid transition-[grid-template-rows] duration-300 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
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
 *
 * When `syncFailed` is true, the timestamp is preceded by a red
 * "Sync failed" badge. The hover title shows the server-side error code
 * / message so the user (and we, during support) can diagnose quickly.
 */
function LastUpdated({
  iso,
  url,
  syncFailed = false,
  syncError = null,
}: {
  iso: string;
  url: string;
  syncFailed?: boolean;
  syncError?: string | null;
}) {
  return (
    <div className="flex items-center gap-1 justify-end">
      {syncFailed && (
        <span
          className="text-xs font-medium text-red-600 dark:text-red-400"
          title={syncError ?? "Last sync attempt failed"}
        >
          Sync failed ·
        </span>
      )}
      <span className="text-xs text-text-tertiary">{timeAgo(iso)}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Log in to sync data"
        className="group/tip relative inline-flex items-center justify-center p-1 -m-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
      >
        <RefreshIcon />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-[var(--text-primary)] text-[var(--background)] px-2.5 py-1.5 text-xs font-medium shadow-lg opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100"
        >
          Log in to sync data
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
  const [open, setOpen] = usePersistedBoolean(
    PROGRAM_EXPANDED_KEY,
    program.programRowId,
    false
  );
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
        className={`relative flex items-center justify-between py-3 pl-3 pr-4 border-b border-border-light last:border-b-0 group ${
          hasCards ? "hover:bg-surface-secondary/60" : ""
        } transition-colors`}
      >
        <DragDots className="absolute left-[4px] top-1/2 -translate-y-1/2" />
        <div className="flex items-center gap-2 min-w-0">
          {hasCards ? (
            <Chevron open={open} />
          ) : (
            // Reserve the chevron's width so the brand logo aligns across
            // programs with and without expandable cards.
            <span aria-hidden="true" className="shrink-0 w-[22px]" />
          )}
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
                {/* When BOTH total and YTD exist, YTD sits to the left of
                 *  the total in smaller text so the right edge of every
                 *  row aligns on the total. When only YTD is available
                 *  (e.g. Marriott via the Amex overview tile, before a
                 *  direct marriott.com scrape has happened), YTD takes
                 *  the rightmost primary slot instead of leaving an
                 *  em-dash there — otherwise the figure drifts left and
                 *  breaks column alignment. */}
                {hasTotal && hasYtd && (
                  <div className="text-xs tabular-nums text-text-secondary">
                    {formatBalance(program.ytdBalance!, program.currency)}{" "}
                    <span className="uppercase tracking-wide text-text-tertiary">
                      YTD
                    </span>
                  </div>
                )}
                <div className="text-base font-semibold tabular-nums text-text-primary">
                  {hasTotal ? (
                    formatBalance(program.totalBalance!, program.currency)
                  ) : hasYtd ? (
                    <>
                      {formatBalance(program.ytdBalance!, program.currency)}
                      <span className="ml-1.5 text-xs font-normal uppercase tracking-wide text-text-tertiary">
                        YTD
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              {displayedLastUpdated && (
                <div className="mt-0.5">
                  <LastUpdated
                    iso={displayedLastUpdated}
                    url={program.syncUrl}
                    syncFailed={program.lastSyncStatus === "failed"}
                    syncError={program.lastSyncError}
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

      {hasCards && (
        <Collapsible open={open}>
          {program.cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              ownerLabel={program.ownerLabel}
              currency={program.currency}
            />
          ))}
        </Collapsible>
      )}
    </>
  );
}

/**
 * Wraps a `ProgramRow` in a `useSortable` so it can be dragged within its
 * category section. The drag activator is scoped to the `<DragDots>`
 * element via `setActivatorNodeRef`, so the rest of the row still behaves
 * as a click target (expand/collapse).
 */
function SortableProgramRow({
  program,
  sectionKey,
}: {
  program: ProgramRowData;
  sectionKey: SectionKey;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: program.programRowId,
    data: { type: "program", sectionKey },
    // Slower, smoother settle than the dnd-kit default (200ms) so adjacent
    // rows glide into place instead of snapping.
    transition: {
      duration: 280,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    },
  });

  // With `DragOverlay` rendering the floating preview, the source row just
  // fades to a ghost in-place. The overlay owns the shadow / elevation.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="select-none touch-none cursor-grab"
    >
      <ProgramRow program={program} />
    </div>
  );
}

/* ── Category section (Banks / Airlines / Hotels) ────────── */

function CategorySection({
  sectionKey,
  title,
  programs,
  emptyMessage,
  defaultOpen = true,
}: {
  sectionKey: SectionKey;
  title: string;
  programs: ProgramRowData[];
  emptyMessage: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = usePersistedBoolean(
    SECTION_EXPANDED_KEY,
    sectionKey,
    defaultOpen
  );

  // Same hierarchy as the main headline: points + miles get aggregated
  // on the primary line, cash (usd_cents) drops to a "+$X cash" subtitle.
  // Matters for Banks, which mixes Ultimate Rewards / Membership Rewards
  // points with Amex Reward Dollars (cents).
  const pointsMilesTotal = programs
    .filter(
      (p) =>
        p.totalBalance !== null &&
        (p.currency === "points" || p.currency === "miles")
    )
    .reduce((sum, p) => sum + (p.totalBalance ?? 0), 0);
  const cashCentsTotal = programs
    .filter((p) => p.totalBalance !== null && p.currency === "usd_cents")
    .reduce((sum, p) => sum + (p.totalBalance ?? 0), 0);
  const hasPointsMiles = pointsMilesTotal > 0;
  const hasCash = cashCentsTotal > 0;
  const programCount = programs.length;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div
        onClick={() => setOpen(!open)}
        className="relative group flex items-center justify-between py-4 pl-3 pr-4 hover:bg-surface-secondary/40 transition-colors"
      >
        <DragDots className="absolute left-[4px] top-1/2 -translate-y-1/2" />
        <div className="flex items-center gap-2">
          <Chevron open={open} size={14} hitbox={26} />
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {programCount > 0 && (
            <span className="text-xs text-text-tertiary">
              {programCount} {programCount === 1 ? "program" : "programs"}
            </span>
          )}
        </div>
        <div className="text-right">
          {hasPointsMiles || hasCash ? (
            <div>
              {hasPointsMiles && (
                <div className="text-xl font-semibold tabular-nums text-text-primary">
                  {pointsMilesTotal.toLocaleString()}
                </div>
              )}
              {hasCash && (
                <div
                  className={
                    hasPointsMiles
                      ? "text-xs text-text-secondary mt-0.5 tabular-nums"
                      : "text-xl font-semibold tabular-nums text-text-primary"
                  }
                >
                  {hasPointsMiles ? "+ " : ""}
                  {(cashCentsTotal / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                  {hasPointsMiles ? " cash" : ""}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">—</div>
          )}
        </div>
      </div>

      <Collapsible open={open}>
        <div className="border-t border-border">
          {programs.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-sm text-text-tertiary">{emptyMessage}</p>
            </div>
          ) : (
            <SortableContext
              items={programs.map((p) => p.programRowId)}
              strategy={verticalListSortingStrategy}
            >
              {programs.map((program) => (
                <SortableProgramRow
                  key={program.programRowId}
                  program={program}
                  sectionKey={sectionKey}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

/**
 * Section-level sortable wrapper — reorders the whole Banks/Airlines/
 * Hotels cards, not the rows inside them. The drag activator is scoped
 * to DragDots via `setActivatorNodeRef`, leaving the header click free
 * to expand/collapse the section.
 */
function SortableCategorySection({
  sectionKey,
  ...rest
}: {
  sectionKey: SectionKey;
  title: string;
  programs: ProgramRowData[];
  emptyMessage: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionKey,
    data: { type: "section" },
    transition: {
      duration: 280,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    },
  });

  // With `DragOverlay` rendering the floating preview, the source section
  // just fades in place. The overlay owns the shadow / elevation.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  // Whole-section drag: the section card is grabbable; the header's own
  // click-to-expand still fires because the 4px activation constraint
  // treats a click without motion as a normal click event.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="select-none touch-none cursor-grab"
    >
      <CategorySection sectionKey={sectionKey} {...rest} />
    </div>
  );
}

/* ── Main ProgramsList ───────────────────────────────────── */

export default function ProgramsList({
  banks,
  rewards,
  airlines,
  hotels,
}: {
  banks: ProgramRowData[];
  rewards: ProgramRowData[];
  airlines: ProgramRowData[];
  hotels: ProgramRowData[];
}) {
  const allPrograms = [...banks, ...rewards, ...airlines, ...hotels];
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

  // Drag/reorder state. We hold the defaults for SSR + the first client
  // render to keep hydration quiet; `mounted` gates the actual list so the
  // user never sees the server-default order flicker before the persisted
  // order loads from localStorage (Monarch does the same with a spinner).
  const [sectionOrder, setSectionOrder] =
    useState<SectionKey[]>(DEFAULT_SECTION_ORDER);
  const [programOrders, setProgramOrders] = useState<
    Record<SectionKey, string[]>
  >({ banks: [], rewards: [], airlines: [], hotels: [] });
  const [mounted, setMounted] = useState(false);
  // Currently-dragged item, rendered into the DragOverlay so it floats
  // above every stacking context (including section cards with
  // `overflow-hidden`) and gets the built-in snap-back drop animation.
  const [activeDrag, setActiveDrag] = useState<
    | { type: "section"; sectionKey: SectionKey }
    | { type: "program"; program: ProgramRowData }
    | null
  >(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTION_ORDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((x): x is SectionKey =>
            DEFAULT_SECTION_ORDER.includes(x as SectionKey)
          );
          // If the stored list is missing a known key (e.g. we add a new
          // section later), append missing keys so every one still renders.
          const missing = DEFAULT_SECTION_ORDER.filter(
            (k) => !valid.includes(k)
          );
          setSectionOrder([...valid, ...missing]);
        }
      }
    } catch {
      // ignore malformed JSON
    }
    try {
      const raw = localStorage.getItem(PROGRAM_ORDERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setProgramOrders({
            banks: Array.isArray(parsed.banks) ? parsed.banks : [],
            rewards: Array.isArray(parsed.rewards) ? parsed.rewards : [],
            airlines: Array.isArray(parsed.airlines) ? parsed.airlines : [],
            hotels: Array.isArray(parsed.hotels) ? parsed.hotels : [],
          });
        }
      }
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  const orderedPrograms = useMemo(
    () => ({
      banks: sortByIds(banks, programOrders.banks, (p) => p.programRowId),
      rewards: sortByIds(
        rewards,
        programOrders.rewards,
        (p) => p.programRowId
      ),
      airlines: sortByIds(
        airlines,
        programOrders.airlines,
        (p) => p.programRowId
      ),
      hotels: sortByIds(hotels, programOrders.hotels, (p) => p.programRowId),
    }),
    [banks, rewards, airlines, hotels, programOrders]
  );

  const sectionInfo: Record<
    SectionKey,
    { title: string; emptyMessage: string }
  > = {
    banks: {
      title: "Banks",
      emptyMessage:
        "No bank rewards programs yet. Sync an Amex, Chase, or Capital One account to get started.",
    },
    rewards: {
      title: "Reward Programs",
      emptyMessage: "No reward programs yet.",
    },
    airlines: {
      title: "Airlines",
      emptyMessage: "No airline programs yet.",
    },
    hotels: {
      title: "Hotels",
      emptyMessage: "No hotel programs yet.",
    },
  };

  const sensors = useSensors(
    // 4px distance keeps short clicks from starting a drag, so clicking the
    // DragDots area still bubbles to expand/collapse handlers if no pointer
    // movement happens.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function handleDragStart(event: DragStartEvent) {
    // Global cursor override: guarantees the grabbing cursor sticks even
    // when the pointer momentarily leaves the DragOverlay bounds (fast
    // gestures, page scroll, etc.).
    document.body.style.cursor = "grabbing";
    const data = event.active.data.current as
      | { type: "section" }
      | { type: "program"; sectionKey: SectionKey }
      | undefined;
    if (data?.type === "section") {
      setActiveDrag({
        type: "section",
        sectionKey: event.active.id as SectionKey,
      });
      return;
    }
    if (data?.type === "program") {
      const id = event.active.id as string;
      for (const key of DEFAULT_SECTION_ORDER) {
        const program = orderedPrograms[key].find(
          (p) => p.programRowId === id
        );
        if (program) {
          setActiveDrag({ type: "program", program });
          return;
        }
      }
    }
  }

  function handleDragCancel() {
    document.body.style.cursor = "";
    setActiveDrag(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    document.body.style.cursor = "";
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeData = active.data.current as
      | { type: "section" }
      | { type: "program"; sectionKey: SectionKey }
      | undefined;

    if (activeData?.type === "section") {
      const oldIndex = sectionOrder.indexOf(active.id as SectionKey);
      const newIndex = sectionOrder.indexOf(over.id as SectionKey);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(sectionOrder, oldIndex, newIndex);
      setSectionOrder(next);
      try {
        localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return;
    }

    if (activeData?.type === "program") {
      const sectionKey = activeData.sectionKey;
      const currentIds = orderedPrograms[sectionKey].map(
        (p) => p.programRowId
      );
      const oldIndex = currentIds.indexOf(active.id as string);
      const newIndex = currentIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const nextIds = arrayMove(currentIds, oldIndex, newIndex);
      setProgramOrders((prev) => {
        const updated = { ...prev, [sectionKey]: nextIds };
        try {
          localStorage.setItem(PROGRAM_ORDERS_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    }
  }

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

      {mounted ? (
        <DndContext
          sensors={sensors}
          collisionDetection={scopedCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={sectionOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {sectionOrder.map((key) => (
                <SortableCategorySection
                  key={key}
                  sectionKey={key}
                  title={sectionInfo[key].title}
                  programs={orderedPrograms[key]}
                  emptyMessage={sectionInfo[key].emptyMessage}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay
            dropAnimation={{
              duration: 250,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
            }}
          >
            {activeDrag?.type === "section" && (
              <SectionDragPreview
                sectionKey={activeDrag.sectionKey}
                title={sectionInfo[activeDrag.sectionKey].title}
                programs={orderedPrograms[activeDrag.sectionKey]}
              />
            )}
            {activeDrag?.type === "program" && (
              <ProgramRowDragPreview program={activeDrag.program} />
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <ProgramsListLoading />
      )}
    </div>
  );
}

/**
 * Floating preview rendered inside `DragOverlay` while a program row is
 * being dragged. Wrapped in a rounded card with an elevation shadow so
 * it visually lifts off the source row (which is rendered as a 30%
 * ghost in place).
 */
function ProgramRowDragPreview({ program }: { program: ProgramRowData }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-2xl overflow-hidden cursor-grabbing">
      <ProgramRow program={program} />
    </div>
  );
}

/**
 * Floating preview for a whole section. We only render the header — the
 * body is large and the inner `SortableContext` would re-register the
 * same program ids as the live tree, conflicting in the DndContext.
 */
function SectionDragPreview({
  sectionKey: _sectionKey,
  title,
  programs,
}: {
  sectionKey: SectionKey;
  title: string;
  programs: ProgramRowData[];
}) {
  const programCount = programs.length;
  const pointsMilesTotal = programs
    .filter(
      (p) =>
        p.totalBalance !== null &&
        (p.currency === "points" || p.currency === "miles")
    )
    .reduce((sum, p) => sum + (p.totalBalance ?? 0), 0);
  const cashCentsTotal = programs
    .filter((p) => p.totalBalance !== null && p.currency === "usd_cents")
    .reduce((sum, p) => sum + (p.totalBalance ?? 0), 0);
  const hasPointsMiles = pointsMilesTotal > 0;
  const hasCash = cashCentsTotal > 0;

  // Colored border on the outside edge mirrors the Monarch drag affordance.
  return (
    <div className="rounded-xl border-2 border-text-accent bg-surface shadow-2xl overflow-hidden cursor-grabbing">
      <div className="flex items-center justify-between py-4 pl-3 pr-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full border border-transparent"
          />
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {programCount > 0 && (
            <span className="text-xs text-text-tertiary">
              {programCount} {programCount === 1 ? "program" : "programs"}
            </span>
          )}
        </div>
        <div className="text-right">
          {hasPointsMiles && (
            <div className="text-xl font-semibold tabular-nums text-text-primary">
              {pointsMilesTotal.toLocaleString()}
            </div>
          )}
          {hasCash && (
            <div
              className={
                hasPointsMiles
                  ? "text-xs text-text-secondary mt-0.5 tabular-nums"
                  : "text-xl font-semibold tabular-nums text-text-primary"
              }
            >
              {hasPointsMiles ? "+ " : ""}
              {(cashCentsTotal / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
              {hasPointsMiles ? " cash" : ""}
            </div>
          )}
          {!hasPointsMiles && !hasCash && (
            <div className="text-sm text-text-tertiary">—</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder shown until the persisted reorder prefs have been read
 * from localStorage. Without this, SSR renders the server-default order,
 * then the first client render re-sorts — producing a visible flicker.
 * A small inline spinner is less jarring than Monarch's full-page
 * "Loading account data" screen for our smaller page footprint.
 */
function ProgramsListLoading() {
  return (
    <div className="rounded-xl border border-border bg-surface py-16 flex flex-col items-center justify-center gap-3">
      <span
        aria-hidden="true"
        className="w-6 h-6 rounded-full border-2 border-border-light border-t-text-accent animate-spin"
      />
      <p className="text-sm text-text-secondary">Loading accounts…</p>
    </div>
  );
}
