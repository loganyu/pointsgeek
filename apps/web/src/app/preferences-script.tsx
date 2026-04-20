import { ALL_BOOLEAN_PREFERENCES } from "@/lib/preferences";

/**
 * Blocking inline script that mirrors persisted preferences from
 * localStorage onto `<html>` data attributes *before* React hydrates.
 *
 * CSS (see `globals.css`) keys layout vars off those attributes, so the
 * first paint already reflects the user's saved state — no flicker from
 * an SSR default being overwritten in `useEffect`.
 *
 * Keep the generated JS tiny and defensive: it runs synchronously in the
 * document head, and a thrown exception would block rendering.
 */
export function PreferencesScript() {
  const body = ALL_BOOLEAN_PREFERENCES.map(
    (p) =>
      `v=localStorage.getItem(${JSON.stringify(p.storageKey)});` +
      `if(v!==null)d.dataset[${JSON.stringify(p.datasetKey)}]=v;`
  ).join("");
  const src = `(function(){try{var d=document.documentElement,v;${body}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: src }} />;
}
