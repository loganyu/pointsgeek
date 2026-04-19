import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  balanceSnapshots,
  cards,
  pointsPrograms,
} from "@/lib/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import {
  PROGRAM_CATALOG,
  type ProgramKey,
  type BalanceType,
  type ProgramType,
} from "@points-geek/shared";
import ProgramsList, {
  type ProgramRowData,
  type CardRowData,
} from "./programs-list";
import { ThemeToggle } from "./theme-toggle";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const userId = session.user.id!;

  // Fetch every loyalty-program instance + card for this user.
  const [userPrograms, userCards] = await Promise.all([
    db
      .select()
      .from(pointsPrograms)
      .where(eq(pointsPrograms.userId, userId)),
    db.select().from(cards).where(eq(cards.userId, userId)),
  ]);

  // Build one ProgramRowData per points_programs row. A user with two Amex
  // logins will therefore get two `amex_mr` rows — the `externalAccountId`
  // keeps them apart and the owner chip disambiguates them visually.
  const rows: (ProgramRowData | null)[] = await Promise.all(
    userPrograms.map(async (p) => {
      const meta = PROGRAM_CATALOG[p.programKey as ProgramKey];
      if (!meta) return null; // schema allows any string; skip unknown keys

      // Program total + YTD: the most recent pooled snapshot of each kind.
      // YTD is shown as a sub-figure next to the main balance when it's
      // the only datum we have (e.g., Marriott from Amex overview) or
      // alongside it (once we add direct marriott.com scraping).
      const [totalRows, ytdRows] = await Promise.all([
        db
          .select()
          .from(balanceSnapshots)
          .where(
            and(
              eq(balanceSnapshots.userId, userId),
              eq(balanceSnapshots.programId, p.id),
              isNull(balanceSnapshots.cardId),
              eq(balanceSnapshots.balanceType, "total")
            )
          )
          .orderBy(desc(balanceSnapshots.scrapedAt))
          .limit(1),
        db
          .select()
          .from(balanceSnapshots)
          .where(
            and(
              eq(balanceSnapshots.userId, userId),
              eq(balanceSnapshots.programId, p.id),
              isNull(balanceSnapshots.cardId),
              eq(balanceSnapshots.balanceType, "ytd_earned_on_card")
            )
          )
          .orderBy(desc(balanceSnapshots.scrapedAt))
          .limit(1),
      ]);

      const latestTotal = totalRows[0] ?? null;
      const latestYtd = ytdRows[0] ?? null;

      // Cards attached to this program instance.
      const programCards = userCards.filter((c) => c.programId === p.id);
      const cardData: CardRowData[] = await Promise.all(
        programCards.map(async (c) => {
          const balRows = await db
            .select()
            .from(balanceSnapshots)
            .where(
              and(
                eq(balanceSnapshots.userId, userId),
                eq(balanceSnapshots.cardId, c.id)
              )
            )
            .orderBy(desc(balanceSnapshots.scrapedAt))
            .limit(1);
          const latest = balRows[0] ?? null;
          return {
            id: c.id,
            cardName: c.cardName,
            lastFour: c.lastFour,
            issuer: c.issuer,
            imageSlug: c.imageSlug,
            balance: latest ? Number(latest.balance) : null,
            balanceType: (latest?.balanceType as BalanceType | undefined) ?? null,
            lastUpdated: latest?.scrapedAt.toISOString() ?? null,
          };
        })
      );

      return {
        programRowId: p.id, // db id; used only for react key
        programKey: p.programKey as ProgramKey,
        programType: p.programType as ProgramType,
        displayName: meta.displayName,
        brandSlug: meta.brandSlug,
        currency: meta.currency,
        ownerLabel: p.ownerLabel,
        externalAccountId: p.externalAccountId,
        syncUrl: meta.primarySyncUrl,
        totalBalance: latestTotal ? Number(latestTotal.balance) : null,
        lastUpdated: latestTotal?.scrapedAt.toISOString() ?? null,
        ytdBalance: latestYtd ? Number(latestYtd.balance) : null,
        ytdLastUpdated: latestYtd?.scrapedAt.toISOString() ?? null,
        cards: cardData,
      } as ProgramRowData;
    })
  );

  const validRows = rows.filter((r): r is ProgramRowData => r !== null);

  // Sort so a user's own accounts cluster, then programs alphabetize.
  validRows.sort((a, b) => {
    const o = (a.ownerLabel ?? "").localeCompare(b.ownerLabel ?? "");
    if (o !== 0) return o;
    return a.displayName.localeCompare(b.displayName);
  });

  const banks = validRows.filter((r) => r.programType === "bank_rewards");
  const airlines = validRows.filter((r) => r.programType === "airline");
  const hotels = validRows.filter((r) => r.programType === "hotel");

  return (
    <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Points Geek</h1>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="/settings"
            className="text-sm text-text-accent hover:text-text-accent-hover transition-colors"
          >
            Settings
          </a>
        </div>
      </div>

      <ProgramsList banks={banks} airlines={airlines} hotels={hotels} />
    </main>
  );
}
