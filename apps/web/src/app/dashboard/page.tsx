import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  balanceSnapshots,
  cards,
  pointsPrograms,
} from "@/lib/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import ProgramsList, { type ProgramData, type CardData } from "./programs-list";
import { ThemeToggle } from "./theme-toggle";

type ProgramCategory = "bank_rewards" | "airline" | "hotel";

const PROVIDERS: Array<{
  id: "amex_mr" | "chase_ur" | "capital_one" | "delta_skymiles";
  label: string;
  short: string;
  url: string;
  issuer: string;
  programName: string;
  programType: ProgramCategory;
}> = [
  {
    id: "amex_mr",
    label: "Amex Membership Rewards",
    short: "Amex MR",
    url: "https://www.americanexpress.com",
    issuer: "amex",
    programName: "Membership Rewards",
    programType: "bank_rewards",
  },
  {
    id: "chase_ur",
    label: "Chase Ultimate Rewards",
    short: "Chase UR",
    url: "https://ultimaterewardspoints.chase.com",
    issuer: "chase",
    programName: "Ultimate Rewards",
    programType: "bank_rewards",
  },
  {
    id: "capital_one",
    label: "Capital One Miles",
    short: "Capital One",
    url: "https://myaccounts.capitalone.com",
    issuer: "capital_one",
    programName: "Capital One Miles",
    programType: "bank_rewards",
  },
  {
    id: "delta_skymiles",
    label: "Delta SkyMiles",
    short: "Delta",
    url: "https://www.delta.com/myskymiles/overview",
    issuer: "delta",
    programName: "Delta SkyMiles",
    programType: "airline",
  },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const userId = session.user.id!;

  // Fetch all programs for user
  const userPrograms = await db
    .select()
    .from(pointsPrograms)
    .where(eq(pointsPrograms.userId, userId));

  // Fetch all cards for user
  const userCards = await db
    .select()
    .from(cards)
    .where(eq(cards.userId, userId));

  // Build program data for each provider
  const programs: ProgramData[] = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const program = userPrograms.find((p) => p.issuer === provider.issuer);
      const programName = program?.name ?? provider.programName;

      // Get latest total balance (cardId IS NULL)
      const totalRows = await db
        .select()
        .from(balanceSnapshots)
        .where(
          and(
            eq(balanceSnapshots.userId, userId),
            eq(balanceSnapshots.provider, provider.id),
            isNull(balanceSnapshots.cardId)
          )
        )
        .orderBy(desc(balanceSnapshots.scrapedAt))
        .limit(1);

      const latestTotal = totalRows[0] ?? null;

      // Get cards for this program
      const programCards = program
        ? userCards.filter((c) => c.programId === program.id)
        : [];

      // Get latest balance per card
      const cardData: CardData[] = await Promise.all(
        programCards.map(async (card) => {
          const balRows = await db
            .select()
            .from(balanceSnapshots)
            .where(
              and(
                eq(balanceSnapshots.userId, userId),
                eq(balanceSnapshots.cardId, card.id)
              )
            )
            .orderBy(desc(balanceSnapshots.scrapedAt))
            .limit(1);

          const latestBal = balRows[0] ?? null;

          return {
            id: card.id,
            cardName: card.cardName,
            lastFour: card.lastFour,
            balance: latestBal ? Number(latestBal.balance) : null,
            lastUpdated: latestBal
              ? latestBal.scrapedAt.toISOString()
              : null,
          };
        })
      );

      return {
        providerId: provider.id,
        label: provider.label,
        short: provider.short,
        url: provider.url,
        issuer: provider.issuer,
        programName,
        programType: provider.programType,
        totalBalance: latestTotal ? Number(latestTotal.balance) : null,
        lastUpdated: latestTotal
          ? latestTotal.scrapedAt.toISOString()
          : null,
        cards: cardData,
      };
    })
  );

  // Group programs by category
  const banks = programs.filter((p) => p.programType === "bank_rewards");
  const airlines = programs.filter((p) => p.programType === "airline");
  const hotels = programs.filter((p) => p.programType === "hotel");

  return (
    <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Points Geek
        </h1>
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
