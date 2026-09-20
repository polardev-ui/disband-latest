"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  OVERLAY_Z,
  handleTopmostEscape,
  pushEscapeHandler,
} from "@/lib/overlay";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuContextValue {
  openMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [mounted, setMounted] = useState(false);
  const menuId = useId();
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    setMenu({ x, y, items });
  }, []);

  // Focus the first item when the menu opens so keyboard users land inside
  // it; Escape is routed through the topmost-only stack.
  useEffect(() => {
    if (!menu) return;
    const removeEscape = pushEscapeHandler(closeMenu);
    const t = requestAnimationFrame(() => firstItemRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      // Don't close when the press starts on the opener: the click that
      // opened the menu would otherwise instantly dismiss it.
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-context-menu]")) return;
      if (target?.closest("[data-context-menu-trigger-open]")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      handleTopmostEscape(e);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      removeEscape();
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}
      {mounted &&
        menu &&
        createPortal(
          <div
            data-context-menu
            role="menu"
            aria-labelledby={menuId}
            className="modal-pop fixed min-w-[188px] rounded-md border border-divider bg-overlay-surface py-1.5 shadow-2xl"
            style={{
              zIndex: OVERLAY_Z.contextMenu,
              left: Math.min(menu.x, window.innerWidth - 200),
              top: Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 16),
            }}
          >
            <span id={menuId} className="sr-only">
              Context menu
            </span>
            {menu.items.map((item, i) => (
              <button
                key={item.id}
                ref={i === 0 ? firstItemRef : undefined}
                type="button"
                role="menuitem"
                disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) item.onClick();
                closeMenu();
              }}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-all duration-150 ease-in-out disabled:opacity-40 ${
                item.danger
                  ? "text-status-dnd hover:bg-brand hover:text-white"
                  : "text-text-normal hover:bg-brand hover:text-white"
              }`}
            >
              {item.icon && <span className="w-4 shrink-0 opacity-80">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
        )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error("useContextMenu requires ContextMenuProvider");
  return ctx;
}
