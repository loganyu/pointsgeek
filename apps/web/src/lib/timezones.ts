/**
 * Curated IANA timezone list used by the onboarding + Settings
 * timezone picker. A flat `<select>` of tzdb's 400+ zones is a UX
 * trap, so we ship a common-case subset. The `ensureIncluded` helper
 * prepends a user's saved zone when it isn't in the base list so the
 * dropdown stays correct for users migrated from older data.
 */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
] as const;

export const DEFAULT_TIMEZONE: (typeof TIMEZONES)[number] = "America/New_York";

export function ensureIncluded(zone: string): readonly string[] {
  return TIMEZONES.includes(zone as (typeof TIMEZONES)[number])
    ? TIMEZONES
    : [zone, ...TIMEZONES];
}
