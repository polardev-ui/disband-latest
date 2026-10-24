"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FieldLabel, btn } from "@/components/modals/server-settings/ui";
import {
  currentDialog,
  registerDialogHost,
  settleDialog,
  subscribeDialogs,
  type DialogRequest,
} from "@/lib/dialogs";
import { handleTopmostEscape, pushEscapeHandler } from "@/lib/overlay";

/**
 * Draws the dialogs from `@/lib/dialogs` (confirm, prompt, alert), one at a
 * time, above every other layer including settings. Mounted once at the root.
 */
export function DialogHost() {
  const request = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
  useEffect(() => registerDialogHost(), []);
  if (!request || typeof document === "undefined") return null;
  return createPortal(<DialogCard key={request.id} request={request} />, document.body);
}

function DialogCard({ request }: { request: DialogRequest }) {
  const [value, setValue] = useState(request.kind === "prompt" ? request.defaultValue : "");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cancel = () =>
    settleDialog(request.id, (r) => {
      if (r.kind === "confirm") r.resolve(false);
      else if (r.kind === "prompt") r.resolve(null);
      else r.resolve();
    });
  const accept = () =>
    settleDialog(request.id, (r) => {
      if (r.kind === "confirm") r.resolve(true);
      else if (r.kind === "prompt") r.resolve(value);
      else r.resolve();
    });

  // Escape cancels; this sits on top of the shared overlay stack so it never
  // also closes the settings page or modal underneath.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const release = pushEscapeHandler(() => cancelRef.current());
    const onKey = (e: KeyboardEvent) => handleTopmostEscape(e);
    document.addEventListener("keydown", onKey, true);
    if (request.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }
    return () => {
      release();
      document.removeEventListener("keydown", onKey, true);
    };
  }, [request.kind]);

  const blocked = request.kind === "prompt" && !value.trim();
  const primaryClass =
    request.kind === "confirm" && request.tone === "danger" ? btn.danger : btn.primary;
  const primaryLabel =
    request.kind === "alert" ? "Okay" : request.confirmLabel;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        className="overlay-fade absolute inset-0 bg-overlay-scrim-strong"
        onClick={cancel}
      />
      <form
        role={request.kind === "prompt" ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-label={request.title}
        className="classic-modal relative w-full max-w-[440px] overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) accept();
        }}
      >
        <div className="px-6 pb-5 pt-6">
          <h2 className="break-words text-[20px] font-semibold leading-6 text-header-primary">{request.title}</h2>
          {request.body && (
            <p className="mt-2 whitespace-pre-line break-words text-[16px] leading-5 text-text-normal">{request.body}</p>
          )}
          {request.kind === "prompt" && (
            <div className="mt-4">
              <FieldLabel htmlFor="dialog-input">{request.label}</FieldLabel>
              <input
                id="dialog-input"
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.placeholder}
                maxLength={request.maxLength}
                autoComplete="off"
                className="w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 py-2.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted/80 focus:border-[#00a8fc]"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 bg-bg-secondary p-4">
          {request.kind !== "alert" && (
            <button type="button" onClick={cancel} className={btn.ghost}>
              Cancel
            </button>
          )}
          <button ref={confirmRef} type="submit" disabled={blocked} className={primaryClass}>
            {primaryLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
