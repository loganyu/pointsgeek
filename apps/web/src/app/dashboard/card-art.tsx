"use client";

import { useState } from "react";
import { BRAND_META } from "./brand-logo";

/**
 * Rectangular card-art thumbnail used on card rows.
 *
 * Resolution priority:
 *   1. `imageSlug` → `/logos/cards/{slug}.png` — user-editable local override
 *   2. `imageUrl`  → scraped CDN URL (Amex aexp-static, Chase, Cap One)
 *   3. `/logos/cards/default-{issuer}.png` — bundled rectangular issuer logo
 *   4. Colored rectangle with the issuer's initial — absolute fallback
 *
 * If any earlier source fails to load (404, network error), we fall
 * through to the next. The component stays mounted and re-renders the
 * next source via the `srcIndex` state.
 */
export function CardArt({
  imageUrl,
  imageSlug,
  issuer,
  width = 40,
  height = 25,
}: {
  imageUrl?: string | null;
  imageSlug?: string | null;
  issuer: string;
  width?: number;
  height?: number;
}) {
  const sources: string[] = [];
  if (imageSlug) sources.push(`/logos/cards/${imageSlug}.png`);
  if (imageUrl) sources.push(imageUrl);
  if (issuer) sources.push(`/logos/cards/default-${issuer}.png`);

  const [srcIndex, setSrcIndex] = useState(0);
  const currentSrc: string | undefined = sources[srcIndex];

  if (currentSrc) {
    return (
      <div
        className="shrink-0 rounded-sm overflow-hidden bg-white border border-border"
        style={{ width, height }}
      >
        <img
          src={currentSrc}
          alt=""
          aria-hidden="true"
          className="w-full h-full"
          onError={() => {
            // Advance to the next source; once we're past the last one,
            // the `srcIndex >= sources.length` check below renders the
            // colored-rectangle fallback.
            setSrcIndex((i) => i + 1);
          }}
        />
      </div>
    );
  }

  // Absolute fallback — all image sources failed or none were provided.
  const meta = BRAND_META[issuer];
  const bg = meta?.bg ?? "#a6a39f";
  const initial = meta?.initial ?? (issuer.charAt(0).toUpperCase() || "?");

  return (
    <div
      className="shrink-0 rounded-md flex items-center justify-center font-semibold text-white"
      style={{
        width,
        height,
        backgroundColor: bg,
        fontSize: Math.round(height * 0.48),
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
