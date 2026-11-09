"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { handleTopmostEscape, pushEscapeHandler } from "@/lib/overlay";
import { useI18n } from "@/contexts/I18nContext";

/*
 The standard modal: a dimmed scrim and a bordered, rounded card that pops in
 (scale 0.9 → 1 with a slight overshoot, `.classic-modal`). The title sits top
 left beside a close button (centred for the account modals), and the actions
 line up on the right at the foot of the same card.
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
  banner,
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
  /** Full-bleed artwork above the title. */
  banner?: ReactNode;
}) {
  const { t } = useI18n();
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
      <button type="button" aria-label={t("Close")} className="overlay-fade absolute inset-0 bg-overlay-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="classic-modal relative w-full overflow-hidden rounded-xl border border-border-subtle bg-bg-primary shadow-[var(--elevation-high)]"
        style={{ maxWidth: width }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close")}
          className="absolute right-3 top-3 z-[1] flex h-8 w-8 items-center justify-center rounded-lg text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        >
          <IconClose size={20} />
        </button>
        {banner}
        <div className={`px-5 pt-5 ${centered ? "px-10 text-center" : "pr-12"}`}>
          <h2 className={`font-bold leading-7 text-header-primary ${centered ? "text-[22px]" : "text-[20px]"}`}>{title}</h2>
          {subtitle && <p className="mt-1.5 text-[15px] leading-5 text-text-muted">{subtitle}</p>}
        </div>
        <div className="px-5 pb-5 pt-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Uppercase field label used inside classic modals and settings. */
export function ClassicLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-semibold leading-4 text-header-secondary">
      {children}
    </label>
  );
}

export const classicInput =
  "h-10 w-full rounded-lg border border-border-subtle bg-bg-tertiary px-3 text-[15px] text-text-normal outline-none transition-colors placeholder:text-text-muted/80 focus:border-brand";

/** Button sizes: "md" is 40px (modal footers), "sm" is 32px (rows). */
export const classicBtn = {
  brand: "inline-flex items-center justify-center rounded-lg bg-brand px-4 text-[14px] font-semibold leading-4 text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50",
  grey: "inline-flex items-center justify-center rounded-lg bg-button-secondary px-4 text-[14px] font-semibold leading-4 text-header-primary transition-colors hover:bg-button-secondary-hover disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex items-center justify-center rounded-lg bg-button-danger px-4 text-[14px] font-semibold leading-4 text-white transition-colors hover:bg-button-danger-hover disabled:cursor-not-allowed disabled:opacity-50",
  dangerOutline: "inline-flex items-center justify-center rounded-lg border border-button-danger px-4 text-[14px] font-semibold leading-4 text-button-danger transition-colors hover:bg-button-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
  link: "inline-flex items-center justify-center rounded-lg px-4 text-[14px] font-semibold leading-4 text-header-primary transition-colors hover:bg-interactive-hover disabled:opacity-50",
  md: "h-10 min-w-[96px]",
  sm: "h-8 min-w-[60px]",
};
