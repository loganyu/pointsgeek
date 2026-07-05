"use client";

import { useEffect, useState } from "react";

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
  aa: {
    logoPath: "/logos/brands/aa.png",
    bg: "#C8102E", // AA red
    initial: "A",
  },
  qatar: {
    logoPath: "/logos/brands/qatar.png",
    bg: "#5C0931", // Qatar Airways burgundy
    initial: "Q",
  },
  cathay: {
    logoPath: "/logos/brands/cathay.png",
    bg: "#006564", // Cathay Pacific brunswick green
    initial: "C",
  },
  marriott: {
    logoPath: "/logos/brands/marriott.png",
    bg: "#2F3337",
    initial: "M",
  },
  hyatt: {
    logoPath: "/logos/brands/hyatt.png",
    bg: "#0F4C81", // World of Hyatt blue
    initial: "H",
  },
  jetblue: {
    logoPath: "/logos/brands/jetblue.svg",
    bg: "#003876", // JetBlue navy
    initial: "J",
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
  united: {
    logoPath: "/logos/brands/united.png",
    bg: "#002244", // United navy
    initial: "U",
  },
  amazon: {
    logoPath: "/logos/brands/amazon.png",
    bg: "#FF9900", // Amazon orange
    initial: "A",
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
  // "loading" on the server / during preload → renders the letter. Only
  // flip to "ok" once a real Image() preload confirms the file exists
  // and decodes. This guarantees we NEVER commit a broken <img> to the
  // DOM — Next.js's 404 returns a 200-style HTML body that some browsers
  // don't raise `error` for, so onError/onLoad on the real element isn't
  // reliable enough on its own.
  const [status, setStatus] = useState<"loading" | "ok" | "broken">(
    meta ? "loading" : "broken"
  );

  useEffect(() => {
    if (!meta) {
      reportMissingLogo(slug, "no_meta");
      return;
    }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      if (probe.naturalWidth === 0 || probe.naturalHeight === 0) {
        setStatus("broken");
        reportMissingLogo(slug, "image_load_error");
      } else {
        setStatus("ok");
      }
    };
    probe.onerror = () => {
      if (cancelled) return;
      setStatus("broken");
      reportMissingLogo(slug, "image_load_error");
    };
    probe.src = meta.logoPath;
    return () => {
      cancelled = true;
    };
  }, [meta, slug]);

  if (status === "ok" && meta) {
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
        />
      </div>
    );
  }

  // Fallback (also used during the brief preload): just the first letter
  // on a brand-purple chip. Token flips between lavender (light) and
  // mid aubergine (dark) via `--brand-default-chip` in globals.css.
  const initial = (slug.charAt(0) || "?").toUpperCase();

  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        lineHeight: 1,
        backgroundColor: "var(--brand-default-chip)",
        color: "var(--brand-default-chip-fg)",
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

type MissingLogoReason = "no_meta" | "image_load_error";

/**
 * Fire-and-forget telemetry for a brand slug we couldn't resolve to a
 * logo. Deduped per slug per tab so we don't spam the endpoint if the
 * same slug appears on many rows.
 */
function reportMissingLogo(slug: string, reason: MissingLogoReason) {
  if (!slug) return;
  const key = `pg-missing-logo:${reason}:${slug}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Private mode / disabled storage — fall through and still report.
  }
  fetch("/api/telemetry/missing-asset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "brand-logo", slug, reason }),
    keepalive: true,
  }).catch(() => {
    // Best-effort: never let a telemetry failure bubble into the UI.
  });
}
