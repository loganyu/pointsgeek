# Issuer logos

Drop SVGs in this directory matching the filenames below — they'll render
automatically in the dashboard. Until a file exists, the UI falls back to a
brand-colored circle with the issuer's first initial (see
`apps/web/src/app/dashboard/program-logo.tsx`).

## Expected filenames

- `amex.png`
- `chase.png`
- `capital-one.png`
- `delta.png`

(If you prefer SVG, it's also fine — just update the `logoPath` extension in
`apps/web/src/app/dashboard/program-logo.tsx` to match. At 32–36px render
size, PNG and SVG look identical.)

## Guidelines

- **Format**: PNG or SVG. PNG is easier to source. For PNG, use at least 128×128 — higher is better for
  retina displays. For SVG, any size works since it's vector.
- **Viewbox / aspect**: square, centered. The rendered logo sits inside a
  36px circle on program rows and a 24px circle on card rows, so square
  marks read best.
- **Background**: transparent. The component wraps the image in a white
  circular background.
- **Color**: use the official brand color; avoid monochrome variants unless
  the logomark is unambiguous in a single color (Amex blue box, Chase
  octagon, etc.).

## Sourcing

- Wikipedia → each issuer's page usually has an official SVG under "Logo".
  Right-click → "Save image as...".
- Official press kits: most issuers publish brand assets. Search
  "<issuer> brand guidelines" or "<issuer> press kit".
- Do NOT use logos scraped from issuer dashboards — those are often
  rasterized and inconsistently sized.

## Adding a new issuer

When you add a new provider (e.g. Marriott, United):

1. Add the `issuer` slug to `ISSUER_META` in
   `apps/web/src/app/dashboard/program-logo.tsx` with a brand color and
   initial.
2. Drop the SVG here with the same slug as the filename.
