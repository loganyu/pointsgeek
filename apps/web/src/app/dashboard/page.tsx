import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireCompletedProfile } from "@/lib/onboarding";
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
import { AddProgramButton } from "./add-program-button";
import { AppShell } from "../app-shell";

export default async function DashboardPage() {
  const session = await auth();
  // Preserve the intended destination (Monarch-style `?route=...`) so
  // the user lands back on /dashboard the moment they finish signing in.
  if (!session?.user) redirect("/login?route=%2Fdashboard");

  const userId = session.user.id!;
  await requireCompletedProfile(userId);

  // Fetch every loyalty-program instance + card for this user.
  const [userPrograms, userCards] = await Promise.all([
    db
      .select()
      .from(pointsPrograms)
      .where(eq(pointsPrograms.userId, userId)),
    db.select().from(cards).where(eq(cards.userId, userId)),
  ]);

  // Build one ProgramRowData per points_programs row. Multiple rows can
  // share a provider/program when the scraper can distinguish separate
  // external accounts.
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
            imageUrl: c.imageUrl,
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
        expirationDate: p.expirationDate,
        syncUrl: meta.primarySyncUrl,
        totalBalance: latestTotal ? Number(latestTotal.balance) : null,
        lastUpdated: latestTotal?.scrapedAt.toISOString() ?? null,
        ytdBalance: latestYtd ? Number(latestYtd.balance) : null,
        ytdLastUpdated: latestYtd?.scrapedAt.toISOString() ?? null,
        lastSyncStatus: p.lastSyncStatus ?? null,
        lastSyncError: p.lastSyncError ?? null,
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
  const rewards = validRows.filter((r) => r.programType === "reward_program");
  const airlines = validRows.filter((r) => r.programType === "airline");
  const hotels = validRows.filter((r) => r.programType === "hotel");

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email!,
        image: session.user.image,
      }}
    >
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <AddProgramButton />
        </div>

        <ProgramsList
          banks={banks}
          rewards={rewards}
          airlines={airlines}
          hotels={hotels}
        />
      </main>
    </AppShell>
  );
}
