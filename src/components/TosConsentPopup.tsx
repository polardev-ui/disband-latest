"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import Link from "next/link";

const TOS_VERSION = "2026-10-28";

export function TosConsentPopup() {
  const { ready, session, user } = useApp();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || !session || !user) return;
    const meta = (user.user_metadata ?? {}) as { tos_version?: string };
    if (meta.tos_version !== TOS_VERSION) setVisible(true);
  }, [ready, session, user]);

  if (!visible) return null;

  const accept = async () => {
    setSaving(true);
    try {
      await getSupabaseClient().auth.updateUser({ data: { tos_version: TOS_VERSION } });
    } catch {
      // Best-effort; hide anyway to avoid blocking the app.
    } finally {
      setSaving(false);
      setVisible(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-full max-w-sm rounded-xl border border-divider bg-bg-secondary p-4 shadow-2xl">
      <p className="text-sm font-semibold text-text-normal">Updated Terms of Service</p>
      <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
        We’ve updated our Terms of Service and Privacy Policy. Please review and accept them to
        continue using Disband.
      </p>
      <div className="mt-3 flex items-center gap-3 text-[13px]">
        <Link href="/terms" className="text-brand hover:underline" target="_blank" rel="noopener noreferrer">
          Terms
        </Link>
        <Link href="/privacy" className="text-brand hover:underline" target="_blank" rel="noopener noreferrer">
          Privacy
        </Link>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void accept()}
          className="rounded-[3px] bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "I agree"}
        </button>
      </div>
    </div>
  );
}
