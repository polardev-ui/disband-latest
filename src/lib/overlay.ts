"use client";

// Central overlay scale for the web UI revamp. Previously every overlay
// hardcoded its own z-index (tooltip z-200 above lightbox z-150, flat modal
// tier, unportalled context menu), so nested layers collided. New layers must
// use these values; remaining call sites migrate in the overlay-theming patch.
export const OVERLAY_Z = {
  tooltip: 40,
  modal: 50,
  call: 60,
  modalNested: 70,
  contextMenu: 95,
  lightbox: 90,
  system: 100,
} as const;

// Escape stack: only the topmost overlay closes on Escape. Without this,
// nested layers (e.g. crop modal over settings) both close on one press.
const escapeStack: Array<() => void> = [];

export function pushEscapeHandler(close: () => void): () => void {
  escapeStack.push(close);
  return () => {
    const i = escapeStack.lastIndexOf(close);
    if (i >= 0) escapeStack.splice(i, 1);
  };
}

// Marker so only one overlay answers a single Escape press. Every overlay
// registers its own window keydown listener, and listeners on the same target
// all fire for one event (stopPropagation can't stop them), so without this
// flag the second listener would pop and close the next layer down too.
const ESCAPE_HANDLED = "__disbandOverlayEscapeHandled";

export function handleTopmostEscape(e: KeyboardEvent): boolean {
  if (e.key !== "Escape" || escapeStack.length === 0) return false;
  const evt = e as KeyboardEvent & { [ESCAPE_HANDLED]?: boolean };
  if (evt[ESCAPE_HANDLED]) return true;
  evt[ESCAPE_HANDLED] = true;
  e.stopPropagation();
  escapeStack[escapeStack.length - 1]();
  return true;
}

// Reference-counted body scroll lock so stacked modals don't unlock early
// when an inner layer closes (only the lightbox locked scroll before).
let lockCount = 0;

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  lockCount += 1;
  if (lockCount === 1) {
    document.body.dataset.overlayLock = "true";
    document.body.style.overflow = "hidden";
  }
  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && typeof document !== "undefined") {
      delete document.body.dataset.overlayLock;
      document.body.style.overflow = "";
    }
  };
}
