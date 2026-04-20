import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "../app-shell";

export default async function SettingsPage() {
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
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        </div>

        <h2 className="text-lg font-semibold text-text-primary mb-4">Account</h2>
        <section className="rounded-xl border border-border bg-surface p-6 mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {session.user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  aria-hidden="true"
                  className="w-10 h-10 rounded-full border border-border bg-surface-secondary"
                />
              )}
              <div className="min-w-0">
                <p className="font-medium text-text-primary truncate">
                  {session.user.name}
                </p>
                <p className="text-sm text-text-secondary truncate">
                  {session.user.email}
                </p>
              </div>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-text-accent hover:text-text-accent-hover transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </section>

        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Chrome Extension
        </h2>
        <section className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary">
            Install the Chrome extension and sign in with the same Google
            account to sync your balances automatically.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
