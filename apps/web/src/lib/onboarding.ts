import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Gates a logged-in page behind the onboarding flow. Users who haven't
 * filled out the welcome form (`firstName` is still null) get sent to
 * `/welcome`. Called at the top of each authenticated page that sits
 * behind `AppShell`; the welcome page itself obviously must NOT call
 * this, or it would redirect-loop into itself.
 */
export async function requireCompletedProfile(userId: string): Promise<void> {
  const [row] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.firstName) {
    redirect("/welcome");
  }
}
