"use client";

/**
 * The card a bot invite link turns into in chat: the bot, its verified tag,
 * and an "Authorize App" button that opens the add-to-space flow right here.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { useApp } from "@/contexts/AppContext";
import { BotTag } from "@/components/ui/BotTag";
import { safeImageUrl } from "@/lib/safe-url";
import { BotAuthorizeFlow, fetchBotInvite, type BotInviteData } from "./BotAuthorizeFlow";

export function BotAuthorizeModal({ code, onClose }: { code: string; onClose: () => void }) {
  const { selectServer } = useApp();
  useOverlayDismiss(onClose, true);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" tabIndex={-1} className="overlay-fade absolute inset-0 bg-overlay-scrim-strong" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Add to a space" className="modal-pop relative max-h-[calc(100dvh-32px)] w-full max-w-[440px] overflow-y-auto rounded-2xl border border-border-subtle bg-bg-primary shadow-[var(--elevation-high)]">
        <BotAuthorizeFlow
          code={code}
          onClose={onClose}
          onOpenSpace={(id) => { onClose(); void selectServer(id); }}
        />
      </div>
    </div>,
    document.body,
  );
}

export function BotInviteEmbed({ code, onLoad }: { code: string; onLoad?: () => void }) {
  const [invite, setInvite] = useState<BotInviteData | null | undefined>(undefined);
  const [verified, setVerified] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchBotInvite(code).then((l) => {
      if (!live) return;
      const inv = l.state === "ready" ? l.invite : null;
      setInvite(inv);
      onLoad?.();
      if (inv) {
        void getSupabaseClient().from("profiles").select("verified_bot").eq("id", inv.bot.user_id).maybeSingle()
          .then(({ data }) => { if (live) setVerified(!!(data as { verified_bot?: boolean } | null)?.verified_bot); });
      }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (invite === undefined) {
    return <div className="skeleton-glimmer mt-1.5 h-[84px] w-full max-w-[420px] rounded-xl" aria-hidden />;
  }
  if (invite === null) {
    return (
      <div className="mt-1.5 w-full max-w-[420px] rounded-xl border border-border-subtle bg-bg-secondary px-4 py-3 text-[13px] text-text-muted">
        This bot invite doesn&apos;t work any more.
      </div>
    );
  }

  const avatar = safeImageUrl(invite.bot.avatar_url);
  const usable = invite.status === "pending";
  return (
    <>
      <div className="mt-1.5 w-full max-w-[420px] rounded-xl border border-border-subtle bg-bg-secondary p-3.5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">Add an app to your space</p>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-[18px] font-bold text-header-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : invite.bot.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-[16px] font-bold text-header-primary">{invite.bot.name}</span>
              <BotTag profile={{ is_bot: true, verified_bot: verified }} size="sm" />
            </p>
            <p className="truncate text-[13px] text-text-muted">
              {invite.server ? `For ${invite.server.name}` : `${invite.scopes.length} permission${invite.scopes.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            disabled={!usable}
            onClick={() => setOpen(true)}
            className="h-10 shrink-0 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-button-secondary disabled:text-text-muted"
          >
            {usable ? "Authorize App" : "Used"}
          </button>
        </div>
      </div>
      {open && <BotAuthorizeModal code={code} onClose={() => setOpen(false)} />}
    </>
  );
}
