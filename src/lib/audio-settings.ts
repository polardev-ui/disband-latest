import { normalizePlan } from "@/lib/subscription";

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

  }
}

export function buildAudioConstraints(): boolean | MediaTrackConstraints {
  const deviceId = getPreferredAudioInputId();
  const cancellation = isNoiseCancellationEnabled();
  const strength = getNoiseCancellationStrength();
  // Treat very low strength as "off" so the browser's aggressive
  // suppression doesn't chop quiet voices.
  const effective = cancellation && strength >= 20;
  const constraints: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    echoCancellation: effective,
    noiseSuppression: effective,
    // Automatic gain control frequently pumps and adds perceived lag /
    // stutter. Noise suppression is handled natively by the browser when
    // enabled; Web Audio only fine-tunes the captured signal.
    autoGainControl: false,
  };
  if (!deviceId && !cancellation) return true;
  return constraints;
}

export function buildVideoConstraints(plan?: string): boolean | MediaTrackConstraints {
  const deviceId = getPreferredVideoInputId();
  const resolution = videoTierConstraints(plan);
  if (!deviceId) return resolution;
  return { ...resolution, deviceId: { ideal: deviceId } };
}

export function buildVideoFallbackConstraints(plan?: string): MediaTrackConstraints {
  return { facingMode: "user", ...videoTierConstraints(plan) };
}

function videoTierConstraints(plan?: string): MediaTrackConstraints {

  return normalizePlan(plan) === "aero"
    ? { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 120 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
}

export const NOISE_CANCELLATION_KEY = "disband:noise-cancellation-enabled";
export const NOISE_CANCELLATION_STRENGTH_KEY = "disband:noise-cancellation-strength";

export function isNoiseCancellationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const value = localStorage.getItem(NOISE_CANCELLATION_KEY);
  // Default off: the browser's built-in suppression is aggressive and
  // chops voices. Users can opt in from Settings.
  return value === "true";
}

export function setNoiseCancellationEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOISE_CANCELLATION_KEY, String(enabled));
}

export function getNoiseCancellationStrength(): number {
  if (typeof window === "undefined") return 50;
  const value = Number(localStorage.getItem(NOISE_CANCELLATION_STRENGTH_KEY));
  if (Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export function setNoiseCancellationStrength(strength: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOISE_CANCELLATION_STRENGTH_KEY, String(Math.min(100, Math.max(0, strength))));
}

