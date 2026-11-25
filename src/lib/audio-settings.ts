import { normalizePlan } from "@/lib/subscription";

/*
 Voice & Video settings.

 Everything lives in localStorage so it applies before sign-in finishes and
 works offline. The portable settings (everything except which device to
 use) are also mirrored to the account by voice-settings-sync.ts, so the web
 app and the desktop app share them. Device IDs differ per machine and per
 browser, so they never leave this one.

 Every write goes through writeSetting(), which fires VOICE_SETTINGS_EVENT:
 the live call's mixer, the settings page and the account sync all listen
 for it.
*/

export const VOICE_SETTINGS_EVENT = "disband:voice-settings";

export type VoiceSettingsEventDetail = { key: string; source: "local" | "remote" };

const INPUT_KEY = "disband:audio-input";
const OUTPUT_KEY = "disband:audio-output";
const VIDEO_KEY = "disband:video-input";

export const NOISE_CANCELLATION_KEY = "disband:noise-cancellation-enabled";
export const NOISE_MODE_KEY = "disband:noise-suppression-mode";
const INPUT_VOLUME_KEY = "disband:input-volume";
const OUTPUT_VOLUME_KEY = "disband:output-volume";
const AUTO_GAIN_KEY = "disband:auto-gain-control";
const ECHO_CANCELLATION_KEY = "disband:echo-cancellation";
const INPUT_PROFILE_KEY = "disband:input-profile";
const AUTO_SENSITIVITY_KEY = "disband:auto-sensitivity";
const SENSITIVITY_KEY = "disband:input-sensitivity";
const INPUT_MODE_KEY = "disband:input-mode";
const PTT_KEY_KEY = "disband:ptt-key";
const PTT_RELEASE_KEY = "disband:ptt-release-ms";
const ALWAYS_PREVIEW_VIDEO_KEY = "disband:always-preview-video";
const MIRROR_VIDEO_KEY = "disband:mirror-own-video";
const STREAM_PREVIEWS_KEY = "disband:show-stream-previews";
const SOUNDBOARD_VOLUME_KEY = "disband:soundboard-volume";
const SOUND_PREFIX = "disband:sound:";

/** Settings that follow the account between devices. Device IDs stay put. */
export const PORTABLE_VOICE_KEYS = [
  NOISE_MODE_KEY,
  INPUT_VOLUME_KEY,
  OUTPUT_VOLUME_KEY,
  AUTO_GAIN_KEY,
  ECHO_CANCELLATION_KEY,
  INPUT_PROFILE_KEY,
  AUTO_SENSITIVITY_KEY,
  SENSITIVITY_KEY,
  INPUT_MODE_KEY,
  PTT_KEY_KEY,
  PTT_RELEASE_KEY,
  ALWAYS_PREVIEW_VIDEO_KEY,
  MIRROR_VIDEO_KEY,
  STREAM_PREVIEWS_KEY,
  SOUNDBOARD_VOLUME_KEY,
] as const;

export function isPortableVoiceKey(key: string): boolean {
  return (PORTABLE_VOICE_KEYS as readonly string[]).includes(key) || key.startsWith(SOUND_PREFIX);
}

function readSetting(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes one setting and tells everyone listening. `null` removes it. */
export function writeSetting(key: string, value: string | null, source: "local" | "remote" = "local") {
  if (typeof window === "undefined") return;
  try {
    if (value === null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts until the page closes at most.
  }
  try {
    window.dispatchEvent(new CustomEvent<VoiceSettingsEventDetail>(VOICE_SETTINGS_EVENT, { detail: { key, source } }));
  } catch {
    // Very old browsers: nothing is listening anyway.
  }
}

function readBool(key: string, fallback: boolean): boolean {
  const value = readSetting(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = readSetting(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Every portable setting, as stored, for the account sync. */
export function snapshotPortableVoiceSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === "undefined") return out;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isPortableVoiceKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = value;
    }
  } catch {
    // Storage blocked: nothing to share.
  }
  return out;
}

/** Puts every portable setting back to its default. Devices are kept. */
export function resetVoiceSettings() {
  const keys = Object.keys(snapshotPortableVoiceSettings());
  for (const key of [...keys, NOISE_CANCELLATION_KEY]) writeSetting(key, null);
  // One event at the end is enough for listeners that re-read everything.
  writeSetting(INPUT_PROFILE_KEY, null);
}

// ---------------------------------------------------------------------------
// Devices (this machine only)

export function getPreferredAudioInputId(): string | undefined {
  return readSetting(INPUT_KEY) || undefined;
}

export function setPreferredAudioInputId(deviceId: string) {
  writeSetting(INPUT_KEY, deviceId || null);
}

export function getPreferredAudioOutputId(): string | undefined {
  return readSetting(OUTPUT_KEY) || undefined;
}

export function setPreferredAudioOutputId(deviceId: string) {
  writeSetting(OUTPUT_KEY, deviceId || null);
}

export function getPreferredVideoInputId(): string | undefined {
  return readSetting(VIDEO_KEY) || undefined;
}

export function setPreferredVideoInputId(deviceId: string) {
  writeSetting(VIDEO_KEY, deviceId || null);
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
    // The device went away; the element keeps playing on the default.
  }
}

// ---------------------------------------------------------------------------
// Constraints

/** Mic constraints. `deviceId` overrides the saved choice ("" = system default). */
export function buildAudioConstraints(deviceId: string | undefined = getPreferredAudioInputId()): MediaTrackConstraints {
  const processing = getVoiceProcessing();
  // Echo cancellation is on unless turned off (headphones only: without it
  // speakers feed back into the call). The browser's own suppressor only runs
  // in Standard; the AI filter does the work in AI mode and stacking both
  // muffles voices.
  //
  // The device is asked for as `ideal`, never `exact`: a saved ID goes stale
  // when a headset is unplugged or the desktop app's WebKit store resets,
  // and `exact` then fails the whole call instead of using another mic.
  return {
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    echoCancellation: processing.echoCancellation,
    autoGainControl: processing.autoGainControl,
    noiseSuppression: processing.noiseMode === "standard",
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

// ---------------------------------------------------------------------------
// Input profile

/**
 * "isolation" keeps only your voice (AI filter, echo cancellation, gain
 * control, automatic sensitivity). "studio" sends the mic untouched with an
 * open gate. "custom" uses each setting below as set.
 */
export type InputProfile = "isolation" | "studio" | "custom";

export function getInputProfile(): InputProfile {
  const value = readSetting(INPUT_PROFILE_KEY);
  if (value === "isolation" || value === "studio" || value === "custom") return value;
  // Everyone who set things up before profiles existed keeps their setup.
  return "custom";
}

export function setInputProfile(profile: InputProfile) {
  writeSetting(INPUT_PROFILE_KEY, profile);
}

/** "ai" is the on-device neural filter; "standard" is the browser's own. */
export type NoiseSuppressionMode = "off" | "standard" | "ai";

export function getNoiseSuppressionMode(): NoiseSuppressionMode {
  const value = readSetting(NOISE_MODE_KEY);
  if (value === "ai" || value === "standard" || value === "off") return value;
  // "enhanced" was the old name for the strongest option.
  if (value === "enhanced") return "ai";
  // Back-compat with the old boolean toggle.
  const legacy = readSetting(NOISE_CANCELLATION_KEY);
  if (legacy === "true") return "standard";
  if (legacy === "false") return "off";
  // The AI filter is opt-in: on slower machines its model can't keep up with
  // the audio clock, which comes out as crackle and static for everyone in
  // the call. The browser's suppressor is cheap and steady.
  return "standard";
}

export function setNoiseSuppressionMode(mode: NoiseSuppressionMode) {
  writeSetting(NOISE_CANCELLATION_KEY, mode !== "off" ? "true" : "false");
  writeSetting(NOISE_MODE_KEY, mode);
}

export const MAX_INPUT_VOLUME = 200;

/** Microphone volume, 0–200 (%), applied in VoiceMixer before sending. */
export function getInputVolume(): number {
  return readNumber(INPUT_VOLUME_KEY, 100, 0, MAX_INPUT_VOLUME);
}

export function setInputVolume(volume: number) {
  writeSetting(INPUT_VOLUME_KEY, String(Math.round(Math.min(MAX_INPUT_VOLUME, Math.max(0, volume)))));
}

export const MAX_OUTPUT_VOLUME = 100;

/** How loud everyone in a call is for you, 0–100 (%). */
export function getOutputVolume(): number {
  return readNumber(OUTPUT_VOLUME_KEY, 100, 0, MAX_OUTPUT_VOLUME);
}

export function setOutputVolume(volume: number) {
  writeSetting(OUTPUT_VOLUME_KEY, String(Math.round(Math.min(MAX_OUTPUT_VOLUME, Math.max(0, volume)))));
}

/**
 * The browser's automatic gain control. On Windows, Chromium (and so the
 * desktop app's WebView2) does it partly by moving the system microphone
 * level, which can leave a mic far too quiet; turning it off keeps the level
 * where it's set and leaves loudness to the input volume slider.
 */
export function getAutoGainControl(): boolean {
  return readBool(AUTO_GAIN_KEY, true);
}

export function setAutoGainControl(enabled: boolean) {
  writeSetting(AUTO_GAIN_KEY, enabled ? "true" : "false");
}

/**
 * Echo cancellation. On macOS, Safari and the desktop app (WebKit) do it with
 * Apple's voice processing, which also gates and levels the mic on its own
 * whatever the gain and noise settings say: talking over someone, or quietly,
 * cuts you out. With headphones it can be turned off, which turns all of that
 * off too.
 */
export function getEchoCancellation(): boolean {
  return readBool(ECHO_CANCELLATION_KEY, true);
}

export function setEchoCancellation(enabled: boolean) {
  writeSetting(ECHO_CANCELLATION_KEY, enabled ? "true" : "false");
}

// ---------------------------------------------------------------------------
// Input sensitivity and push to talk

/** Sensitivity is a level in dBFS: sound quieter than this isn't sent. */
export const SENSITIVITY_MIN_DB = -100;
export const SENSITIVITY_MAX_DB = 0;
const DEFAULT_SENSITIVITY_DB = -55;

/** On by default: the gate follows the room's noise floor by itself. */
export function getAutoSensitivity(): boolean {
  return readBool(AUTO_SENSITIVITY_KEY, true);
}

export function setAutoSensitivity(enabled: boolean) {
  writeSetting(AUTO_SENSITIVITY_KEY, enabled ? "true" : "false");
}

export function getInputSensitivity(): number {
  return readNumber(SENSITIVITY_KEY, DEFAULT_SENSITIVITY_DB, SENSITIVITY_MIN_DB, SENSITIVITY_MAX_DB);
}

export function setInputSensitivity(db: number) {
  writeSetting(SENSITIVITY_KEY, String(Math.round(Math.min(SENSITIVITY_MAX_DB, Math.max(SENSITIVITY_MIN_DB, db)))));
}

export type InputMode = "voice" | "ptt";

export function getInputMode(): InputMode {
  return readSetting(INPUT_MODE_KEY) === "ptt" ? "ptt" : "voice";
}

export function setInputMode(mode: InputMode) {
  writeSetting(INPUT_MODE_KEY, mode);
}

/** A KeyboardEvent.code, e.g. "Backquote". */
export function getPushToTalkKey(): string {
  return readSetting(PTT_KEY_KEY) || "Backquote";
}

export function setPushToTalkKey(code: string) {
  writeSetting(PTT_KEY_KEY, code);
}

export const MAX_PTT_RELEASE_MS = 2000;

export function getPushToTalkReleaseDelay(): number {
  return readNumber(PTT_RELEASE_KEY, 20, 0, MAX_PTT_RELEASE_MS);
}

export function setPushToTalkReleaseDelay(ms: number) {
  writeSetting(PTT_RELEASE_KEY, String(Math.round(Math.min(MAX_PTT_RELEASE_MS, Math.max(0, ms)))));
}

export type GateMode = "off" | "auto" | "manual" | "ptt";

export interface VoiceProcessing {
  noiseMode: NoiseSuppressionMode;
  echoCancellation: boolean;
  autoGainControl: boolean;
  gate: GateMode;
  thresholdDb: number;
}

/** What the mic pipeline should do right now, after the input profile. */
export function getVoiceProcessing(): VoiceProcessing {
  const profile = getInputProfile();
  const ptt = getInputMode() === "ptt";
  const thresholdDb = getInputSensitivity();
  if (profile === "isolation") {
    return { noiseMode: "ai", echoCancellation: true, autoGainControl: true, gate: ptt ? "ptt" : "auto", thresholdDb };
  }
  if (profile === "studio") {
    return { noiseMode: "off", echoCancellation: false, autoGainControl: false, gate: ptt ? "ptt" : "off", thresholdDb };
  }
  return {
    noiseMode: getNoiseSuppressionMode(),
    echoCancellation: getEchoCancellation(),
    autoGainControl: getAutoGainControl(),
    gate: ptt ? "ptt" : getAutoSensitivity() ? "auto" : "manual",
    thresholdDb,
  };
}

// ---------------------------------------------------------------------------
// Camera, streaming and soundboard

export function getAlwaysPreviewVideo(): boolean {
  return readBool(ALWAYS_PREVIEW_VIDEO_KEY, false);
}

export function setAlwaysPreviewVideo(enabled: boolean) {
  writeSetting(ALWAYS_PREVIEW_VIDEO_KEY, enabled ? "true" : "false");
}

/** Your own camera tile shows mirrored, like a mirror. Others see it unflipped. */
export function getMirrorOwnVideo(): boolean {
  return readBool(MIRROR_VIDEO_KEY, true);
}

export function setMirrorOwnVideo(enabled: boolean) {
  writeSetting(MIRROR_VIDEO_KEY, enabled ? "true" : "false");
}

export function getShowStreamPreviews(): boolean {
  return readBool(STREAM_PREVIEWS_KEY, true);
}

export function setShowStreamPreviews(enabled: boolean) {
  writeSetting(STREAM_PREVIEWS_KEY, enabled ? "true" : "false");
}

/** Soundboard clips you hear, 0–100 (%). */
export function getSoundboardVolume(): number {
  return readNumber(SOUNDBOARD_VOLUME_KEY, 100, 0, 100);
}

export function setSoundboardVolume(volume: number) {
  writeSetting(SOUNDBOARD_VOLUME_KEY, String(Math.round(Math.min(100, Math.max(0, volume)))));
}

// ---------------------------------------------------------------------------
// Sounds

export type AppSound = "callJoin" | "callLeave" | "callConnected" | "callEnd" | "updateReady";

export function isAppSoundEnabled(sound: AppSound): boolean {
  return readBool(SOUND_PREFIX + sound, true);
}

export function setAppSoundEnabled(sound: AppSound, enabled: boolean) {
  writeSetting(SOUND_PREFIX + sound, enabled ? null : "false");
}

/** Safari or the macOS desktop app, where voice processing is Apple's. */
export function isAppleWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Macintosh|Mac OS X/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
}
