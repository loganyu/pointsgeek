/**
 * Client-side user preferences that persist across sessions and need to
 * be available before React hydrates (to avoid first-paint flicker).
 *
 * Each preference is mirrored as a `data-*` attribute on `<html>` by
 * a blocking script (`PreferencesScript`). CSS can key off those
 * attributes directly — no wait for hydration — and React state stays
 * in sync via `usePreferenceBoolean`.
 *
 * To add a new preference: define it here, handle it in CSS if needed,
 * and consume it from a component with `usePreferenceBoolean(PREF)`.
 * That's the whole pattern.
 */

export interface BooleanPreference {
  /** localStorage key. */
  storageKey: string;
  /** Matching `dataset.<key>` on <html>. camelCase → data-kebab-case. */
  datasetKey: string;
  defaultValue: boolean;
}

export const SIDEBAR_PINNED: BooleanPreference = {
  storageKey: "pg-sidebar-pinned",
  datasetKey: "sidebarPinned",
  defaultValue: true,
};

/** Enumerated so the PreferencesScript can pre-hydrate all of them. */
export const ALL_BOOLEAN_PREFERENCES: BooleanPreference[] = [SIDEBAR_PINNED];
