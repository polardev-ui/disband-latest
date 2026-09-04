"use client";

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

/** Modal that lists the messages pinned in the currently-open DM thread. */
export function PinnedMessagesPanel({
  open,
  threadName,
  pins,
  onClose,
  onUnpin,
}: PinnedMessagesPanelProps) {
  if (!open) return null;

  const content = (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-xl border border-divider bg-bg-secondary shadow-2xl sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-normal">
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

        <div className="max-h-80 overflow-y-auto p-2">
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
                className="group flex items-start gap-3 rounded px-2 py-2 transition-colors hover:bg-interactive-hover"
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
                  className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-brand/20 hover:text-brand group-hover:opacity-100"
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