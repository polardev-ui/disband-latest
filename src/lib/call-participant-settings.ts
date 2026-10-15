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

export function applyParticipantAudioControls(element: HTMLAudioElement | null, userId: string) {
  if (!element) return;
  const controls = getParticipantControls(userId);
  element.volume = Math.min(1, Math.max(0, controls.volume / 100));
  element.muted = controls.micMuted;
  element.dataset.callUser = userId;
}

export function isCameraDisabled(userId: string): boolean {
  return getParticipantControls(userId).cameraDisabled;
}

export function isSoundboardMuted(userId: string): boolean {
  return getParticipantControls(userId).soundboardMuted;
}
