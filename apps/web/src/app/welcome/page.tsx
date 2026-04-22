import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/timezones";
import { WelcomeForm } from "./welcome-form";

export const metadata = {
  title: "Welcome — PointsGeek",
};

/**
 * Onboarding landing page — shown once, immediately after sign-up.
 * Captures first + last name, birthday (optional), and timezone
 * (auto-detected, editable). Bounced to the dashboard once
 * `firstName` is set so this never re-shows.
 */
export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id!;
  const [user] = await db
    .select({
      firstName: users.firstName,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.firstName) redirect("/dashboard");

  // Pre-fill from NextAuth's `name` (OAuth display name) by splitting
  // on the first space. User can edit before submitting.
  const prefill = splitName(user?.name);

  async function saveProfile(formData: FormData) {
    "use server";
    const firstName = (formData.get("firstName") as string | null)?.trim();
    const lastName =
      ((formData.get("lastName") as string | null)?.trim() ?? "") || null;
    const birthday =
      ((formData.get("birthday") as string | null)?.trim() ?? "") || null;
    const timezoneRaw =
      ((formData.get("timezone") as string | null)?.trim() ?? "") || null;

    if (!firstName) return;

    // Only accept timezones in our curated set; anything else falls
    // back to the default so bad form data can't poison the column.
    const timezone =
      timezoneRaw &&
      TIMEZONES.includes(timezoneRaw as (typeof TIMEZONES)[number])
        ? timezoneRaw
        : DEFAULT_TIMEZONE;

    await db
      .update(users)
      .set({
        firstName,
        lastName,
        birthday,
        timezone,
      })
      .where(eq(users.id, userId));

    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon.svg"
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            className="rounded-lg"
          />
        </div>
        <h1 className="text-2xl font-bold text-text-primary text-center mb-2">
          Tell us about yourself
        </h1>
        <p className="text-sm text-text-secondary text-center mb-6">
          A couple of quick details so we can tailor your dashboard.
        </p>
        <WelcomeForm
          action={saveProfile}
          defaults={{
            firstName: prefill.first,
            lastName: prefill.last,
          }}
          timezones={TIMEZONES}
          defaultTimezone={DEFAULT_TIMEZONE}
        />
      </div>
    </main>
  );
}

function splitName(name: string | null | undefined): {
  first: string;
  last: string;
} {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
