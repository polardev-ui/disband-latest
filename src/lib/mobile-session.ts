"use client";

let continueOnWebChosen = false;

export function chooseContinueOnWeb(): void {
  continueOnWebChosen = true;
}

export function hasChosenContinueOnWeb(): boolean {
  return continueOnWebChosen;
}
