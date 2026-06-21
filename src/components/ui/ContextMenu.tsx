"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    setMenu({ x, y, items });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-context-menu]")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}
      {menu && (
        <div
          data-context-menu
          className="fixed z-[100] min-w-[188px] rounded-md border border-black/20 bg-[#111214] py-1.5 shadow-2xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 200),
            top: Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 16),
          }}
        >
          {menu.items.map((item) => (
            <button
              key={item.id}
              type="button"
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
        </div>
      )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error("useContextMenu requires ContextMenuProvider");
  return ctx;
}

/** Helper to open a menu from a native contextmenu event. */
export function useContextMenuHandler(items: ContextMenuItem[]) {
  const { openMenu } = useContextMenu();
  return (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, items);
  };
}
