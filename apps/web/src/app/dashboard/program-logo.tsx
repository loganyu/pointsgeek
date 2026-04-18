"use client";

import { useState } from "react";

/**
 * Known issuers → bundled logo path + fallback branding.
 *
 * Drop SVG files in `apps/web/public/logos/issuers/` matching the `logoPath`
 * below — they'll render automatically. Until then, the component falls back
 * to a brand-colored circle with the issuer's initial (Monarch-style).
 */
const ISSUER_META: Record<
  string,
  { logoPath: string; bg: string; initial: string }
> = {
  amex: {
    logoPath: "/logos/issuers/amex.png",
    bg: "#006FCF", // official Amex blue
    initial: "A",
  },
  chase: {
    logoPath: "/logos/issuers/chase.png",
    bg: "#117ACA", // Chase blue
    initial: "C",
  },
  capital_one: {
    logoPath: "/logos/issuers/capital-one.png",
    bg: "#D03027", // Capital One red
    initial: "C",
  },
  delta: {
    logoPath: "/logos/issuers/delta.png",
    bg: "#E01933", // Delta red
    initial: "D",
  },
};

export function ProgramLogo({
  issuer,
  size = 32,
}: {
  issuer: string;
  size?: number;
}) {
  const meta = ISSUER_META[issuer];
  const [imgBroken, setImgBroken] = useState(false);

  // If we have a known issuer AND the image hasn't errored → render image
  if (meta && !imgBroken) {
    return (
      <div
        className="shrink-0 rounded-full overflow-hidden bg-white border border-border flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <img
          src={meta.logoPath}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-contain"
          onError={() => setImgBroken(true)}
        />
      </div>
    );
  }

  // Fallback: colored circle with an initial (known issuer = brand color,
  // unknown issuer = neutral gray)
  const bg = meta?.bg ?? "#a6a39f";
  const initial = meta?.initial ?? (issuer.charAt(0).toUpperCase() || "?");

  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        fontSize: size * 0.42,
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
