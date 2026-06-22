const INPUT_KEY = "disband:audio-input";
const OUTPUT_KEY = "disband:audio-output";

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

export function buildVideoConstraints(): boolean | MediaTrackConstraints {
  return { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } };
}
