import { auth } from "@/lib/auth";
import { CHROME_STORE_URL } from "@/lib/links";
import { requireCompletedProfile } from "@/lib/onboarding";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AppShell } from "../app-shell";

export default async function ExtensionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?route=%2Fextension");
  await requireCompletedProfile(session.user.id!);

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email!,
        image: session.user.image,
      }}
    >
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Extension</h1>
        </div>

        <section className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-center">
          <div className="max-w-xl">
            <h2 className="text-[34px] leading-[1.08] font-bold text-text-primary sm:text-[42px]">
              Sync points and miles from the sites you already use.
            </h2>
            <p className="mt-5 text-base leading-7 text-text-secondary">
              Install PointsGeek for Chrome, sign in once, then sync balances
              when you visit supported loyalty and bank rewards accounts.
            </p>

            <ul className="mt-5 space-y-3 text-sm leading-6 text-text-secondary">
              <li className="flex gap-3">
                <CheckIcon />
                <span>Works with supported airline, hotel, bank, and reward programs.</span>
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                <span>Reads balances from the logged-in page and sends only the synced totals.</span>
              </li>
            </ul>

            <div className="mt-8">
              <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-text-secondary">
                <div className="h-px flex-1 bg-border" />
                Free download
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="mx-auto grid w-full max-w-sm gap-3">
                <a
                  href={CHROME_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text-primary no-underline shadow-sm transition-colors hover:bg-surface-hover"
                >
                  <ChromeIcon />
                  Chrome Web Store
                </a>
              </div>
            </div>
          </div>

          <ExtensionPreview />
        </section>
      </main>
    </AppShell>
  );
}

function ExtensionPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-[#1b1f2a] shadow-2xl"
      aria-hidden="true"
    >
      <div className="flex h-9 items-center gap-2 border-b border-white/10 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <div className="ml-3 h-5 flex-1 rounded bg-white/10" />
      </div>
      <div className="relative min-h-[310px] bg-surface p-6">
        <div className="absolute inset-x-6 top-6 rounded-lg border border-border bg-background p-4 opacity-70">
          <div className="mb-4 h-4 w-32 rounded bg-surface-secondary" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-20 rounded-lg border border-border bg-surface" />
            <div className="h-20 rounded-lg border border-border bg-surface" />
            <div className="h-20 rounded-lg border border-border bg-surface" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 rounded bg-surface-secondary" />
            <div className="h-3 w-5/6 rounded bg-surface-secondary" />
            <div className="h-3 w-2/3 rounded bg-surface-secondary" />
          </div>
        </div>

        <div className="absolute bottom-6 right-6 z-10 flex min-w-[240px] flex-col gap-1.5 rounded-[10px] border border-[#16a34a] bg-white px-3.5 py-3 text-[#22201d] shadow-[0_4px_14px_rgba(34,32,29,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2">
              <Image
                src="/brand/icon.svg"
                alt=""
                width={18}
                height={18}
                className="rounded"
              />
              <div className="text-sm font-semibold tracking-[-0.01em]">
                Points<span className="text-[#6b4a9e]">Geek</span>
              </div>
            </div>
            <div className="-m-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-[#a6a39f]">
              <svg
                viewBox="0 0 16 16"
                width="10"
                height="10"
                aria-hidden="true"
              >
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="relative inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-[#16a34a]">
              <span className="absolute left-[4px] top-[2px] h-[7px] w-1 rotate-45 border-b-2 border-r-2 border-white" />
            </span>
            <div className="font-medium">
              Points synced
              <span className="text-text-secondary"> · </span>
              <span className="font-semibold text-[#6b4a9e]">
                View Balances here
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--purple-primary)] text-white">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
    </span>
  );
}

function ChromeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#4285F4" />
      <path d="M12 12 7 3.34A10 10 0 0 1 22 12Z" fill="#EA4335" />
      <path d="M12 12h10A10 10 0 0 1 7 20.66Z" fill="#34A853" />
      <path d="M12 12 7 20.66A10 10 0 0 1 7 3.34Z" fill="#FBBC05" />
      <circle cx="12" cy="12" r="4" fill="#fff" />
      <circle cx="12" cy="12" r="2.6" fill="#4285F4" />
    </svg>
  );
}
