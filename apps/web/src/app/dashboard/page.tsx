import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { balanceSnapshots } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const balances = await db
    .select()
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, session.user.id!))
    .orderBy(desc(balanceSnapshots.scrapedAt))
    .limit(5);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <a href="/settings" className="text-sm text-blue-600 hover:underline">
          Settings
        </a>
      </div>

      {balances.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No balances synced yet</p>
          <p className="text-sm">
            Install the Chrome extension and visit americanexpress.com to sync
            your balance.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-6">
            <p className="text-sm text-gray-500 mb-1">
              Amex Membership Rewards
            </p>
            <p className="text-4xl font-bold">
              {Number(balances[0].balance).toLocaleString()}
              <span className="text-base font-normal text-gray-400 ml-2">
                pts
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Last synced{" "}
              {balances[0].scrapedAt.toLocaleString()}
            </p>
          </div>

          <h2 className="text-sm font-medium text-gray-500 mt-6">
            Recent snapshots
          </h2>
          <div className="divide-y border rounded-lg">
            {balances.map((b) => (
              <div key={b.id} className="flex justify-between px-4 py-3 text-sm">
                <span>{Number(b.balance).toLocaleString()} pts</span>
                <span className="text-gray-400">
                  {b.scrapedAt.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
