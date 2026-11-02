"use client";

import type { SubscriptionPlan } from "@/lib/subscription";

export const RESOLUTIONS = [480, 720, 1080, 1440, 2160] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const FRAME_RATES = [15, 30, 60, 120] as const;
export type FrameRate = (typeof FRAME_RATES)[number];

/** "source" is the screen's own size, unscaled (Aero). */
export type StreamResolution = Resolution | "source";

export interface StreamQuality {
  resolution: StreamResolution;
  fps: FrameRate;
}

const CAPS: Record<SubscriptionPlan, { max: StreamQuality; default: StreamQuality }> = {
  free: { max: { resolution: 720, fps: 30 }, default: { resolution: 720, fps: 30 } },
  lite: { max: { resolution: 1080, fps: 60 }, default: { resolution: 720, fps: 30 } },
  aero: { max: { resolution: 2160, fps: 120 }, default: { resolution: 1080, fps: 60 } },
};

export function maxQuality(plan: SubscriptionPlan): StreamQuality {
  return CAPS[plan]?.max ?? CAPS.free.max;
}

export function defaultQuality(plan: SubscriptionPlan): StreamQuality {
  return CAPS[plan]?.default ?? CAPS.free.default;
}

export function allowedResolutions(plan: SubscriptionPlan): StreamResolution[] {
  const max = maxQuality(plan).resolution;
  const fixed: StreamResolution[] = RESOLUTIONS.filter((r) => r <= (max as number));
  return max === 2160 ? [...fixed, "source"] : fixed;
}

export function allowedFrameRates(plan: SubscriptionPlan): FrameRate[] {
  const max = maxQuality(plan).fps;
  return FRAME_RATES.filter((f) => f <= max);
}

export function widthFor(resolution: Resolution): number {
  return Math.round((resolution * 16) / 9 / 2) * 2;
}

export function resolutionLabel(r: StreamResolution): string {
  if (r === "source") return "Source";
  return r === 2160 ? "4K" : `${r}p`;
}

const KEY = "disband:stream-quality";

export function getStreamQuality(plan: SubscriptionPlan): StreamQuality {
  const cap = maxQuality(plan);
  let chosen: StreamQuality | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StreamQuality>;
      if ((typeof parsed.resolution === "number" || parsed.resolution === "source") && typeof parsed.fps === "number") {
        chosen = { resolution: parsed.resolution as StreamResolution, fps: parsed.fps as FrameRate };
      }
    }
  } catch {

  }
  if (!chosen) return defaultQuality(plan);
  const resolution = chosen.resolution === "source"
    ? (allowedResolutions(plan).includes("source") ? "source" : cap.resolution)
    : Math.min(chosen.resolution, cap.resolution as number) as Resolution;
  return { resolution, fps: Math.min(chosen.fps, cap.fps) as FrameRate };
}

export function setStreamQuality(q: StreamQuality): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {

  }
}

function videoConstraints(q: StreamQuality): MediaTrackConstraints {
  if (q.resolution === "source") return { frameRate: { ideal: q.fps } };
  return {
    width: { ideal: widthFor(q.resolution) },
    height: { ideal: q.resolution },
    frameRate: { ideal: q.fps },
  };
}

export function buildScreenConstraints(plan: SubscriptionPlan): MediaStreamConstraints {
  const q = getStreamQuality(plan);
  return {
    video: videoConstraints(q),
    // Share the tab/system sound too. Processing is off: echo cancellation
    // and noise suppression are tuned for voice and mangle music and games.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    // Chromium extensions to the spec: offer "share system audio" in the
    // picker, and keep the sharer hearing their own tab.
    ...({ systemAudio: "include", suppressLocalAudioPlayback: false } as object),
  };
}

/*
 Without a bitrate, WebRTC sends video at its default ceiling of about
 2.5 Mbps and scales a share down to fit: whatever was picked came out near
 720p at 30fps. Each sender of the share now gets a ceiling sized to the
 chosen quality, and a hint of what to keep when bandwidth runs short
 (sharpness for slow, detailed shares; smoothness at 60fps and up).
*/

/** Bits per second for a share at this quality. */
export function bitrateFor(q: StreamQuality): number {
  const pixels = q.resolution === "source" ? 3840 * 2160 : widthFor(q.resolution) * q.resolution;
  return Math.round(Math.min(30_000_000, Math.max(2_500_000, pixels * q.fps * 0.075)));
}

async function tuneSender(sender: RTCRtpSender, q: StreamQuality) {
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = bitrateFor(q);
    params.encodings[0].maxFramerate = q.fps;
    params.degradationPreference = q.fps >= 60 ? "maintain-framerate" : "maintain-resolution";
    await sender.setParameters(params);
  } catch {
    // Not negotiated yet; the next tune (when it connects) applies it.
  }
}

interface ActiveScreenShare {
  track: MediaStreamTrack;
  plan: SubscriptionPlan;
  /** Every connection the share may be sent on. */
  connections: () => (RTCPeerConnection | null | undefined)[];
}

let activeShare: ActiveScreenShare | null = null;
const listeners = new Set<() => void>();

/** The share in progress, so the quality menu can change it live. */
export function setActiveScreenShare(share: ActiveScreenShare | null) {
  activeShare = share;
  listeners.forEach((l) => l());
  if (share) void tuneActiveScreenShare();
}

export function clearActiveScreenShare(track: MediaStreamTrack | null) {
  if (activeShare && (!track || activeShare.track === track)) setActiveScreenShare(null);
}

export function subscribeScreenShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-applies the bitrate and frame rate to every sender of the share, e.g. after a new peer connects. */
export async function tuneActiveScreenShare() {
  const share = activeShare;
  if (!share) return;
  if (share.track.readyState === "ended") {
    setActiveScreenShare(null);
    return;
  }
  const q = getStreamQuality(share.plan);
  try { share.track.contentHint = q.fps >= 60 ? "motion" : "detail"; } catch { }
  const senders = share.connections()
    .flatMap((pc) => (pc && pc.connectionState !== "closed" ? pc.getSenders() : []))
    .filter((s) => s.track === share.track);
  await Promise.all(senders.map((s) => tuneSender(s, q)));
}

/** Saves a new quality and applies it to the share in progress, if any. */
export async function applyStreamQuality(q: StreamQuality) {
  setStreamQuality(q);
  listeners.forEach((l) => l());
  const share = activeShare;
  if (!share) return;
  try {
    await share.track.applyConstraints(videoConstraints(getStreamQuality(share.plan)));
  } catch {
    // Some capturers refuse a live change; the bitrate still applies.
  }
  await tuneActiveScreenShare();
}
