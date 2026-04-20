"use client";

import { Sidebar } from "./sidebar";
import { SIDEBAR_PINNED } from "@/lib/preferences";
import { usePreferenceBoolean } from "@/lib/use-preference";

interface User {
  name?: string | null;
  email: string;
  image?: string | null;
}

/**
 * App chrome: left sidebar + main content that reserves a gutter for the
 * pinned/collapsed state of the sidebar. When the sidebar is *unpinned*
 * and the user hovers it, it expands over the content (fixed position,
 * larger z-index); the gutter stays at the collapsed width so the page
 * doesn't shift under the user.
 *
 * Layout dimensions come from CSS vars (`--sidebar-gutter`,
 * `--sidebar-width`) that `PreferencesScript` pre-hydrates via
 * `html[data-sidebar-pinned]` — no first-paint flicker.
 */
export function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = usePreferenceBoolean(SIDEBAR_PINNED);

  return (
    <>
      <Sidebar
        user={user}
        pinned={pinned}
        onTogglePin={() => setPinned(!pinned)}
      />
      <div
        style={{ paddingLeft: "var(--sidebar-gutter)" }}
        className="min-h-screen transition-[padding-left] duration-150 ease-out"
      >
        {children}
      </div>
    </>
  );
}
