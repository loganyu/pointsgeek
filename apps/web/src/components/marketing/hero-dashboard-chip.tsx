import Image from "next/image";

/**
 * Stylized vignette of the real dashboard, used in the marketing hero.
 *
 * Intentionally NOT shared with the live `<ProgramsList>`: this chip
 * has fixed demo numbers, fixed grouping, no interactivity, and a
 * fake browser chrome top bar. Keeping it independent means tweaks to
 * the real dashboard can ship without an "oh no the marketing image
 * still says 1 card but the row now shows N cards" regression.
 *
 * Sized at a fixed 460px wide; the parent positions it inside the
 * rotated paper-card backdrop. Brand logos come from `/logos/brands/*`
 * — the same PNGs `<BrandLogo>` uses on the dashboard.
 */
const fmt = (n: number) => n.toLocaleString("en-US");

interface RowProps {
  logo: string;
  name: string;
  sub: string;
  balance: number;
  currency: string;
}

function Row({ logo, name, sub, balance, currency }: RowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-t border-border-light">
      <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
        <Image
          src={logo}
          alt=""
          width={22}
          height={22}
          className="w-[22px] h-[22px] object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary tracking-[-0.005em]">
          {name}
        </div>
        <div className="text-[11.5px] text-text-tertiary mt-px">{sub}</div>
      </div>
      <div className="text-right">
        <div className="text-[15px] font-semibold tabular-nums text-text-primary">
          {fmt(balance)}
        </div>
        <div className="text-[10.5px] text-text-tertiary tracking-wider uppercase mt-0.5">
          {currency}
        </div>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  label: string;
  total: number;
}

function SectionHeader({ label, total }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 bg-surface-hover border-t border-b border-border-light">
      <div className="text-[13px] font-semibold text-text-primary">{label}</div>
      <div className="text-[13px] font-semibold text-text-primary tabular-nums">
        {fmt(total)}
      </div>
    </div>
  );
}

export function HeroDashboardChip() {
  return (
    <div
      className="bg-surface border border-border rounded-2xl overflow-hidden"
      style={{
        // Fluid below its design width so the hero column can shrink on
        // phones; the parent wrapper caps it back at 460 on desktop.
        width: "100%",
        maxWidth: 460,
        // Layered shadow keeps the chip floating above the paper card
        // without going full SaaS-bro neon. Purple-tinted drop layer
        // matches the lavender backdrop, so it grounds rather than fights it.
        boxShadow:
          "0 1px 0 rgba(34,32,29,0.02), 0 24px 48px -24px rgba(74, 47, 133, 0.18), 0 8px 16px -8px rgba(34,32,29,0.06)",
      }}
    >
      {/* Browser chrome top bar */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border-light bg-surface-secondary">
        <span className="w-[9px] h-[9px] rounded-full bg-border" />
        <span className="w-[9px] h-[9px] rounded-full bg-border" />
        <span className="w-[9px] h-[9px] rounded-full bg-border" />
        <div
          className="flex-1 ml-2 h-[18px] rounded-md bg-white border border-border-light flex items-center px-2 text-[10.5px] text-text-tertiary"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          pointsgeek.app/dashboard
        </div>
      </div>

      {/* Grand total */}
      <div className="px-5 pt-5 pb-4">
        <div className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">
          Total across all programs
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <div className="text-[32px] font-bold tabular-nums text-text-primary tracking-tight leading-none">
            2,345,678
          </div>
          <div className="text-[13px] text-text-secondary">points &amp; miles</div>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[11.5px] text-text-tertiary">
          <span className="w-1.5 h-1.5 rounded-full bg-[#86c399]" />
          All synced · 2 minutes ago
        </div>
      </div>

      <SectionHeader label="Banks" total={1056001} />
      <Row
        logo="/logos/brands/amex.png"
        name="Membership Rewards"
        sub="Logan · 2 cards"
        balance={780441}
        currency="points"
      />
      <Row
        logo="/logos/brands/chase.png"
        name="Ultimate Rewards"
        sub="Logan · 1 card"
        balance={189360}
        currency="points"
      />
      <Row
        logo="/logos/brands/capitalone.png"
        name="Capital One Miles"
        sub="Logan"
        balance={87200}
        currency="miles"
      />

      <SectionHeader label="Airlines" total={147709} />
      <Row
        logo="/logos/brands/delta.png"
        name="Delta SkyMiles"
        sub="Loyalty #…2575"
        balance={147709}
        currency="miles"
      />

      <SectionHeader label="Hotels" total={646182} />
      <Row
        logo="/logos/brands/marriott.png"
        name="Marriott Bonvoy"
        sub="Loyalty #…6152"
        balance={646182}
        currency="points"
      />
    </div>
  );
}
