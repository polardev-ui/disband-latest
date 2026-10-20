"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { createPortal } from "react-dom";

interface DangerousDownloadModalProps {
  open: boolean;
  fileName: string;
  onClose: () => void;
  onContinue: () => void;
}

export function DangerousDownloadModal({
  open,
  fileName,
  onClose,
  onContinue,
}: DangerousDownloadModalProps) {
  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  if (!mounted || typeof document === "undefined") return null;

  // Portalled to <body>: rendered inside the chat, a transformed ancestor
  // turned "fixed" into "fixed to the chat pane", so the scrim only covered it.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 pb-6 pt-40 sm:pt-48">
      <button
        type="button"
        aria-label="Close"
        className={`absolute inset-0 bg-overlay-scrim overlay-fade${exiting ? " overlay-fade-out" : ""}`}
        onClick={onClose}
      />
      {/* Tether and the card animate as one piece, so they appear and fade
          out together and he never lingers after the card has gone. */}
      <div className={`modal-pop${exiting ? " modal-pop-out" : ""} relative w-full max-w-[420px]`}>
        {/* Tether stands behind the card, which cuts him off just below the
            chest so most of him shows above it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/tether-stop.png"
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-0 z-0 w-[165px] -translate-x-1/2 -translate-y-[92%] select-none sm:w-[215px]"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="download-warning-title"
          aria-describedby="download-warning-body"
          className="relative z-10 rounded-[4px] border border-divider bg-bg-secondary p-5 shadow-[var(--elevation-high)]"
        >
          <h2 id="download-warning-title" className="text-[18px] font-semibold leading-6 text-header-primary">
            This file might be unsafe
          </h2>
          <p id="download-warning-body" className="mt-2.5 text-[14px] leading-[20px] text-text-muted">
            <span className="break-all font-medium text-text-normal">{fileName}</span> was sent in chat.
            Only continue if you know this file is safe and you trust the person who sent it. Files can
            contain malware or other harmful content.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[3px] px-4 py-2 text-[14px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="rounded-[3px] bg-brand px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
