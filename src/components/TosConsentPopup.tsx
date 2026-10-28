"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isTauri } from "@/lib/platform";

const TOS_VERSION = "2026-10-28";

async function openExternal(url: string) {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:opener|open_url", { url });
      return;
    } catch {
      // Fall through to browser open.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

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
        <button
          type="button"
          onClick={() => void openExternal(`${window.location.origin}/terms`)}
          className="text-brand hover:underline"
        >
          Terms
        </button>
        <button
          type="button"
          onClick={() => void openExternal(`${window.location.origin}/privacy`)}
          className="text-brand hover:underline"
        >
          Privacy
        </button>
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
