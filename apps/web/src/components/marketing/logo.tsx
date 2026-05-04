/**
 * PointsGeek brand mark + lockup.
 *
 * The brand has two approved marks:
 *   - "stamp"   — the primary passport-stamp ring with a serif PG monogram.
 *                 Use everywhere the old notepad icon used to appear.
 *   - "compass" — the alternate 4-point compass star inside a soft chip.
 *                 Use only where a square shape reads better than the
 *                 stamp's circle (favicons-on-dark, square avatars).
 *
 * Both pair with the sans wordmark "Points{Geek}" via `<LogoLockup>`.
 *
 * The PG monogram inside the stamp is rendered as <text> in
 * `--font-serif`. That works in-app because Source Serif 4 is loaded
 * by the root layout. If we ever ship the SVG to a context where the
 * font isn't loaded (raw SVG download, OG image render), swap in the
 * static SVG at `/public/brand/logo-stamp.svg` which keeps the same
 * `<text>` but with a richer fallback chain.
 */

type Accent = string;

export interface LogoStampMarkProps {
  size?: number;
  accent?: Accent;
}

export function LogoStampMark({
  size = 48,
  accent = "var(--purple-deep)",
}: LogoStampMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <circle
        cx="24"
        cy="24"
        r="22.5"
        stroke={accent}
        strokeWidth="1.25"
      />
      <circle
        cx="24"
        cy="24"
        r="19.5"
        stroke={accent}
        strokeWidth="0.75"
        strokeDasharray="1.5 2"
      />
      <text
        x="24"
        y="32"
        textAnchor="middle"
        fill={accent}
        style={{
          font: '700 20px var(--font-serif)',
          letterSpacing: "-0.02em",
        }}
      >
        PG
      </text>
      <g fill={accent}>
        <circle cx="24" cy="3.5" r="1" />
        <circle cx="24" cy="44.5" r="1" />
        <circle cx="3.5" cy="24" r="1" />
        <circle cx="44.5" cy="24" r="1" />
      </g>
    </svg>
  );
}

export interface LogoCompassMarkProps {
  size?: number;
  accent?: Accent;
}

export function LogoCompassMark({
  size = 48,
  accent = "var(--purple-deep)",
}: LogoCompassMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <rect
        x="0.5"
        y="0.5"
        width="47"
        height="47"
        rx="11"
        fill="#ffffff"
        stroke={accent}
        strokeWidth="1"
      />
      <g transform="translate(24 24)">
        <path d="M 0 -16 L 3 0 L 0 16 L -3 0 Z" fill={accent} />
        <path
          d="M -16 0 L 0 -3 L 16 0 L 0 3 Z"
          fill={accent}
          opacity="0.55"
        />
        <path
          d="M -9 -9 L 0 -1.5 L 9 -9 L 1.5 0 L 9 9 L 0 1.5 L -9 9 L -1.5 0 Z"
          fill={accent}
          opacity="0.25"
        />
        <circle
          cx="0"
          cy="0"
          r="2"
          fill="#ffffff"
          stroke={accent}
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
}

export type LogoKind = "stamp" | "compass";

export interface LogoLockupProps {
  /** Which mark to use. Default "stamp" — the brand's primary mark. */
  kind?: LogoKind;
  /** Mark size in px (1:1 height). Wordmark always sits at 18px next to it. */
  size?: number;
  /** Optional override for the accent color (defaults to var(--purple-deep)). */
  accent?: Accent;
  /** Hide the wordmark and render just the mark — used in tight chrome (extension popup, OG image). */
  showWordmark?: boolean;
}

/**
 * Mark + sans wordmark, side by side. Renders as `inline-flex` so the
 * caller can drop it into a Link and not worry about layout side
 * effects. Wordmark inherits color from `var(--text-primary)` so the
 * lockup themes correctly in dark mode without prop changes.
 */
export function LogoLockup({
  kind = "stamp",
  size = 32,
  accent = "var(--purple-deep)",
  showWordmark = true,
}: LogoLockupProps) {
  const Mark = kind === "compass" ? LogoCompassMark : LogoStampMark;
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <Mark size={size} accent={accent} />
      {showWordmark && (
        <span
          className="font-semibold whitespace-nowrap"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.018em",
            color: "var(--text-primary)",
          }}
        >
          Points
          <span style={{ color: accent }}>Geek</span>
        </span>
      )}
    </span>
  );
}
