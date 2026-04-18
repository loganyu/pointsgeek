import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      <main className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Points Geek</h1>
        <p className="text-lg text-text-secondary max-w-md">
          Track your credit card points and miles across all your accounts.
        </p>
        <a
          href="/api/auth/signin"
          className="inline-block bg-text-accent text-white px-6 py-3 rounded-lg hover:bg-text-accent-hover transition-colors"
        >
          Sign In
        </a>
      </main>
    </div>
  );
}
