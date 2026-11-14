export interface ParticipantControls {
  volume: number;
  micMuted: boolean;
  soundboardMuted: boolean;
  cameraDisabled: boolean;
}

const DEFAULT: ParticipantControls = {
  volume: 100,
  micMuted: false,
  soundboardMuted: false,
  cameraDisabled: false,
};

const STORAGE_KEY = "disband:participant-controls";

function readAll(): Record<string, ParticipantControls> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<ParticipantControls>>;
    const result: Record<string, ParticipantControls> = {};
    for (const [id, values] of Object.entries(parsed)) {
      result[id] = { ...DEFAULT, ...values };
    }
    return result;
  } catch {
    return {};
  }
}

function writeAll(values: Record<string, ParticipantControls>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    window.dispatchEvent(new CustomEvent("disband:participant-controls"));
  } catch {
    // Storage can fail in private mode; controls remain for the session.
  }
}

export function getParticipantControls(userId: string): ParticipantControls {
  return readAll()[userId] ?? DEFAULT;
}

export function setParticipantControl<K extends keyof ParticipantControls>(
  userId: string,
  key: K,
  value: ParticipantControls[K],
) {
  if (!userId) return;
  const all = readAll();
  const current = all[userId] ?? DEFAULT;
  all[userId] = { ...current, [key]: value };
  writeAll(all);
}

// --- Web Audio amplification (supports volume > 100%) -----------------------
// HTMLAudioElement.volume caps at 1.0, so anything above 100% is silent
// unless we route the element through a GainNode. We cache one gain node per
// element and reuse it across volume changes.

let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return sharedAudioContext;
}

const gainNodes = new WeakMap<HTMLAudioElement, GainNode>();

function ensureGainNode(element: HTMLAudioElement): GainNode | null {
  const existing = gainNodes.get(element);
  if (existing) return existing;
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    gainNodes.set(element, gain);
    return gain;
  } catch {
    return null;
  }
}

/*
 Up to 100% the element's own volume does it. Only a boost past 100% needs
 the audio graph, and only then is one built for the element.

 Every voice element used to be routed through a graph on arrival, even at
 100%. A live call stream played that way is unreliable across browsers (the
 gain could stop applying, or a suspended context left it silent), the
 output device chosen in settings no longer applied (that's set on the
 element, the graph plays to the default device), and in practice the
 volume slider did nothing in voice channels. An element that already has a
 graph (it was boosted earlier) keeps using it, since that can't be undone.
*/
export function applyParticipantAudioControls(element: HTMLAudioElement | null, userId: string) {
  if (!element) return;
  const controls = getParticipantControls(userId);
  const level = Math.max(0, controls.volume / 100);
  const existing = gainNodes.get(element);
  const gain = existing ?? (level > 1 ? ensureGainNode(element) : null);
  if (gain) {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") void ctx.resume();
    gain.gain.value = level;
    element.volume = 1;
  } else {
    element.volume = Math.min(1, level);
  }
  element.muted = controls.micMuted;
  element.dataset.callUser = userId;
}

export function isCameraDisabled(userId: string): boolean {
  return getParticipantControls(userId).cameraDisabled;
}

export function isSoundboardMuted(userId: string): boolean {
  return getParticipantControls(userId).soundboardMuted;
}