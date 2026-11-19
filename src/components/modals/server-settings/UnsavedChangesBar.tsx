"use client";

import { useEffect, useState } from "react";
import { usePresence } from "@/hooks/usePresence";
import { onUnsavedNudge, setUnsavedChanges } from "@/lib/unsaved-changes";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { useI18n } from "@/contexts/I18nContext";

/*
 "Careful — you have unsaved changes!" with Reset and Save Changes, pinned to
 the bottom of a settings panel while there are edits waiting. It fades in and
 slides up when the first change is made, and back down once they're saved or
 reset. Trying to leave with changes waiting shakes it and flashes it red.
*/
export function UnsavedChangesBar({
  dirty,
  saving,
  onReset,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const { mounted, exiting } = usePresence(dirty, 180);
  const [shake, setShake] = useState(0);

  // Tells the settings window there's something to lose.
  useEffect(() => {
    setUnsavedChanges(dirty);
    return () => setUnsavedChanges(false);
  }, [dirty]);

  useEffect(() => onUnsavedNudge(() => setShake((n) => n + 1)), []);

  useEffect(() => {
    if (!shake) return;
    const timer = window.setTimeout(() => setShake(0), 1200);
    return () => window.clearTimeout(timer);
  }, [shake]);

  if (!mounted) return null;
  const warn = shake > 0;

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-6 flex justify-center">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto w-full max-w-[700px] ${exiting ? "unsaved-bar-out" : "unsaved-bar-in"}`}
      >
        <div
          key={shake}
          className={`flex items-center gap-3 rounded-lg px-4 py-2.5 shadow-[var(--elevation-high)] transition-colors duration-200 ${
            warn ? "unsaved-bar-shake bg-status-dnd" : "bg-bg-floating"
          }`}
        >
          <p className={`min-w-0 flex-1 text-[14px] font-medium ${warn ? "text-white" : "text-header-primary"}`}>
            {t("Careful — you have unsaved changes!")}
          </p>
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className={`h-8 shrink-0 rounded-md px-3 text-[14px] font-medium hover:underline disabled:opacity-50 ${warn ? "text-white" : "text-text-link"}`}
          >
            {t("Reset")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex h-8 min-w-[112px] shrink-0 items-center justify-center rounded-md bg-[#248046] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1a6334] disabled:opacity-60"
          >
            {saving ? <LoadingDots size={6} /> : t("Save Changes")}
          </button>
        </div>
      </div>
    </div>
  );
}
