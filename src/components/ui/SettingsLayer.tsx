"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { useI18n } from "@/contexts/I18nContext";

/*
 The settings window, shared by User Settings, Space Settings and Channel
 Settings.

 On wide screens it floats over the app as a large bordered window: the app
 behind stays in place, dimmed by a scrim and eased back slightly (`layer-open`
 on <body> drives that half, see `.app-base-layer` in globals.css), while the
 window scales up to meet it. On phones it fills the screen and the sidebar
 gives way to `mobileNav`.

 Layout: a sidebar of sections on the left, and on the right a header with the
 window's name and a close button above the scrolling page.
*/

export function SettingsLayer({
  label,
  exiting,
  onClose,
  sidebar,
  children,
  contentKey,
  wide = false,
  mobileNav,
}: {
  label: string;
  exiting: boolean;
  onClose: () => void;
  sidebar: ReactNode;
  children: ReactNode;
  /** Changes when the section changes, so the page re-runs its entrance. */
  contentKey?: string;
  /** Let the page use more width (roles editor, etc.). */
  wide?: boolean;
  /** Shown above the page on narrow screens, where the sidebar is hidden. */
  mobileNav?: ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (exiting) {
      document.body.classList.remove("layer-open");
      return;
    }
    document.body.classList.add("layer-open");
    return () => document.body.classList.remove("layer-open");
  }, [exiting]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={`settings-layer${exiting ? " settings-layer-out" : ""} fixed inset-0 z-[70] flex items-stretch justify-center md:items-center md:p-6 lg:p-8`}
    >
      {/* Not a close target: several pages hold unsaved edits behind a save bar. */}
      <div aria-hidden className="absolute inset-0 bg-overlay-scrim" />
      <div className="settings-window relative flex h-full w-full overflow-hidden bg-bg-primary md:h-[min(100%,960px)] md:max-w-[1440px] md:rounded-2xl md:border md:border-border-subtle md:shadow-[var(--elevation-high)]">
        <nav
          aria-label={t("{label} sections", { label })}
          className="settings-sidebar hidden w-[300px] shrink-0 flex-col overflow-y-auto border-r border-column-border bg-bg-secondary px-3 pb-6 pt-4 md:flex"
        >
          {sidebar}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-column-border px-5">
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-header-primary">{label}</h2>
            <span aria-hidden className="hidden rounded-md border border-border-subtle px-1.5 py-0.5 text-[11px] font-semibold text-text-muted md:inline">
              ESC
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active active:translate-y-px"
            >
              <IconClose size={20} />
            </button>
          </header>
          <div className="settings-scroll min-h-0 flex-1 overflow-y-auto">
            <div
              key={contentKey}
              className={`view-enter mx-auto w-full min-w-0 px-4 pb-20 pt-6 md:px-10 md:pt-8 ${wide ? "max-w-[1240px]" : "max-w-[880px]"}`}
            >
              {mobileNav && <div className="mb-4 md:hidden">{mobileNav}</div>}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A sidebar group heading ("YOUR ACCOUNT"). */
export function SettingsNavHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="truncate px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-text-muted">
      {children}
    </h2>
  );
}

/** One sidebar item, with an optional leading icon. */
export function SettingsNavItem({
  active,
  danger,
  onClick,
  children,
  trailing,
  icon,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
  trailing?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`mb-0.5 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] font-medium leading-5 transition-colors duration-75 ${
        danger
          ? "text-status-dnd hover:bg-status-dnd/10"
          : active
            ? "bg-interactive-selected text-interactive-active"
            : "text-interactive-normal hover:bg-interactive-hover hover:text-text-normal"
      }`}
    >
      {icon && (
        <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center ${active ? "text-interactive-active" : ""}`}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}

export function SettingsNavSeparator() {
  return <div aria-hidden className="mx-3 my-2.5 h-px bg-border-subtle" />;
}
