import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireCompletedProfile } from "@/lib/onboarding";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DEFAULT_TIMEZONE, ensureIncluded } from "@/lib/timezones";
import { AppShell } from "../app-shell";
import { ProfileForm } from "./profile-form";
import { CHROME_STORE_URL } from "@/lib/links";

const MAX_IMAGE_BYTES = 500 * 1024;

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?route=%2Fsettings");
  const userId = session.user.id!;
  await requireCompletedProfile(userId);

  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      birthday: users.birthday,
      timezone: users.timezone,
      profileImage: users.profileImage,
      oauthImage: users.image,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const savedTimezone = user?.timezone ?? DEFAULT_TIMEZONE;
  const timezoneOptions = ensureIncluded(savedTimezone);

  async function saveProfile(formData: FormData) {
    "use server";
    const firstName = (formData.get("firstName") as string | null)?.trim();
    const lastName =
      ((formData.get("lastName") as string | null)?.trim() ?? "") || null;
    const birthday =
      ((formData.get("birthday") as string | null)?.trim() ?? "") || null;
    const timezone =
      ((formData.get("timezone") as string | null)?.trim() ?? "") || null;
    const profileImageRaw = formData.get("profileImage") as string | null;

    if (!firstName) return;

    // Empty hidden field means "no change"; a data URL means the user
    // picked a new picture. Also bounce oversize payloads server-side
    // as a safety net — the client already enforces this.
    let profileImage: string | undefined;
    if (profileImageRaw && profileImageRaw.startsWith("data:image/")) {
      // ~2× because base64 encoding inflates by ~33%, plus headroom.
      if (profileImageRaw.length > MAX_IMAGE_BYTES * 2) return;
      profileImage = profileImageRaw;
    }

    await db
      .update(users)
      .set({
        firstName,
        lastName,
        birthday,
        timezone: timezone ?? DEFAULT_TIMEZONE,
        ...(profileImage !== undefined ? { profileImage } : {}),
      })
      .where(eq(users.id, userId));

    revalidatePath("/settings");
  }

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email!,
        image: session.user.image,
      }}
    >
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-text-primary mb-8">Settings</h1>

        {/* Profile — Monarch-style card */}
        <section className="rounded-xl border border-border bg-surface overflow-hidden mb-6">
          <ProfileForm
            action={saveProfile}
            defaults={{
              firstName: user?.firstName ?? "",
              lastName: user?.lastName ?? "",
              birthday: user?.birthday ?? "",
              timezone: savedTimezone,
              profileImage: user?.profileImage ?? null,
              oauthImage: user?.oauthImage ?? null,
            }}
            email={user?.email ?? session.user.email ?? ""}
            timezones={timezoneOptions}
          />
        </section>

        {/* Sign out */}
        <section className="rounded-xl border border-border bg-surface p-6 mb-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-secondary truncate">
              Signed in as {session.user.email}
            </p>
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

        {/* Chrome Extension */}
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Chrome Extension
        </h2>
        <section className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary">
            Install the Chrome extension and sign in with the same Google
            account to sync your balances automatically.
          </p>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 bg-white border border-border px-[18px] py-[11px] rounded-[10px] text-sm font-medium text-text-primary no-underline transition-colors hover:bg-surface-hover"
          >
            Install from Chrome Web Store
          </a>
        </section>
      </main>
    </AppShell>
  );
}
