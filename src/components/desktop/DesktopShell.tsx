"use client";

import { useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/platform";

/**
 * The Tauri shell's native-feel layer.
 *
 * Everything here is a no-op on the web (and on the first server render), so
 * the same tree still ships to browsers. On desktop it does four things, all
 * of which a browser would otherwise do for you and get wrong:
 *
 *   - marks the document as desktop (before paint, via layout.tsx) so the CSS
 *     can drop the browser tells — selection, drag ghosts, text cursors;
 *   - restores the window's remembered size and remembers it again;
 *   - takes back the shortcuts a page does not own (reload, zoom, devtools);
 *   - puts a real macOS menu bar in place of the browser's absence of one.
 *
 * It also renders the overlay-title-bar drag strip, hidden by CSS unless the
 * host is macOS.
 */

const WINDOW_STATE_KEY = "disband:window-state-v1";

interface WindowState {
  w: number;
  h: number;
  max: boolean;
}

function readWindowState(): WindowState | null {
  try {
    const raw = localStorage.getItem(WINDOW_STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<WindowState>;
    if (typeof s.w !== "number" || typeof s.h !== "number") return null;
    if (!Number.isFinite(s.w) || !Number.isFinite(s.h)) return null;
    return { w: s.w, h: s.h, max: !!s.max };
  } catch {
    return null;
  }
}

function writeWindowState(state: WindowState): void {
  try {
    localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota. Remembering the window is not worth a throw.
  }
}

/** Run an action against the current window; inert where there is no window. */
async function withWindow(action: (win: Window) => Promise<void> | void): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await action(getCurrentWindow());
  } catch {
    // A web build, or a shell without the window API: the bar stays inert.
  }
}

function detectOs(): string {
  const ua = navigator.userAgent;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? "";
  if (/mac|darwin/i.test(platform) || /Mac OS X/i.test(ua)) return "macos";
  if (/win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
  return "other";
}

/** Build and install the macOS application menu. Best-effort. */
async function installAppMenu(): Promise<void> {
  try {
    const { Menu } = await import("@tauri-apps/api/menu");
    const menu = await Menu.new({
      items: [
        {
          text: "Disband",
          items: [
            { item: { About: null } },
            { item: "Separator" },
            { item: "Services" },
            { item: "Separator" },
            { item: "Hide", text: "Hide Disband" },
            { item: "HideOthers", text: "Hide Others" },
            { item: "ShowAll", text: "Show All" },
            { item: "Separator" },
            { item: "Quit", text: "Quit Disband" },
          ],
        },
        {
          text: "Edit",
          items: [
            { item: "Undo" },
            { item: "Redo" },
            { item: "Separator" },
            { item: "Cut" },
            { item: "Copy" },
            { item: "Paste" },
            { item: "SelectAll" },
          ],
        },
        {
          text: "View",
          items: [{ item: "Fullscreen" }],
        },
        {
          text: "Window",
          items: [
            { item: "Minimize", text: "Minimize" },
            { item: "Maximize", text: "Zoom" },
            { item: "Separator" },
            { item: "CloseWindow", text: "Close Window" },
          ],
        },
      ],
    });
    await menu.setAsAppMenu();
  } catch {
    // The menu API is unavailable (an old shell). The window still works.
  }
}

export function DesktopShell() {
  const [maximized, setMaximized] = useState(false);

  // Mark the document and let CSS reveal the title-bar strip. The attribute is
  // normally already set by the pre-paint script; this is a backstop.
  useEffect(() => {
    if (!isTauri()) return;
    const root = document.documentElement;
    root.setAttribute("data-desktop", "true");
    if (!root.getAttribute("data-desktop-os")) {
      root.setAttribute("data-desktop-os", detectOs());
    }
  }, []);

  // Window size memory.
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisten: Array<() => void> = [];

    void (async () => {
      try {
        const { getCurrentWindow, PhysicalSize } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();

        const saved = readWindowState();
        try {
          if (saved?.max) await win.maximize();
          else if (saved) await win.setSize(new PhysicalSize(saved.w, saved.h));
        } catch {
          // Keep the configured default size.
        }

        let timer: ReturnType<typeof setTimeout> | null = null;
        const persist = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void (async () => {
              try {
                if (await win.isMaximized()) {
                  const prev = readWindowState();
                  writeWindowState({ w: prev?.w ?? 1280, h: prev?.h ?? 820, max: true });
                  return;
                }
                const size = await win.outerSize();
                writeWindowState({ w: size.width, h: size.height, max: false });
              } catch {
                // The window closed between the event and the read.
              }
            })();
          }, 450);
        };

        const u1 = await win.onResized(persist);
        const u2 = await win.onMoved(persist);
        if (disposed) {
          u1();
          u2();
        } else {
          unlisten.push(u1, u2);
        }
      } catch {
        // No window API. Nothing to remember.
      }
    })();

    return () => {
      disposed = true;
      for (const fn of unlisten) fn();
    };
  }, []);

  // Keep the maximize/restore control in step with the real window state.
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisten: Array<() => void> = [];
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const sync = async () => {
          try {
            const isMax = await win.isMaximized();
            if (!disposed) setMaximized(isMax);
          } catch {
            // Reading the window state is not permitted on an old shell.
          }
        };
        await sync();
        const u = await win.onResized(() => void sync());
        if (disposed) u();
        else unlisten.push(u);
      } catch {
        // No window API. The control still toggles, it just cannot show state.
      }
    })();
    return () => {
      disposed = true;
      for (const fn of unlisten) fn();
    };
  }, []);

  // Reclaim the shortcuts a webview would otherwise act on.
  useEffect(() => {
    if (!isTauri()) return;
    const isDev = process.env.NODE_ENV !== "production";

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (!isDev) {
        // Reload — the renderer is app state, not a page to refresh. F5 and
        // Cmd/Ctrl+R both go.
        if (e.key === "F5" || (mod && k === "r")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Devtools on a production build.
        if (e.key === "F12") {
          e.preventDefault();
          return;
        }
        if (mod && (e.altKey || e.shiftKey) && (k === "i" || k === "j" || k === "c")) {
          e.preventDefault();
          return;
        }
      }

      // Page zoom. The webview's own zoom is disabled in tauri.conf.json;
      // this catches the paths that slip through.
      if (mod && (k === "=" || k === "+" || k === "-" || k === "_" || k === "0")) {
        e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent) => {
      // Trackpad pinch arrives as ctrl+wheel; a plain wheel is scrolling.
      if (e.ctrlKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    const onDragStart = (e: DragEvent) => {
      // Preserve the app's own HTML5 drags (reordering servers, channels).
      const target = e.target as HTMLElement | null;
      if (target?.closest('[draggable="true"]')) return;
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturestart", onGesture);
    window.addEventListener("gesturechange", onGesture);
    window.addEventListener("gestureend", onGesture);
    window.addEventListener("dragstart", onDragStart, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturestart", onGesture);
      window.removeEventListener("gesturechange", onGesture);
      window.removeEventListener("gestureend", onGesture);
      window.removeEventListener("dragstart", onDragStart, true);
    };
  }, []);

  // macOS menu bar.
  useEffect(() => {
    if (!isTauri()) return;
    if (detectOs() !== "macos") return;
    void installAppMenu();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="desktop-titlebar"
      onDoubleClick={() => void withWindow((win) => win.toggleMaximize())}
    >
      <span data-tauri-drag-region className="desktop-titlebar-title">
        Disband
      </span>
      <div className="desktop-titlebar-controls" onDoubleClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void withWindow((win) => win.minimize())}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => void withWindow((win) => win.toggleMaximize())}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1">
              <path d="M2.5 2.5V1.5h6v6h-1" />
              <rect x="1.5" y="3.5" width="5" height="5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="1.5" y="1.5" width="7" height="7" />
            </svg>
          )}
        </button>
        <button
          type="button"
          data-close
          aria-label="Close"
          title="Close"
          onClick={() => void withWindow((win) => win.close())}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
