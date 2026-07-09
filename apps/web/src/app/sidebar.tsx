"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { UserMenu } from "./user-menu";
import { GearIcon } from "./icons";

interface User {
  name?: string | null;
  email: string;
  image?: string | null;
}

export function Sidebar({
  user,
  pinned,
  onTogglePin,
}: {
  user: User;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  // Phones force the collapsed rail via the globals.css media query no
  // matter what the pin preference says, so treat the sidebar as unpinned
  // there — otherwise a saved pinned=true would leave `width` at the
  // (media-forced) 56px on tap and the user-menu popover would open
  // inside a 56px-wide clipped rail.
  const isMobile = useIsMobile();
  const pinnedEffective = pinned && !isMobile;
  const expanded = pinnedEffective || hovered;

  // Width comes from `--sidebar-width` (pre-hydrated via
  // `html[data-sidebar-pinned]`) so the first paint already matches the
  // saved state. When unpinned + hovered (or tapped, on touch), we
  // override to the expanded width so the sidebar can float over the
  // reserved gutter.
  const overlay = !pinnedEffective && hovered;
  const width = overlay ? "var(--sidebar-expanded)" : "var(--sidebar-width)";

  // Clicking the pin while the cursor is still over the sidebar would
  // leave `hovered = true`, so `expanded = pinned || hovered` would stay
  // expanded and the user gets no visual feedback from the click. Force
  // the hover flag down alongside the pin toggle; mouseenter will
  // legitimately re-set it once the cursor leaves and returns.
  function handleTogglePin() {
    onTogglePin();
    setHovered(false);
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width,
        boxShadow: overlay ? "4px 0 20px rgba(34,32,29,0.08)" : undefined,
      }}
      className="fixed left-0 top-0 z-40 h-screen bg-background border-r border-border overflow-hidden transition-[width] duration-150 ease-out"
    >
      <div className="flex flex-col h-full p-2 gap-3">
        {/* Top row: logo + action icons (icons only show when expanded) */}
        <div className="flex items-center gap-1 min-h-[44px]">
          <Link
            href="/dashboard"
            className="shrink-0 p-1 rounded-md"
            aria-label="PointsGeek"
          >
            <img
              src="/brand/icon.svg"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="rounded-md"
            />
          </Link>
          <div
            // Suppress the dev-mode hydration warning for this subtree:
            // its className derives from state that only settles after
            // mount (`expanded = pinned || hovered`), and React's
            // `suppressHydrationWarning` lets the attribute reconcile
            // cleanly instead of throwing a recoverable error.
            suppressHydrationWarning
            className={`flex items-center gap-0.5 ml-auto transition-opacity duration-150 ${
              expanded ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <IconAction href="/settings" title="Settings">
              <GearIcon />
            </IconAction>
            <IconAction
              onClick={handleTogglePin}
              title={pinned ? "Collapse sidebar" : "Pin sidebar"}
            >
              <CollapseIcon />
            </IconAction>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5">
          <NavItem
            href="/dashboard"
            icon={<HomeIcon />}
            label="Dashboard"
            active={pathname.startsWith("/dashboard")}
            expanded={expanded}
          />
          <NavItem
            href="/accounts"
            icon={<LayersIcon />}
            label="Accounts"
            active={pathname.startsWith("/accounts")}
            expanded={expanded}
          />
          <NavItem
            href="/extension"
            icon={<ExtensionIcon />}
            label="Extension"
            active={pathname.startsWith("/extension")}
            expanded={expanded}
          />
        </nav>

        <div className="flex-1" />

        {/* Bottom: user popover */}
        <UserMenu user={user} expanded={expanded} />
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
  expanded,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      href={href}
      title={expanded ? undefined : label}
      className={`flex items-center gap-3 h-10 px-2 rounded-lg transition-colors ${
        active
          ? "bg-surface-secondary text-text-primary"
          : "text-text-secondary hover:bg-surface-secondary/60 hover:text-text-primary"
      }`}
    >
      <span className="shrink-0 w-6 flex items-center justify-center">
        {icon}
      </span>
      <span
        className={`truncate text-sm font-medium transition-opacity duration-150 ${
          expanded ? "opacity-100" : "opacity-0"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

function IconAction({
  href,
  onClick,
  title,
  children,
}: {
  href?: string;
  onClick?: () => void;
  title: string;
  children: ReactNode;
}) {
  const className =
    "w-7 h-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-secondary/60 transition-colors";
  if (href) {
    return (
      <Link href={href} title={title} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} className={className}>
      {children}
    </button>
  );
}

/**
 * Matches the `max-width: 767px` breakpoint the sidebar CSS vars key off
 * (globals.css). SSR + first client render report `false` so hydration
 * matches the server; the real value settles right after mount.
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

/* ── Icons (hand-rolled, matches design-system conventions) ─── */

function HomeIcon() {
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
      <path d="M3 10.5L12 3l9 7.5V21H15v-7H9v7H3z" />
    </svg>
  );
}

function LayersIcon() {
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
      <path d="M12 3 3 7l9 4 9-4-9-4Z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </svg>
  );
}

function ExtensionIcon() {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 15h4" />
      <path d="M16 15h.01" />
    </svg>
  );
}

function CollapseIcon() {
  // Static sidebar glyph — a panel with a fixed divider on the left.
  // Same shape regardless of pinned state (Monarch does the same).
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}
