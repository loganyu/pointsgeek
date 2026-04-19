"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  INSTITUTIONS,
  type Institution,
  type InstitutionCategory,
} from "@/lib/institutions";
import { BrandLogo } from "./brand-logo";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Native `<dialog>` under the hood — focus trap, Escape-to-close, and
 * backdrop behaviour come for free. We only layer on the brand styling
 * and the search / drill-down UX.
 */
export function AddProgramModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<InstitutionCategory | null>(null);

  // Drive the dialog imperatively so the native focus trap + backdrop work.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActiveCategory(null);
      d.showModal();
      // Autofocus the search after the open transition.
      requestAnimationFrame(() => searchRef.current?.focus());
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function handleClose() {
    setQuery("");
    setActiveCategory(null);
    onClose();
  }

  // Click on the dialog itself (not on nested content) = backdrop click.
  function onDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) handleClose();
  }

  const trimmed = query.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const visible = useMemo<Institution[]>(() => {
    if (isSearching) {
      return INSTITUTIONS.filter((i) =>
        i.name.toLowerCase().includes(trimmed)
      );
    }
    if (activeCategory) {
      return INSTITUTIONS.filter((i) => i.category === activeCategory);
    }
    return [];
  }, [trimmed, activeCategory, isSearching]);

  const showCategoryTiles = !isSearching && activeCategory === null;
  const showBack = activeCategory !== null && !isSearching;

  const title = showCategoryTiles
    ? "Add program"
    : isSearching
      ? "Search programs"
      : activeCategory
        ? CATEGORY_LABELS[activeCategory]
        : "Add program";

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={onDialogClick}
      className="fixed top-[8vh] left-1/2 -translate-x-1/2 h-fit m-0 rounded-xl border border-border bg-surface p-0 w-[calc(100vw-2rem)] max-w-md backdrop:bg-black/50 text-text-primary"
    >
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {showBack && (
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors p-1 -m-1"
                aria-label="Back"
              >
                <BackIcon />
              </button>
            )}
            <h2 className="text-lg font-semibold truncate">{title}</h2>
            {showCategoryTiles && (
              <span
                tabIndex={0}
                className="group/tip relative inline-flex items-center text-text-tertiary hover:text-text-primary focus:text-text-primary transition-colors cursor-help outline-none"
                aria-describedby="add-program-tooltip"
              >
                <InfoIcon />
                <span
                  id="add-program-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap rounded-md bg-[var(--text-primary)] text-[var(--background)] px-2.5 py-1.5 text-xs font-medium shadow-lg opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100 group-focus/tip:opacity-100 z-10"
                >
                  Log in to program to sync data
                  <span
                    aria-hidden="true"
                    className="absolute bottom-full left-1/2 -translate-x-1/2 h-0 w-0 border-4 border-transparent border-b-[var(--text-primary)]"
                  />
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors p-1 -m-1"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mb-4 relative">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-3 flex items-center text-text-tertiary"
          >
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search programs…"
            className="w-full rounded-lg border border-border bg-surface-secondary/40 pl-9 pr-3 py-2 text-sm placeholder:text-text-tertiary focus:outline-none focus:border-text-accent transition-colors"
          />
        </div>

        {showCategoryTiles ? (
          <div className="flex flex-col gap-2">
            {CATEGORY_ORDER.map((cat) => (
              <CategoryTile
                key={cat}
                category={cat}
                onOpen={() => setActiveCategory(cat)}
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-tertiary">
            No programs found.
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {visible.map((inst) => (
              <InstitutionRow
                key={inst.name}
                institution={inst}
                onSelect={handleClose}
              />
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}

function CategoryTile({
  category,
  onOpen,
}: {
  category: InstitutionCategory;
  onOpen: () => void;
}) {
  const items = INSTITUTIONS.filter((i) => i.category === category);
  const previews = items.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center justify-between gap-4 py-3 pl-4 pr-4 rounded-xl bg-surface-secondary hover:bg-border transition-colors text-left"
    >
      <div className="min-w-0">
        <div className="font-medium text-text-primary">
          {CATEGORY_LABELS[category]}
        </div>
        <div className="text-xs text-text-secondary mt-0.5">
          {items.length} programs
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex -space-x-2">
          {previews.map((i) => (
            <div key={i.name} className="ring-2 ring-surface rounded-full">
              <BrandLogo
                slug={
                  i.brandSlug ??
                  i.name.toLowerCase().replace(/\s+/g, "-")
                }
                size={28}
              />
            </div>
          ))}
        </div>
        <ChevronRight />
      </div>
    </button>
  );
}

function InstitutionRow({
  institution,
  onSelect,
}: {
  institution: Institution;
  onSelect: () => void;
}) {
  const slug =
    institution.brandSlug ??
    institution.name.toLowerCase().replace(/\s+/g, "-");
  const hostname = hostnameOf(institution.url);

  function openSite() {
    window.open(institution.url, "_blank", "noopener,noreferrer");
    onSelect();
  }

  return (
    <button
      type="button"
      onClick={openSite}
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-surface-secondary hover:bg-border transition-colors text-left"
    >
      <BrandLogo slug={slug} size={36} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {institution.name}
        </div>
        <div className="text-xs text-text-secondary truncate tabular-nums">
          {hostname}
        </div>
      </div>
    </button>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function BackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-tertiary shrink-0"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
