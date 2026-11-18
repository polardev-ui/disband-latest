"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { UsernameAvailabilityInput } from "./UsernameAvailabilityInput";

/**
 * Asks for a username when the account has only a placeholder.
 *
 * A sign-up that doesn't confirm its email within 10 minutes gives its
 * username back (migration 0265), so whoever asks for the name next can
 * have it, and the waiting account's name becomes "pending_…". If that
 * account is confirmed later, this is the first thing its owner sees: the
 * name they wanted may already be someone else's, so they pick one now.
 */
export function PickUsernamePrompt() {
  const { profile, updateProfile } = useApp();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile?.username?.startsWith("pending_")) return null;

  const save = async () => {
    const next = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,25}$/.test(next) || next.startsWith("pending_")) {
      setError(t("Use 2–25 letters, numbers, or underscores."));
      return;
    }
    setBusy(true);
    setError(null);
    const err = await updateProfile({ username: next });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/5 bg-bg-secondary p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-header-primary">{t("Choose your username")}</h2>
        <p className="mt-2 text-[14px] text-text-muted">
          {t("Your account wasn't confirmed in time to keep the username you signed up with, so it was freed up for others. Pick one to finish setting up.")}
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <UsernameAvailabilityInput value={username} onChange={setUsername} currentUsername={profile.username} />
          {error && <p className="text-[13px] text-status-dnd">{error}</p>}
          <button
            type="submit"
            disabled={busy || !username.trim()}
            className="h-10 w-full rounded-lg bg-brand font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {busy ? t("Saving…") : t("Save username")}
          </button>
        </form>
      </div>
    </div>
  );
}
