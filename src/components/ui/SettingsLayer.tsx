"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";

/*
 The classic full-screen settings layer, shared by User Settings, Space
 Settings and Channel Settings.

 Opening it is a two-part move: the app behind scales back to 93% and fades
 while this layer zooms in from 110%. `layer-open` on <body> drives the app
 half (see `.app-base-layer` in globals.css); the layer animates itself.

 Layout: a grey sidebar that fills the left half with its 218px menu pinned
 to the right edge, and the page on the right with a round ESC button.
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
      className={`settings-layer${exiting ? " settings-layer-out" : ""} fixed inset-0 z-[70] flex bg-bg-primary`}
    >
      <div className="hidden flex-[1_0_240px] justify-end bg-bg-secondary md:flex">
        <nav aria-label={`${label} sections`} className="settings-sidebar w-[240px] overflow-y-auto py-[60px] pl-5 pr-1.5">
          {sidebar}
        </nav>
      </div>
      <div className="relative min-w-0 flex-[1_1_900px] bg-bg-primary">
        <div className="settings-scroll h-full overflow-y-auto">
          <div className="flex">
            <div key={contentKey} className={`view-enter min-w-0 flex-1 px-4 pb-20 pt-6 md:min-w-[460px] md:px-10 md:pt-[60px] ${wide ? "max-w-[1320px]" : "max-w-[900px]"}`}>
              {mobileNav && <div className="mb-4 md:hidden">{mobileNav}</div>}
              {children}
            </div>
            <div className="w-[24px] shrink-0 pt-6 md:pt-[60px]">
              <div className="sticky top-[60px] flex flex-col items-center">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-interactive-normal text-interactive-normal transition-colors hover:border-interactive-active hover:bg-interactive-hover hover:text-interactive-active active:translate-y-px"
                >
                  <IconClose size={18} />
                </button>
                <span aria-hidden className="mt-2 text-[13px] font-semibold text-interactive-normal">ESC</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A sidebar group heading ("USER SETTINGS"). */
export function SettingsNavHeader({ children }: { children: ReactNode }) {
  return <h2 className="truncate px-2.5 pb-1.5 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-channels-default">{children}</h2>;
}

/** One sidebar item. */
export function SettingsNavItem({
  active,
  danger,
  onClick,
  children,
  trailing,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center justify-between gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[16px] font-medium leading-5 transition-colors duration-75 ${
        danger
          ? "text-status-dnd hover:bg-interactive-hover"
          : active
            ? "bg-interactive-selected text-interactive-active"
            : "text-interactive-normal hover:bg-interactive-hover hover:text-text-normal"
      }`}
    >
      <span className="min-w-0 truncate">{children}</span>
      {trailing}
    </button>
  );
}

export function SettingsNavSeparator() {
  return <div aria-hidden className="mx-2.5 my-2 h-px bg-divider/70" />;
}
