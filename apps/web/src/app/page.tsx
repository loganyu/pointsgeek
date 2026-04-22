import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Root route has no UI of its own — the marketing/landing page lives
 * on a separate site (Squarespace etc.) so the web app can stay
 * focused. Authed visitors go to the dashboard; everyone else lands
 * on the login page.
 */
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
