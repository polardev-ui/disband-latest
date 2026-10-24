"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useRef } from "react";
import { getInviteUrl } from "@/lib/utils";
import { IconClose } from "@/components/icons";
import { CopyField } from "@/components/modals/server-settings/InvitesSection";
import { SendInvitePanel } from "@/components/modals/SendInvitePanel";
import type { Server } from "@/lib/supabase/types";

interface InviteSpaceModalProps {
  server: Server | null;
  onClose: () => void;
}

/**
 * "Invite people" for any member of a space: the short invite link (the
 * custom one when the space has claimed it) and friends to drop it to.
 * Space settings keeps the vanity controls; this is the everyday way in.
 */
export function InviteSpaceModal({ server, onClose }: InviteSpaceModalProps) {
  const open = !!server;
  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);
  const lastRef = useRef<Server | null>(null);
  if (server) lastRef.current = server;
  const shown = server ?? lastRef.current;

  if (!mounted || !shown) return null;
  const code = shown.vanity_code || shown.invite_code;
  const inviteUrl = code ? getInviteUrl(code) : null;

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-overlay-scrim overlay-fade${exiting ? " overlay-fade-out" : ""} p-4`}>
      <div role="dialog" aria-modal="true" aria-label={`Invite people to ${shown.name}`} className={`modal-pop${exiting ? " modal-pop-out" : ""} flex max-h-[80vh] w-full max-w-md flex-col rounded-lg bg-bg-secondary shadow-[var(--elevation-high)]`}>
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Invite people</h2>
            <p className="truncate text-[13px] text-text-muted">to {shown.name}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-interactive-normal hover:text-interactive-active"><IconClose size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {inviteUrl ? (
            <SendInvitePanel inviteUrl={inviteUrl} serverName={shown.name} />
          ) : null}
        </div>
        <div className="border-t border-divider px-5 py-4">
          <p className="mb-2 text-[12px] font-bold uppercase text-header-secondary">Or send a link</p>
          {inviteUrl ? (
            <CopyField value={inviteUrl} />
          ) : (
            <p className="text-[14px] text-text-muted">This space doesn&apos;t have an invite link yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
