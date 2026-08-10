/**
 * Tiny module-level store describing the current call, so the persistent
 * in-call indicator (above the user panel) can be rendered from anywhere
 * without prop-drilling through every sidebar.
 */
export type CallIndicatorKind = "dm" | "group" | "voice";

export interface CallIndicatorState {
  active: boolean;
  kind: CallIndicatorKind | null;
  label: string;
  startedAt: number | null;
  hangup: (() => void) | null;
  focus: (() => void) | null;
}

const defaultState: CallIndicatorState = {
  active: false,
  kind: null,
  label: "",
  startedAt: null,
  hangup: null,
  focus: null,
};

let state: CallIndicatorState = defaultState;
const listeners = new Set<() => void>();

export function getCallIndicatorState(): CallIndicatorState {
  return state;
}

export function setCallIndicatorState(next: CallIndicatorState) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeCallIndicator(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
