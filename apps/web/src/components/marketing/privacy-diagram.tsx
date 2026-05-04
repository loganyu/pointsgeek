/**
 * "Your device" diagram for the Privacy section.
 *
 * Rendered as a single inline SVG so the dashed-line geometry, hatched
 * fill pattern, and accent-coloured marker arrow stay in lockstep —
 * splitting any of these out into separate elements would invite a
 * pixel-misalignment regression. The fill colors all reference
 * design-token hex values directly because SVG attributes don't
 * inherit CSS variables.
 *
 * Sized via viewBox so the diagram scales to whatever box the parent
 * gives it. Default render is 380×380; the privacy card uses 380px
 * height with a 1fr column.
 */

interface PrivacyDiagramProps {
  /** Accent color for the highlighted boxes + arrow. Hex preferred (SVG attrs). */
  accent?: string;
}

export function PrivacyDiagram({ accent = "#4a2f85" }: PrivacyDiagramProps) {
  return (
    <svg
      viewBox="0 0 400 380"
      className="w-full h-full"
      aria-hidden="true"
      role="img"
    >
      <defs>
        <pattern
          id="pg-privacy-diag"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke={accent}
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        </pattern>
        <marker
          id="pg-privacy-arr"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
        </marker>
      </defs>

      {/* Browser frame */}
      <rect
        x="40"
        y="40"
        width="320"
        height="300"
        rx="14"
        fill="#fff"
        stroke="#e3ded3"
        strokeWidth="1"
      />
      <rect x="40" y="40" width="320" height="32" rx="14" fill="#efece6" />
      <rect x="40" y="58" width="320" height="14" fill="#efece6" />
      <circle cx="56" cy="56" r="3.5" fill="#e3ded3" />
      <circle cx="68" cy="56" r="3.5" fill="#e3ded3" />
      <circle cx="80" cy="56" r="3.5" fill="#e3ded3" />

      {/* "Your device" hatched zone */}
      <rect
        x="56"
        y="88"
        width="288"
        height="236"
        rx="8"
        fill="url(#pg-privacy-diag)"
        stroke={accent}
        strokeOpacity="0.25"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x="72"
        y="106"
        fill={accent}
        opacity="0.7"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Your device
      </text>

      {/* Bank session box */}
      <rect
        x="76"
        y="124"
        width="120"
        height="48"
        rx="6"
        fill="#fff"
        stroke="#e3ded3"
      />
      <text
        x="86"
        y="144"
        fill="#22201d"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        amex.com
      </text>
      <text
        x="86"
        y="160"
        fill="#a6a39f"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
      >
        session · cookie
      </text>

      {/* extension.read() box */}
      <rect
        x="216"
        y="124"
        width="112"
        height="48"
        rx="6"
        fill={accent}
        fillOpacity="0.08"
        stroke={accent}
        strokeOpacity="0.5"
      />
      <text
        x="226"
        y="144"
        fill={accent}
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        extension.read()
      </text>
      <text
        x="226"
        y="160"
        fill={accent}
        opacity="0.7"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
      >
        &quot;780,441 pts&quot;
      </text>

      {/* Arrow from session → read */}
      <path
        d="M 196 148 L 216 148"
        stroke={accent}
        strokeWidth="1.5"
        markerEnd="url(#pg-privacy-arr)"
      />

      {/* Vertical drop line into payload */}
      <line
        x1="272"
        y1="172"
        x2="272"
        y2="248"
        stroke={accent}
        strokeOpacity="0.35"
        strokeDasharray="3 3"
      />

      {/* Payload box */}
      <rect
        x="218"
        y="248"
        width="108"
        height="36"
        rx="6"
        fill="#fff"
        stroke="#e3ded3"
      />
      <text
        x="272"
        y="263"
        textAnchor="middle"
        fill="#a6a39f"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
      >
        {"{ balance: 780441 }"}
      </text>
      <text
        x="272"
        y="276"
        textAnchor="middle"
        fill={accent}
        style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}
      >
        ↓ to your dashboard
      </text>

      {/* Closing italic caption */}
      <text
        x="200"
        y="312"
        textAnchor="middle"
        fill="#a6a39f"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 11,
          fontStyle: "italic",
        }}
      >
        No password. No session token. No PII.
      </text>
    </svg>
  );
}
