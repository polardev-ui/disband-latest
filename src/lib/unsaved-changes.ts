"use client";

/*
 Unsaved settings, Discord-style.

 A settings panel that holds edits until "Save Changes" marks itself dirty
 here. The settings window asks before it lets you leave that panel or close:
 with changes waiting, it doesn't go, and the unsaved-changes bar shakes and
 flashes instead, so nothing is thrown away by accident.
*/

let dirty = false;
const NUDGE = "disband:unsaved-nudge";

export function setUnsavedChanges(next: boolean): void {
  dirty = next;
}

export function hasUnsavedChanges(): boolean {
  return dirty;
}

/** True (and the bar shakes) when there are unsaved changes in the way. */
export function blockedByUnsavedChanges(): boolean {
  if (!dirty) return false;
  window.dispatchEvent(new Event(NUDGE));
  return true;
}

export function onUnsavedNudge(fn: () => void): () => void {
  window.addEventListener(NUDGE, fn);
  return () => window.removeEventListener(NUDGE, fn);
}
