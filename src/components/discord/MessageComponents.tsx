"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeWindowOpen } from "@/lib/safe-url";
import type { ActionRow, ButtonStyle, MessageInteractionInfo } from "@/lib/bot-commands";
import { useI18n } from "@/contexts/I18nContext";

/*
 A bot message's buttons, and the "@kai used /weather" line above a bot's
 answer to a command. Pressing a button sends the bot an interaction; the
 bot answers by posting or by editing this message.
*/

const STYLE_CLASS: Record<ButtonStyle, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "bg-button-secondary text-header-primary hover:bg-button-secondary-hover",
  success: "bg-[#248046] text-white hover:bg-[#1a6334]",
  danger: "bg-[#da373c] text-white hover:bg-[#a12828]",
  link: "bg-button-secondary text-header-primary hover:bg-button-secondary-hover",
};

export function MessageComponents({ messageId, rows }: { messageId: string; rows?: ActionRow[] | null }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!rows?.length) return null;

  async function press(customId: string) {
    if (pending) return;
    setPending(customId);
    setError(null);
    const { error: err } = await getSupabaseClient().rpc("press_bot_button", {
      p_message_id: messageId,
      p_custom_id: customId,
    });
    if (err) setError(err.message);
    // Give the bot a moment to answer before the button can be pressed again.
    window.setTimeout(() => setPending((p) => (p === customId ? null : p)), err ? 0 : 1500);
  }

  return (
    <div className="mt-1 space-y-1">
      {rows.map((row, r) => (
        <div key={r} className="flex flex-wrap gap-2">
          {row.components.map((b, i) => {
            const busy = pending === b.custom_id;
            return (
              <button
                key={b.custom_id ?? b.url ?? i}
                type="button"
                disabled={b.disabled || busy}
                onClick={() => (b.style === "link" && b.url ? safeWindowOpen(b.url) : b.custom_id && void press(b.custom_id))}
                className={`flex h-8 min-w-[60px] items-center justify-center gap-1.5 rounded-md px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${STYLE_CLASS[b.style]}`}
              >
                {b.emoji && <span aria-hidden>{b.emoji}</span>}
                {busy ? <span className="animate-pulse">•••</span> : b.label}
                {b.style === "link" && (
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-80">
                    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      ))}
      {error && <p className="text-[13px] text-status-dnd">{error}</p>}
    </div>
  );
}

export function InteractionHeader({ interaction }: { interaction?: MessageInteractionInfo | null }) {
  const { t } = useI18n();
  if (!interaction || interaction.type !== "command" || !interaction.name) return null;
  return (
    <div className="relative mb-0.5 flex h-[22px] max-w-full items-center gap-1 text-[14px] text-text-muted">
      <span aria-hidden className="mr-0.5">↳</span>
      <span className="truncate font-medium text-header-secondary">{interaction.display_name ?? interaction.username ?? t("Someone")}</span>
      <span className="shrink-0">used</span>
      <span className="shrink-0 font-medium text-[#00a8fc]">/{interaction.name}</span>
    </div>
  );
}
