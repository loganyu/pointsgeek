"use client";

import { useState } from "react";

/**
 * Known brand slugs → bundled logo path + fallback branding.
 *
 * Used for both card issuers (amex, chase, capitalone) and loyalty program
 * brands (delta, marriott, hyatt). One namespace — add new entries here
 * and drop a matching PNG in `apps/web/public/logos/brands/`.
 */
export const BRAND_META: Record<
  string,
  { logoPath: string; bg: string; initial: string }
> = {
  amex: {
    logoPath: "/logos/brands/amex.png",
    bg: "#006FCF",
    initial: "A",
  },
  chase: {
    logoPath: "/logos/brands/chase.png",
    bg: "#117ACA",
    initial: "C",
  },
  capitalone: {
    logoPath: "/logos/brands/capitalone.png",
    bg: "#D03027",
    initial: "C",
  },
  delta: {
    logoPath: "/logos/brands/delta.png",
    bg: "#E01933",
    initial: "D",
  },
  marriott: {
    logoPath: "/logos/brands/marriott.png",
    bg: "#2F3337",
    initial: "M",
  },
  bilt: {
    logoPath: "/logos/brands/bilt.png",
    bg: "#0A0A0A",
    initial: "B",
  },
  citi: {
    logoPath: "/logos/brands/citi.png",
    bg: "#003B70",
    initial: "C",
  },
};

export function BrandLogo({
  slug,
  size = 32,
}: {
  slug: string;
  size?: number;
}) {
  const meta = BRAND_META[slug];
  const [imgBroken, setImgBroken] = useState(false);

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

  const bg = meta?.bg ?? "#a6a39f";
  const initial = meta?.initial ?? (slug.charAt(0).toUpperCase() || "?");

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
