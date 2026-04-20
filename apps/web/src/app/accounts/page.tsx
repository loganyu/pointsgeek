import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "../app-shell";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

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
          <h1 className="text-2xl font-bold text-text-primary">Accounts</h1>
        </div>
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-secondary">
            Account-level management is coming soon. For now, every synced
            program and card shows up on the{" "}
            <a
              href="/dashboard"
              className="text-text-accent hover:text-text-accent-hover transition-colors"
            >
              Dashboard
            </a>
            .
          </p>
        </div>
      </main>
    </AppShell>
  );
}
