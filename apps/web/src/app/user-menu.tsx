"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";

interface User {
  name?: string | null;
  email: string;
  image?: string | null;
}

/**
 * Profile popover at the bottom of the sidebar. Collapsed state renders
 * just the avatar; expanded state shows the name + chevron. Clicking
 * opens a menu with theme toggle, settings, and sign-out — mirrors the
 * Monarch pattern.
 */
export function UserMenu({ user, expanded }: { user: User; expanded: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on click-outside and Escape.
  useEffect(() => {
    if (!open) return;
    function onDocumentDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When the sidebar collapses, force the menu closed so we don't leak
  // a visible popover floating over the main content.
  useEffect(() => {
    if (!expanded) setOpen(false);
  }, [expanded]);

  const isDark = mounted && resolvedTheme === "dark";
  const initial = (user.name ?? user.email).charAt(0).toUpperCase() || "?";
  const buttonTitle = user.name ?? user.email;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => expanded && setOpen((o) => !o)}
        title={expanded ? undefined : buttonTitle}
        className={`w-full flex items-center gap-2 p-1.5 rounded-lg transition-colors ${
          open
            ? "bg-surface-secondary"
            : "hover:bg-surface-secondary/60"
        }`}
      >
        <Avatar image={user.image ?? null} initial={initial} />
        <span
          className={`flex-1 text-left text-sm font-medium text-text-primary truncate transition-opacity duration-150 ${
            expanded ? "opacity-100" : "opacity-0"
          }`}
        >
          {user.name ?? user.email}
        </span>
        {expanded && <ChevronIcon flipped={open} />}
      </button>

      {open && expanded && (
        <div className="absolute left-0 right-0 bottom-full mb-2 rounded-lg border border-border bg-surface shadow-lg py-1 z-50">
          <MenuItem
            icon={isDark ? <SunIcon /> : <MoonIcon />}
            onClick={() => {
              setTheme(isDark ? "light" : "dark");
              setOpen(false);
            }}
          >
            {isDark ? "Light mode" : "Dark mode"}
          </MenuItem>
          <MenuItem
            icon={<GearIcon />}
            href="/settings"
            onSelect={() => setOpen(false)}
          >
            Settings
          </MenuItem>
          <div className="h-px bg-border-light my-1" />
          <MenuItem
            icon={<SignOutIcon />}
            onClick={() => signOut({ callbackUrl: "/" })}
            danger
          >
            Sign out
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function Avatar({
  image,
  initial,
}: {
  image: string | null;
  initial: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className="shrink-0 w-7 h-7 rounded-full border border-border bg-surface-secondary object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-semibold text-white text-xs"
      style={{ backgroundColor: "var(--purple-primary)" }}
    >
      {initial}
    </span>
  );
}

function MenuItem({
  icon,
  onClick,
  href,
  onSelect,
  children,
  danger,
}: {
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  onSelect?: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  const cls = `w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
    danger
      ? "text-text-accent hover:text-text-accent-hover hover:bg-surface-secondary/60"
      : "text-text-primary hover:bg-surface-secondary/60"
  }`;
  if (href) {
    return (
      <Link href={href} onClick={onSelect} className={cls}>
        <span className="shrink-0 w-4 flex items-center justify-center text-text-tertiary">
          {icon}
        </span>
        <span>{children}</span>
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <span className="shrink-0 w-4 flex items-center justify-center text-text-tertiary">
        {icon}
      </span>
      <span>{children}</span>
    </button>
  );
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
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
      className={`shrink-0 text-text-tertiary transition-transform duration-200 ${
        flipped ? "rotate-180" : ""
      }`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SunIcon() {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
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
      <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function GearIcon() {
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
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SignOutIcon() {
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
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
