"use client";

import { isTauri } from "@/lib/platform";

/**
 * The dock / taskbar / tab badge.
 *
 * Two states, matching what every chat app trains people to expect:
 *   - `mentions > 0` — a red pill with the number. Somebody addressed you.
 *   - `unread` with no mentions — a plain dot. Something is new, nothing urgent.
 *
 * Four surfaces need telling, and no single API covers them:
 *   - macOS / Linux desktop: Tauri's `setBadgeCount` writes the dock badge.
 *   - Windows desktop: no badge count exists; the taskbar takes a small overlay
 *     icon instead, which we draw here.
 *   - Installed PWAs: the Badging API (`navigator.setAppBadge`).
 *   - A plain browser tab: neither applies, so the favicon is redrawn and the
 *     count goes in front of the title — the only thing a tab strip shows.
 *
 * Every path is best-effort. A browser without the Badging API, a Linux desktop
 * whose shell ignores the count, a blocked canvas — each fails quietly and the
 * remaining surfaces still update.
 */

export interface BadgeState {
  /** Messages that named you directly (mentions, DMs, group messages). */
  mentions: number;
  /** Anything unread at all, including the mentions above. */
  unread: boolean;
}

const EMPTY: BadgeState = { mentions: 0, unread: false };

let applied: BadgeState | null = null;
let baseTitle: string | null = null;
let baseIcon: HTMLImageElement | null = null;
let baseIconLoad: Promise<HTMLImageElement | null> | null = null;

/** The badge colour, matching `--status-dnd` in globals.css. */
const BADGE_RED = "#f23f43";
const ICON_SRC = "/logo.png";

export function formatBadgeCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/**
 * Push a badge state to every surface this platform has. Repeated calls with
 * an unchanged state do nothing, so this is safe to call from a render effect.
 */
export function setAppBadge(next: BadgeState): void {
  if (typeof window === "undefined") return;
  const state: BadgeState = {
    mentions: Math.max(0, Math.floor(next.mentions)),
    unread: next.unread || next.mentions > 0,
  };
  if (applied && applied.mentions === state.mentions && applied.unread === state.unread) return;
  applied = state;

  void applyOsBadge(state);
  applyTitle(state);
  void applyFavicon(state);
}

export function clearAppBadge(): void {
  setAppBadge(EMPTY);
}

/* ------------------------------------------------------------------ desktop */

async function applyOsBadge(state: BadgeState): Promise<void> {
  if (isTauri()) {
    await applyTauriBadge(state);
    return;
  }
  // Badging API: an installed PWA only. A bare count of 0 is documented to
  // clear, but passing no argument is what renders the flat dot, so the two
  // states map cleanly onto the two calls.
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    if (state.mentions > 0) await nav.setAppBadge(state.mentions);
    else if (state.unread) await nav.setAppBadge();
    else await nav.clearAppBadge?.();
  } catch {
    // Unsupported, or the document is not the installed app. Nothing to do.
  }
}

async function applyTauriBadge(state: BadgeState): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();

    // macOS and Linux: a real dock badge. `undefined` removes it. A dot has no
    // count, so it is drawn as a 1 — the dock has no dot-only form, and a
    // silent no-op would lose the signal entirely.
    const count = state.mentions > 0 ? state.mentions : state.unread ? 1 : undefined;
    await win.setBadgeCount(count).catch(() => {});

    // Windows ignores the count and wants a 16px overlay on the taskbar icon.
    // Passing `undefined` clears it.
    if (isWindows()) {
      const png = state.unread ? await drawOverlayPng(state) : null;
      await win.setOverlayIcon(png ?? undefined).catch(() => {});
    }
  } catch {
    // Old shell, or the window closed mid-update.
  }
}

function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.userAgent;
  return /win/i.test(platform);
}

/* ---------------------------------------------------------------- title/tab */

function applyTitle(state: BadgeState): void {
  if (typeof document === "undefined") return;
  // Capture the real title once, before any prefix of ours is on it.
  baseTitle ??= document.title.replace(/^\((?:\d+\+?|•)\)\s*/, "");
  const prefix = state.mentions > 0
    ? `(${formatBadgeCount(state.mentions)}) `
    : state.unread
      ? "(•) "
      : "";
  document.title = `${prefix}${baseTitle}`;
}

/* ------------------------------------------------------------------ favicon */

function loadBaseIcon(): Promise<HTMLImageElement | null> {
  baseIconLoad ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = ICON_SRC;
  });
  return baseIconLoad;
}

async function applyFavicon(state: BadgeState): Promise<void> {
  if (typeof document === "undefined" || isTauri()) return;
  try {
    baseIcon ??= await loadBaseIcon();
    if (!baseIcon) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(baseIcon, 0, 0, 64, 64);
    if (state.unread) drawBadge(ctx, 64, state);
    setFaviconHref(canvas.toDataURL("image/png"));
  } catch {
    // Canvas blocked (a strict CSP, a tainted image). The title still carries it.
  }
}

function setFaviconHref(href: string): void {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-badge]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.dataset.badge = "true";
    document.head.appendChild(link);
  }
  link.href = href;
}

/** The red pill (or dot) in the bottom-right corner of a square icon. */
function drawBadge(ctx: CanvasRenderingContext2D, size: number, state: BadgeState): void {
  const label = state.mentions > 0 ? formatBadgeCount(state.mentions) : "";
  const height = label ? size * 0.46 : size * 0.34;
  ctx.font = `bold ${Math.round(height * 0.72)}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  const textWidth = label ? ctx.measureText(label).width : 0;
  const width = label ? Math.max(height, textWidth + height * 0.5) : height;
  const x = size - width;
  const y = size - height;
  const r = height / 2;

  // Punch a transparent ring out from under the pill so it reads as a separate
  // element rather than a blob sitting on the logo.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  roundedRect(ctx, x - 2, y - 2, width + 4, height + 4, r + 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = BADGE_RED;
  roundedRect(ctx, x, y, width, height, r);
  ctx.fill();

  if (label) {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + width / 2, y + height / 2 + height * 0.04);
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A standalone pill for the Windows taskbar overlay, as PNG bytes. */
async function drawOverlayPng(state: BadgeState): Promise<Uint8Array | null> {
  try {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const label = state.mentions > 0 ? formatBadgeCount(state.mentions) : "";
    ctx.fillStyle = BADGE_RED;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${label.length > 2 ? 13 : 19}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, size / 2, size / 2 + 1);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
