import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  return (
    <main className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
          Dashboard
        </a>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <div className="border rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <p className="font-medium">{session.user.name}</p>
              <p className="text-sm text-gray-500">{session.user.email}</p>
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
              className="text-sm text-red-600 hover:underline"
            >
              Sign Out
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Chrome Extension</h2>
        <p className="text-sm text-gray-500">
          Install the Chrome extension and sign in with the same Google account
          to sync your balances automatically.
        </p>
      </section>
    </main>
  );
}
