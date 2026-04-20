"use client";

import { useCallback, useEffect, useState } from "react";
import type { BooleanPreference } from "./preferences";

/**
 * React state bound to a persisted boolean preference.
 *
 * The initial render returns `pref.defaultValue` on both server and
 * client — this keeps hydration free of mismatches. After mount we read
 * the `<html>` dataset attribute that `PreferencesScript` populated and
 * `setState` to the real value. Visual layout doesn't flicker because
 * CSS already picked up the data attribute pre-hydration; only the
 * component tree's own render catches up.
 *
 * The setter writes to both `localStorage` (durable) and the dataset
 * attribute (so CSS keyed off it stays in sync).
 */
export function usePreferenceBoolean(
  pref: BooleanPreference
): readonly [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(pref.defaultValue);

  useEffect(() => {
    const raw = document.documentElement.dataset[pref.datasetKey];
    if (raw === undefined) return;
    setValue(raw !== "false");
  }, [pref.datasetKey]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      const str = String(next);
      try {
        window.localStorage.setItem(pref.storageKey, str);
      } catch {
        // storage disabled — dataset update still drives CSS for this session
      }
      document.documentElement.dataset[pref.datasetKey] = str;
    },
    [pref]
  );

  return [value, set] as const;
}
