import { VOICE_SETTINGS_EVENT, getOutputVolume, getPreferredAudioOutputId, type VoiceSettingsEventDetail } from "@/lib/audio-settings";
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

// --- Playback level (supports volume > 100%) --------------------------------
/*
 HTMLMediaElement.volume caps at 1.0. Up to 100% the element's own volume
 does it, which keeps the output device chosen in settings and needs no audio
 graph. Past 100% the element's stream is boosted through Web Audio.

 The boost used to be built with createMediaElementSource on the element.
 For an element playing a live call stream (srcObject), Chromium (Chrome,
 Edge, the Windows desktop app) gives that node silence or ignores the
 gain, so dragging past 100% made someone quieter or cut them out, and the
 graph could never be undone. Now the boost reads the stream itself
 (createMediaStreamSource), the element keeps playing at volume 0 (Chromium
 only delivers remote call audio to Web Audio while a media element plays
 it), and the graph is torn down again when the level comes back to 100% or
 less. The element's `muted` stays the single mute switch: deafen and
 per-person mute set it, and the boost follows it.
*/

let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedAudioContext = new Ctor();
    } catch {
      return null;
    }
    const ctx = sharedAudioContext;
    // Browsers start a context made outside a click suspended; a boost
    // played into it is silence. Resume on the next interaction.
    const resume = () => { if (ctx.state !== "running") void ctx.resume().catch(() => {}); };
    for (const type of ["pointerdown", "keydown", "touchend"]) {
      window.addEventListener(type, resume, { capture: true, passive: true });
    }
    ctx.addEventListener("statechange", resume);
  }
  return sharedAudioContext;
}

interface Boost {
  stream: MediaStream;
  trackIds: string;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  level: number;
  onVolumeChange: () => void;
}

const boosts = new WeakMap<HTMLMediaElement, Boost>();

function trackKey(stream: MediaStream): string {
  return stream.getAudioTracks().map((t) => t.id).sort().join(",");
}

function syncBoostMute(element: HTMLMediaElement, boost: Boost) {
  const target = element.muted ? 0 : boost.level;
  boost.gain.gain.value = target;
  // Something else (an older caller) may have turned the element back up;
  // keep it silent so the stream isn't heard twice.
  if (element.volume !== 0) element.volume = 0;
}

function removeBoost(element: HTMLMediaElement) {
  const boost = boosts.get(element);
  if (!boost) return;
  boosts.delete(element);
  element.removeEventListener("volumechange", boost.onVolumeChange);
  try { boost.source.disconnect(); } catch { }
  try { boost.gain.disconnect(); } catch { }
}

async function routeContextToOutput(ctx: AudioContext) {
  const deviceId = getPreferredAudioOutputId();
  const sink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
  if (!deviceId || typeof sink.setSinkId !== "function" || sink.sinkId === deviceId) return;
  try { await sink.setSinkId(deviceId); } catch { }
}

function applyBoost(element: HTMLMediaElement, level: number): boolean {
  const stream = element.srcObject instanceof MediaStream ? element.srcObject : null;
  if (!stream || stream.getAudioTracks().length === 0) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;
  let boost = boosts.get(element);
  if (boost && (boost.stream !== stream || boost.trackIds !== trackKey(stream))) {
    removeBoost(element);
    boost = undefined;
  }
  if (!boost) {
    try {
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      const created: Boost = { stream, trackIds: trackKey(stream), source, gain, level, onVolumeChange: () => {} };
      created.onVolumeChange = () => syncBoostMute(element, created);
      element.addEventListener("volumechange", created.onVolumeChange);
      boosts.set(element, created);
      boost = created;
    } catch {
      return false;
    }
  }
  boost.level = level;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  void routeContextToOutput(ctx);
  syncBoostMute(element, boost);
  return true;
}

/**
 * Plays `element` at `level` (1 = 100%, up to 2 = 200%). `muted` is the
 * element's own mute and is left to the caller.
 */
export function setElementPlaybackLevel(element: HTMLMediaElement, level: number) {
  const safe = Number.isFinite(level) ? Math.max(0, Math.min(level, 4)) : 1;
  if (safe > 1 && applyBoost(element, safe)) return;
  removeBoost(element);
  element.volume = Math.min(1, safe);
}

export function applyParticipantAudioControls(element: HTMLAudioElement | null, userId: string) {
  if (!element) return;
  const controls = getParticipantControls(userId);
  // Their own volume, scaled by the speaker volume in Voice & Video.
  const level = Math.max(0, (controls.volume / 100) * (getOutputVolume() / 100));
  element.dataset.callUser = userId;
  element.muted = controls.micMuted;
  setElementPlaybackLevel(element, level);
}

export function isCameraDisabled(userId: string): boolean {
  return getParticipantControls(userId).cameraDisabled;
}

export function isSoundboardMuted(userId: string): boolean {
  return getParticipantControls(userId).soundboardMuted;
}
// A new speaker volume applies to everyone already playing.
if (typeof window !== "undefined") {
  window.addEventListener(VOICE_SETTINGS_EVENT, (event) => {
    const key = (event as CustomEvent<VoiceSettingsEventDetail>).detail?.key;
    if (key === "disband:audio-output" && sharedAudioContext) void routeContextToOutput(sharedAudioContext);
    if (key !== "disband:output-volume") return;
    document.querySelectorAll<HTMLAudioElement>("audio[data-call-user]").forEach((el) => {
      const uid = el.dataset.callUser;
      if (uid) applyParticipantAudioControls(el, uid);
    });
  });
}
