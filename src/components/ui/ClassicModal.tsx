"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { handleTopmostEscape, pushEscapeHandler } from "@/lib/overlay";

/*
 The classic Discord modal: a near-black scrim, a #313338 card that pops in
 (scale 0.9 → 1 with a slight overshoot, `.classic-modal`), a centred title
 and subtitle, and a #2b2d31 footer holding a text "Cancel" and the primary
 action on the right.
*/

export function ClassicModal({
  open,
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 440,
  centered = true,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
  /** Centre the header, as on Discord's account modals. */
  centered?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const release = pushEscapeHandler(onClose);
    const onKey = (e: KeyboardEvent) => handleTopmostEscape(e);
    document.addEventListener("keydown", onKey);
    return () => {
      release();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="overlay-fade absolute inset-0 bg-black/85" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="classic-modal relative w-full overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]"
        style={{ maxWidth: width }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded text-interactive-normal transition-colors hover:text-interactive-active"
        >
          <IconClose size={22} />
        </button>
        <div className={`px-4 pt-6 ${centered ? "text-center" : ""}`}>
          <h2 className={`font-bold leading-[30px] text-header-primary ${centered ? "text-[24px]" : "text-[20px]"}`}>{title}</h2>
          {subtitle && <p className="mt-2 text-[16px] leading-5 text-header-secondary">{subtitle}</p>}
        </div>
        <div className="px-4 pb-6 pt-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 bg-bg-secondary p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Uppercase field label used inside classic modals and settings. */
export function ClassicLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
      {children}
    </label>
  );
}

export const classicInput =
  "h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none placeholder:text-text-muted/80 focus:border-[#00a8fc]";

/** Classic button sizes: "md" is 38px (modal footers), "sm" is 32px (rows). */
export const classicBtn = {
  brand: "inline-flex items-center justify-center rounded-[3px] bg-brand px-4 text-[14px] font-medium leading-4 text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50",
  grey: "inline-flex items-center justify-center rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium leading-4 text-white transition-colors hover:bg-button-secondary-hover disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex items-center justify-center rounded-[3px] bg-button-danger px-4 text-[14px] font-medium leading-4 text-white transition-colors hover:bg-button-danger-hover disabled:cursor-not-allowed disabled:opacity-50",
  dangerOutline: "inline-flex items-center justify-center rounded-[3px] border border-button-danger px-4 text-[14px] font-medium leading-4 text-white transition-colors hover:bg-button-danger disabled:cursor-not-allowed disabled:opacity-50",
  link: "inline-flex items-center justify-center px-4 text-[14px] font-medium leading-4 text-white hover:underline disabled:opacity-50",
  md: "h-[38px] min-w-[96px]",
  sm: "h-8 min-w-[60px]",
};
