
export type CallIndicatorKind = "dm" | "group" | "voice";

export interface CallIndicatorState {
  active: boolean;
  kind: CallIndicatorKind | null;
  label: string;
  startedAt: number | null;
  /** True only once media can actually flow (or nobody else is connected). */
  connected?: boolean;
  hangup: (() => void) | null;
  focus: (() => void) | null;
  /** Second line under "Voice Connected": the space or "Direct call". */
  sublabel?: string;
  camera?: { on: boolean; toggle: () => void } | null;
  screen?: { on: boolean; toggle: () => void } | null;
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
