"use client";

/**
 * "Authorize App" on a bot's profile: opens the add-to-space popup, where
 * you pick a space and approve what it can do. Shows nothing for bots
 * without a public link (migration 0244).
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { BotAuthorizeModal } from "@/components/bot/BotInviteEmbed";

export function AuthorizeAppButton({ userId, className = "" }: { userId: string; className?: string }) {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSupabaseClient()
      .rpc("public_bot_install_code", { p_user_id: userId })
      .then(({ data }) => { if (!cancelled) setCode(typeof data === "string" && data ? data : null); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!code) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover ${className}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t("Authorize App")}
      </button>
      {open && <BotAuthorizeModal code={code} onClose={() => setOpen(false)} />}
    </>
  );
}
