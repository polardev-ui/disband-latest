"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { createPortal } from "react-dom";
import { IconPin, IconPinOff } from "@/components/icons";
import type { PinnedMessage } from "@/lib/supabase/types";

interface PinnedMessagesPanelProps {
  open: boolean;
  threadName: string;
  pins: PinnedMessage[];
  onClose: () => void;
  onUnpin: (messageId: string) => void;
}

export function PinnedMessagesPanel({
  open,
  threadName,
  pins,
  onClose,
  onUnpin,
}: PinnedMessagesPanelProps) {
  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  if (!mounted) return null;

  const content = (
    <>
      <div className={`fixed inset-0 z-40 bg-transparent overlay-fade${exiting ? " overlay-fade-out" : ""}`} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Pinned messages" className={`menu-pop${exiting ? " modal-pop-out" : ""} fixed right-2 top-[56px] z-50 flex max-h-[calc(100dvh-72px)] w-[420px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[4px] bg-bg-secondary shadow-[var(--elevation-high)]`}>
        <div className="flex h-12 shrink-0 items-center justify-between bg-bg-primary px-4 shadow-[var(--elevation-low)]">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-text-normal">
            <IconPin size={16} className="text-text-muted" />
            Pinned Messages
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="border-b border-divider px-4 py-2 text-xs text-text-muted">{threadName}</p>

        <div className="channel-scroll min-h-0 overflow-y-auto p-3">
          {pins.length === 0 ? (
            <p className="py-10 text-center text-xs text-text-muted">
              No pinned messages yet.
              <br />
              Right-click a message and choose "Pin Message".
            </p>
          ) : (
            pins.map((pin) => (
              <div
                key={pin.id}
                className="group mb-2 flex items-start gap-3 rounded-[4px] bg-bg-primary px-3 py-3 transition-colors hover:bg-interactive-hover"
              >
                <span className="mt-0.5 shrink-0 text-brand">
                  <IconPin size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-text-muted">Pinned message</p>
                  <p className="mt-0.5 line-clamp-2 break-words text-sm text-text-normal">
                    {pin.content || "(attachment)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUnpin(pin.message_id)}
                  className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-brand/20 hover:text-brand group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Unpin message"
                >
                  <IconPinOff size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}