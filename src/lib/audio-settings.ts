const INPUT_KEY = "disband:audio-input";
const OUTPUT_KEY = "disband:audio-output";
const VIDEO_KEY = "disband:video-input";

export function getPreferredAudioInputId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = localStorage.getItem(INPUT_KEY);
  return value || undefined;
}

export function setPreferredAudioInputId(deviceId: string) {
  if (typeof window === "undefined") return;
  if (deviceId) localStorage.setItem(INPUT_KEY, deviceId);
  else localStorage.removeItem(INPUT_KEY);
}

export function getPreferredAudioOutputId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = localStorage.getItem(OUTPUT_KEY);
  return value || undefined;
}

export function setPreferredAudioOutputId(deviceId: string) {
  if (typeof window === "undefined") return;
  if (deviceId) localStorage.setItem(OUTPUT_KEY, deviceId);
  else localStorage.removeItem(OUTPUT_KEY);
}

export function getPreferredVideoInputId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = localStorage.getItem(VIDEO_KEY);
  return value || undefined;
}

export function setPreferredVideoInputId(deviceId: string) {
  if (typeof window === "undefined") return;
  if (deviceId) localStorage.setItem(VIDEO_KEY, deviceId);
  else localStorage.removeItem(VIDEO_KEY);
}

export async function applyAudioOutputToElement(
  element: HTMLMediaElement | null | undefined,
  deviceId?: string,
) {
  if (!element || !deviceId) return;
  const sink = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof sink.setSinkId !== "function") return;
  try {
    await sink.setSinkId(deviceId);
  } catch {
    // Browser may reject sink changes until user gesture.
  }
}

export function buildAudioConstraints(): boolean | MediaTrackConstraints {
  const deviceId = getPreferredAudioInputId();
  if (!deviceId) return true;
  return { deviceId: { ideal: deviceId } };
}

export function buildVideoConstraints(plan?: string): boolean | MediaTrackConstraints {
  const deviceId = getPreferredVideoInputId();
  const resolution = plan === "super"
    ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
    : plan === "basic"
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      : { width: { ideal: 640 }, height: { ideal: 480 } };
  if (!deviceId) return resolution;
  return { ...resolution, deviceId: { ideal: deviceId } };
}
