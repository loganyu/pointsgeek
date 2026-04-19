# Card art

Per-card image thumbnails, keyed by `cards.image_slug`.

File naming: `/logos/cards/{image-slug}.png` — lowercase-with-dashes, e.g.
`amex-platinum.png`, `amex-gold-rosegold.png`, `chase-sapphire-reserve.png`.

Until a slug is set on a card row (either via scraper or user-edited in
settings), the card row renders with no per-card art (just the bank's
brand logo). Dropping files here without setting `image_slug` on a card
won't do anything — both sides need to match.

## Guidelines

- **Format**: PNG with transparent background, rectangular (5:3 aspect or
  similar card proportions). 256×160 minimum.
- **Design variants** (e.g. the gold-vs-rose-gold Amex Gold Card): use
  distinct slugs like `amex-gold` and `amex-gold-rosegold`. Scrapers
  generally can't tell these apart from the DOM — users override in
  settings.
