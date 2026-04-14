import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { balanceSnapshots } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const PROVIDERS = [
  { id: "amex_mr" as const, label: "Amex Membership Rewards", short: "Amex", url: "https://www.americanexpress.com" },
  { id: "chase_ur" as const, label: "Chase Ultimate Rewards", short: "Chase", url: "https://ultimaterewardspoints.chase.com" },
  { id: "capital_one" as const, label: "Capital One Miles", short: "Cap One", url: "https://myaccounts.capitalone.com" },
];

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  // Get latest balance per provider
  const latestPerProvider = await Promise.all(
    PROVIDERS.map(async (p) => {
      const rows = await db
        .select()
        .from(balanceSnapshots)
        .where(
          and(
            eq(balanceSnapshots.userId, session.user.id!),
            eq(balanceSnapshots.provider, p.id)
          )
        )
        .orderBy(desc(balanceSnapshots.scrapedAt))
        .limit(1);
      return { ...p, latest: rows[0] ?? null };
    })
  );

  // Get recent snapshots across all providers
  const recentSnapshots = await db
    .select()
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, session.user.id!))
    .orderBy(desc(balanceSnapshots.scrapedAt))
    .limit(10);

  const hasAnyData = latestPerProvider.some((p) => p.latest);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <a href="/settings" className="text-sm text-blue-600 hover:underline">
          Settings
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {latestPerProvider.map(({ id, label, url, latest }) => (
          <div key={id} className="bg-white rounded-xl border p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm text-gray-500">{label}</p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline whitespace-nowrap"
              >
                {latest ? "Refresh" : "Sync"}
              </a>
            </div>
            {latest ? (
              <>
                <p className="text-3xl font-bold">
                  {Number(latest.balance).toLocaleString()}
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    pts
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {timeAgo(latest.scrapedAt)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">
                No data yet — visit the site to sync
              </p>
            )}
          </div>
        ))}
      </div>

      {hasAnyData && (
        <>
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            Recent snapshots
          </h2>
          <div className="divide-y border rounded-lg">
            {recentSnapshots.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    {PROVIDERS.find((p) => p.id === b.provider)?.short ?? b.provider}
                  </span>
                  <span>{Number(b.balance).toLocaleString()} pts</span>
                </div>
                <span className="text-gray-400">
                  {timeAgo(b.scrapedAt)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
