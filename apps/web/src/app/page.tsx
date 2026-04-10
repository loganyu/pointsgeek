import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      <main className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Point Portfolio</h1>
        <p className="text-lg text-gray-500 max-w-md">
          Track your credit card points and miles across all your accounts.
        </p>
        <a
          href="/api/auth/signin"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Sign In
        </a>
      </main>
    </div>
  );
}
