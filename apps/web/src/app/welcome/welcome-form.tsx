"use client";

import { useEffect, useState } from "react";

/**
 * Onboarding form: First Name (required) + Last Name + Birthday +
 * Timezone. Timezone is auto-detected from the browser on mount and
 * pre-selected in the dropdown when it matches a zone in our curated
 * list; otherwise we fall back to `defaultTimezone`. Everything
 * except First Name is optional so the user can always reach the
 * dashboard.
 */
export function WelcomeForm({
  action,
  defaults,
  timezones,
  defaultTimezone,
}: {
  action: (formData: FormData) => void;
  defaults: {
    firstName: string;
    lastName: string;
  };
  timezones: readonly string[];
  defaultTimezone: string;
}) {
  const [firstName, setFirstName] = useState(defaults.firstName);
  const [timezone, setTimezone] = useState(defaultTimezone);

  // Detect the browser's IANA zone on mount and pre-select it when
  // it's in our curated list. Wrapped in try/catch because
  // `Intl.DateTimeFormat` can throw in old/locked-down environments.
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && timezones.includes(detected)) {
        setTimezone(detected);
      }
    } catch {
      // leave at defaultTimezone
    }
  }, [timezones]);

  const canSubmit = firstName.trim().length > 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="firstName"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Logan"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
            />
          </div>
          <div>
            <label
              htmlFor="lastName"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Last name{" "}
              <span className="text-text-tertiary font-normal">
                (optional)
              </span>
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              defaultValue={defaults.lastName}
              placeholder="Yu"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="birthday"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Birthday{" "}
            <span className="text-text-tertiary font-normal">(optional)</span>
          </label>
          <input
            id="birthday"
            name="birthday"
            type="date"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
          />
        </div>

        <div>
          <label
            htmlFor="timezone"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-[var(--purple-primary)] hover:bg-[var(--purple-hover)] disabled:bg-[var(--purple-tint)] disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
