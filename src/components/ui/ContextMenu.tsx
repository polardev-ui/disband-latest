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
import { isTauri } from "@/lib/platform";
import { usePresence } from "@/hooks/usePresence";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** A non-interactive divider between groups. */
  separator?: boolean;
  onClick?: () => void;
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

/* ------------------------------------------------------- desktop fallback
   The webview's own context menu reads as a browser: Reload, Back, Save As,
   View Source. On desktop, any right-click the app does not claim gets one of
   ours instead — the same clipboard actions a native app would offer. */

function focusedEditable(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  if (el.isContentEditable) return el;
  return null;
}

async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older engines without the async clipboard API still have execCommand.
    return document.execCommand("copy");
  }
}

function selectAllInFocused(): void {
  const el = focusedEditable();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
    return;
  }
  document.execCommand("selectAll");
}

async function pasteIntoFocused(): Promise<void> {
  const el = focusedEditable();
  if (!el) return;
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    text = "";
  }
  if (!text) {
    // Nothing readable; let the webview attempt its own paste.
    document.execCommand("paste");
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    // Go through the prototype setter so React's value tracker sees the change
    // and the controlled input does not snap back to the old value.
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
    el.selectionStart = el.selectionEnd = start + text.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("insertText", false, text);
}

async function copyImageSource(src: string): Promise<void> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const type = blob.type.startsWith("image/") ? blob.type : "image/png";
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
  } catch {
    // Cross-origin image or no image clipboard: fall back to the address.
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      // Nothing else to try.
    }
  }
}

function buildDesktopMenuItems(target: HTMLElement): ContextMenuItem[] {
  const groups: ContextMenuItem[][] = [];
  const selection = window.getSelection()?.toString() ?? "";
  const editable = focusedEditable();
  const link = target.closest("a[href]") as HTMLAnchorElement | null;
  const image = target.closest("img") as HTMLImageElement | null;

  if (editable) {
    const editGroup: ContextMenuItem[] = [];
    if (selection) {
      editGroup.push({
        id: "cut",
        label: "Cut",
        onClick: () => {
          void copyText(selection).then((ok) => {
            if (ok) document.execCommand("cut");
          });
        },
      });
    }
    editGroup.push({
      id: "copy",
      label: "Copy",
      disabled: !selection,
      onClick: () => {
        void copyText(selection);
      },
    });
    editGroup.push({
      id: "paste",
      label: "Paste",
      onClick: () => void pasteIntoFocused(),
    });
    groups.push(editGroup);
  } else if (selection) {
    groups.push([
      { id: "copy", label: "Copy", onClick: () => void copyText(selection) },
    ]);
  }

  if (link) {
    const href = link.href;
    groups.push([
      { id: "copy-link", label: "Copy Link", onClick: () => void copyText(href) },
    ]);
  }

  if (image) {
    const src = image.currentSrc || image.src;
    groups.push([
      { id: "copy-image", label: "Copy Image", onClick: () => void copyImageSource(src) },
      { id: "copy-image-url", label: "Copy Image Address", onClick: () => void copyText(src) },
    ]);
  }

  groups.push([{ id: "select-all", label: "Select All", onClick: selectAllInFocused }]);

  const flat: ContextMenuItem[] = [];
  groups.forEach((group, i) => {
    if (i > 0) flat.push({ id: `sep-${i}`, label: "", separator: true });
    flat.push(...group);
  });
  return flat;
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [mounted, setMounted] = useState(false);
  const menuId = useId();
  const firstItemRef = useRef<HTMLButtonElement>(null);
  // Set the instant an app component opens a menu, so the desktop fallback
  // below can tell a handled right-click from a bare one.
  const openedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  // Keep the last-opened menu (and its items) around while it animates out,
  // since `closeMenu` clears `menu` immediately.
  const { mounted: menuMounted, exiting: menuExiting } = usePresence(!!menu, 180);
  const lastMenuRef = useRef<ContextMenuState | null>(null);
  if (menu) lastMenuRef.current = menu;
  const shownMenu = menu ?? lastMenuRef.current;

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    openedRef.current = true;
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

  // Desktop fallback: any right-click the app did not claim gets one of our
  // menus instead of the webview's browser menu. Browsers keep their own menu,
  // so this never fires there.
  useEffect(() => {
    if (!isTauri()) return;

    // Capture phase runs before React's handlers: clear the latch so the
    // bubble listener below can see whether an app menu opened for this event.
    const reset = () => {
      openedRef.current = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || openedRef.current) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      openMenu(e.clientX, e.clientY, buildDesktopMenuItems(target));
    };

    document.addEventListener("contextmenu", reset, true);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("contextmenu", reset, true);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [openMenu]);

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}
      {mounted &&
        menuMounted &&
        shownMenu &&
        createPortal(
          <div
            data-context-menu
            role="menu"
            aria-labelledby={menuId}
            className={`modal-pop${menuExiting ? " pop-out" : ""} fixed min-w-[200px] max-h-[70vh] overflow-y-auto overscroll-contain rounded-[14px] border border-divider bg-overlay-surface p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] [@media(pointer:coarse)]:min-w-[240px]`}
            style={{
              zIndex: OVERLAY_Z.contextMenu,
              left: Math.min(shownMenu.x, window.innerWidth - 200),
              top: Math.min(shownMenu.y, window.innerHeight - shownMenu.items.length * 36 - 16),
            }}
          >
            <span id={menuId} className="sr-only">
              Context menu
            </span>
            {shownMenu.items.map((item, i) =>
              item.separator ? (
                <div key={item.id} role="separator" className="my-1 h-px bg-divider" />
              ) : (
                <button
                  key={item.id}
                  ref={i === 0 ? firstItemRef : undefined}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    if (!item.disabled) item.onClick?.();
                    closeMenu();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-left text-[13.5px] transition-colors duration-100 disabled:opacity-40 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2.5 [@media(pointer:coarse)]:text-[15px] ${
                    item.danger
                      ? "text-status-dnd hover:bg-status-dnd/10"
                      : "text-text-normal hover:bg-interactive-hover"
                  }`}
                >
                  {item.icon && <span className="w-4 shrink-0 opacity-80">{item.icon}</span>}
                  {item.label}
                </button>
              ),
            )}
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
