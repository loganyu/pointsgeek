/**
 * PointsGeek wordmark + bag-tag icon lockup.
 *
 * Design-system rules (locked in by the design chat):
 *   - "PointsGeek" is one word, `whitespace-nowrap` so it never breaks.
 *   - "Geek" renders in the brand accent (`text-text-accent` → aubergine).
 *   - The bag-tag icon sits to the left on a lavender tile; both the icon
 *     and the word move together.
 */
export function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const iconPx = size === "sm" ? 28 : 32;
  const textClass =
    size === "sm" ? "text-lg font-semibold" : "text-2xl font-bold";

  return (
    <div className="flex items-center gap-2.5 select-none">
      <img
        src="/brand/icon.svg"
        alt=""
        aria-hidden="true"
        width={iconPx}
        height={iconPx}
        className="shrink-0 rounded-md"
      />
      <span className={`${textClass} whitespace-nowrap text-text-primary`}>
        Points<span className="text-text-accent">Geek</span>
      </span>
    </div>
  );
}
