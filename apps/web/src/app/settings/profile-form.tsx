"use client";

import { useRef, useState } from "react";

const MAX_IMAGE_BYTES = 500 * 1024; // 500 KB — keeps base64 payload small.

/**
 * Monarch-style Profile card. Handles the interactive bits the server
 * component can't:
 *   - File picker → read as base64 data URL → stash in a hidden input
 *     so the server action receives it as a string.
 *   - Local preview of the chosen picture before Save is clicked.
 *   - Client-side size cap (500 KB) with a friendly error message;
 *     the server action re-validates as well.
 *
 * Actual DB write happens in the passed-in server action.
 */
export function ProfileForm({
  action,
  defaults,
  email,
  timezones,
}: {
  action: (formData: FormData) => void;
  defaults: {
    firstName: string;
    lastName: string;
    birthday: string;
    timezone: string;
    profileImage: string | null;
    oauthImage: string | null;
  };
  email: string;
  timezones: readonly string[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(
    defaults.profileImage
  );
  const [imageError, setImageError] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("That file isn't an image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(
        `Image is ${Math.round(file.size / 1024)} KB — please pick one under ${
          MAX_IMAGE_BYTES / 1024
        } KB.`
      );
      return;
    }
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  // Prefer: freshly chosen file > previously saved > OAuth avatar
  // > letter fallback. Letter fallback matches the sidebar UserMenu
  // avatar style so the app feels consistent before a picture is set.
  const previewUrl = imageDataUrl ?? defaults.oauthImage;
  const initial =
    (defaults.firstName || email).charAt(0).toUpperCase() || "?";

  return (
    <form action={action}>
      <div className="p-6 pb-5">
        <h2 className="text-base font-semibold text-text-primary">Profile</h2>
        <p className="text-sm text-text-secondary mt-1">
          Update your name, picture, and timezone.
        </p>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {/* Avatar + Choose picture */}
        <div className="flex items-center gap-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              aria-hidden="true"
              className="h-16 w-16 rounded-full border border-border object-cover bg-surface-secondary"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white text-xl font-semibold"
              style={{ backgroundColor: "var(--purple-primary)" }}
            >
              {initial}
            </span>
          )}
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
            >
              Choose picture
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="hidden"
            />
            {imageError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {imageError}
              </p>
            )}
            <p className="mt-1 text-xs text-text-tertiary">
              PNG, JPG, or GIF, under {MAX_IMAGE_BYTES / 1024} KB.
            </p>
          </div>
        </div>
        {/* Carries the picked file's data URL into the server action.
         *  Empty string means "no change" so the server leaves the
         *  stored image untouched. */}
        <input
          type="hidden"
          name="profileImage"
          value={imageDataUrl ?? ""}
        />

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
              defaultValue={defaults.firstName}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
            />
          </div>
          <div>
            <label
              htmlFor="lastName"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              defaultValue={defaults.lastName}
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
            defaultValue={defaults.birthday}
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
            defaultValue={defaults.timezone}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-text-accent focus:outline-none focus:ring-1 focus:ring-text-accent"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            readOnly
            disabled
            value={email}
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-tertiary cursor-not-allowed"
          />
        </div>
      </div>

      <div className="px-6 py-4 bg-surface-secondary/40 border-t border-border flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-[var(--purple-primary)] hover:bg-[var(--purple-hover)] text-white px-4 py-2 text-sm font-semibold transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}
