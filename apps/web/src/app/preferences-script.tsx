import { ALL_BOOLEAN_PREFERENCES } from "@/lib/preferences";

/**
 * Inline blocking-script source: mirrors persisted preferences from
 * localStorage onto `<html>` data attributes *before* React hydrates,
 * so CSS (see `globals.css`) can key layout vars off those attributes
 * and avoid a first-paint flicker.
 *
 * Exported as a string and rendered as an inline `<script>` in the
 * root layout's `<head>`. Why not `next/script` with
 * `beforeInteractive`? In Next 16 it still triggers React's
 * "scripts inside components are never executed" warning, which
 * cascades into hydration mismatches on the body tree. Putting the
 * `<script>` directly inside `<head>` sidesteps that: React doesn't
 * hydrate head children, so no warning and no cascade.
 *
 * Keep the generated JS tiny and defensive: it runs synchronously in
 * the document head, and a thrown exception would block rendering.
 */
export const PREFERENCES_SCRIPT_SRC: string = (() => {
  const body = ALL_BOOLEAN_PREFERENCES.map(
    (p) =>
      `v=localStorage.getItem(${JSON.stringify(p.storageKey)});` +
      `if(v!==null)d.dataset[${JSON.stringify(p.datasetKey)}]=v;`
  ).join("");
  return `(function(){try{var d=document.documentElement,v;${body}}catch(e){}})();`;
})();
