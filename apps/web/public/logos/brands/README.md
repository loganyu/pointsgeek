# Brand logos

One logo per brand — covers both **card issuers** (amex, chase, capitalone…)
and **loyalty programs** (delta, marriott, hyatt…). A single
`/logos/brands/{slug}.png` namespace because most issuers are also loyalty
programs (Amex MR, Chase UR) so there's no reason to split them.

Drop PNGs here matching the slug used in `BRAND_META` in
`apps/web/src/app/dashboard/brand-logo.tsx` and the program brand slug in
`packages/shared/src/programs.ts`. Until a file exists, the UI falls back
to a brand-colored circle with the brand's first initial (Monarch-style).

## Expected filenames

- `amex.png` — Amex cards + Membership Rewards
- `chase.png` — Chase cards + Ultimate Rewards
- `capitalone.png` — Capital One cards + Miles
- `delta.png` — Delta SkyMiles
- `marriott.png` — Marriott Bonvoy
- `bilt.png`, `citi.png` — issuer-only today, may become programs later

(SVG also works — just update the `logoPath` extension in
`apps/web/src/app/dashboard/brand-logo.tsx`.)

## Guidelines

- **Format**: PNG or SVG. PNG is easier to source. For PNG, use at least
  128×128 — higher is better for retina displays. For SVG, any size works
  since it's vector.
- **Viewbox / aspect**: square, centered. The rendered logo sits inside a
  36px circle on program rows and a 24px circle on card rows, so square
  marks read best.
- **Background**: transparent. The component wraps the image in a white
  circular background.
- **Color**: use the official brand color; avoid monochrome variants unless
  the logomark is unambiguous in a single color (Amex blue box, Chase
  octagon, etc.).

## Sourcing

- Wikipedia → each brand's page usually has an official SVG under "Logo".
  Right-click → "Save image as...".
- Official press kits: most issuers publish brand assets. Search
  "<brand> brand guidelines" or "<brand> press kit".
- Do NOT use logos scraped from issuer dashboards — those are often
  rasterized and inconsistently sized.

## Adding a new brand

When you add a new issuer or program (e.g. Hyatt, United):

1. Add the slug to `BRAND_META` in
   `apps/web/src/app/dashboard/brand-logo.tsx` with a color and initial.
2. For loyalty programs, also add the program to `PROGRAM_CATALOG` in
   `packages/shared/src/programs.ts` using the same brandSlug.
3. Drop the PNG/SVG here with the same slug as the filename.
