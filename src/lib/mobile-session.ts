"use client";

/**
 * Session-scoped "continue on the web" choice.
 *
 * In-memory only: it survives client-side navigation within a single page
 * load (Next.js keeps the layout and module state alive), but resets on a full
 * reload — which is the exact behaviour requested: pick "Continue on the web"
 * once and you're let into the web app and stop being nagged while navigating,
 * yet a hard refresh asks you again.
 */
let continueOnWebChosen = false;

export function chooseContinueOnWeb(): void {
  continueOnWebChosen = true;
}

export function hasChosenContinueOnWeb(): boolean {
  return continueOnWebChosen;
}
