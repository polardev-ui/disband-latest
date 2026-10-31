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

export function buildAudioConstraints(): MediaTrackConstraints {
  const deviceId = getPreferredAudioInputId();
  // Echo cancellation stays on in every mode: without it speakers feed back
  // into the call. Gain control is on unless turned off in Voice & Video;
  // the input volume slider (VoiceMixer) is the manual alternative.
  // The browser's own suppressor only runs in Standard; the AI filter does
  // the work in AI mode and stacking both muffles voices.
  return {
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    echoCancellation: true,
    autoGainControl: getAutoGainControl(),
    noiseSuppression: getNoiseSuppressionMode() === "standard",
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
  };
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
export const NOISE_MODE_KEY = "disband:noise-suppression-mode";

/** "ai" is the on-device neural filter (Krisp-style); "standard" is the
 *  browser's built-in suppressor. */
export type NoiseSuppressionMode = "off" | "standard" | "ai";

export function getNoiseSuppressionMode(): NoiseSuppressionMode {
  if (typeof window === "undefined") return "ai";
  try {
    const value = localStorage.getItem(NOISE_MODE_KEY);
    if (value === "ai" || value === "standard" || value === "off") return value;
    // "enhanced" was the old name for the strongest option.
    if (value === "enhanced") return "ai";
    // Back-compat with the old boolean toggle.
    const legacy = localStorage.getItem(NOISE_CANCELLATION_KEY);
    if (legacy === "true") return "standard";
    if (legacy === "false") return "off";
  } catch {
    // Storage blocked: fall through to the default.
  }
  return "ai";
}

export function setNoiseSuppressionMode(mode: NoiseSuppressionMode) {
  try {
    localStorage.setItem(NOISE_MODE_KEY, mode);
    localStorage.setItem(NOISE_CANCELLATION_KEY, mode !== "off" ? "true" : "false");
  } catch {
    // Ignore storage errors.
  }
}

const INPUT_VOLUME_KEY = "disband:input-volume";
const AUTO_GAIN_KEY = "disband:auto-gain-control";

export const MAX_INPUT_VOLUME = 200;

/** Microphone volume, 0–200 (%), applied in VoiceMixer before sending. */
export function getInputVolume(): number {
  if (typeof window === "undefined") return 100;
  try {
    const value = Number(localStorage.getItem(INPUT_VOLUME_KEY));
    if (localStorage.getItem(INPUT_VOLUME_KEY) !== null && Number.isFinite(value)) {
      return Math.min(MAX_INPUT_VOLUME, Math.max(0, value));
    }
  } catch {
    // Storage blocked: fall through to the default.
  }
  return 100;
}

export function setInputVolume(volume: number) {
  try {
    localStorage.setItem(INPUT_VOLUME_KEY, String(Math.round(Math.min(MAX_INPUT_VOLUME, Math.max(0, volume)))));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * The browser's automatic gain control. On Windows, Chromium (and so the
 * desktop app's WebView2) does it partly by moving the system microphone
 * level, which can leave a mic far too quiet; turning it off keeps the level
 * where it's set and leaves loudness to the input volume slider.
 */
export function getAutoGainControl(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(AUTO_GAIN_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoGainControl(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_GAIN_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage errors.
  }
}
