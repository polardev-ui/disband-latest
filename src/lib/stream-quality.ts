"use client";

import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * Screen share quality.
 *
 * Sharing itself is free on every plan — what you pay for is how much of it
 * gets sent. Everyone can share at 720p30, which is legible for code and
 * slides; paying raises the ceiling rather than unlocking the feature, so a
 * free account is never stopped from showing someone their screen.
 */

export const RESOLUTIONS = [480, 720, 1080, 1440, 2160] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const FRAME_RATES = [15, 30, 60, 120] as const;
export type FrameRate = (typeof FRAME_RATES)[number];

export interface StreamQuality {
  resolution: Resolution;
  fps: FrameRate;
}

/** The most a plan may send, and what it sends unless told otherwise. */
const CAPS: Record<SubscriptionPlan, { max: StreamQuality; default: StreamQuality }> = {
  free: { max: { resolution: 720, fps: 30 }, default: { resolution: 720, fps: 30 } },
  basic: { max: { resolution: 1080, fps: 60 }, default: { resolution: 1080, fps: 60 } },
  super: { max: { resolution: 2160, fps: 120 }, default: { resolution: 1080, fps: 60 } },
};

export function maxQuality(plan: SubscriptionPlan): StreamQuality {
  return CAPS[plan]?.max ?? CAPS.free.max;
}

export function defaultQuality(plan: SubscriptionPlan): StreamQuality {
  return CAPS[plan]?.default ?? CAPS.free.default;
}

export function allowedResolutions(plan: SubscriptionPlan): Resolution[] {
  const max = maxQuality(plan).resolution;
  return RESOLUTIONS.filter((r) => r <= max);
}

export function allowedFrameRates(plan: SubscriptionPlan): FrameRate[] {
  const max = maxQuality(plan).fps;
  return FRAME_RATES.filter((f) => f <= max);
}

/** Height is what people pick; width follows at 16:9. */
export function widthFor(resolution: Resolution): number {
  return Math.round((resolution * 16) / 9 / 2) * 2;
}

export function resolutionLabel(r: Resolution): string {
  return r === 2160 ? "4K" : `${r}p`;
}

const KEY = "disband:stream-quality";

/**
 * The chosen quality, clamped to what the plan allows.
 *
 * Clamping on read rather than on write matters: a Super subscriber who picks
 * 4K and then lapses would otherwise keep streaming 4K from a stored setting
 * nobody re-checks.
 */
export function getStreamQuality(plan: SubscriptionPlan): StreamQuality {
  const cap = maxQuality(plan);
  let chosen: StreamQuality | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StreamQuality>;
      if (typeof parsed.resolution === "number" && typeof parsed.fps === "number") {
        chosen = { resolution: parsed.resolution as Resolution, fps: parsed.fps as FrameRate };
      }
    }
  } catch {
    // Unreadable storage just means the plan's default.
  }
  if (!chosen) return defaultQuality(plan);
  return {
    resolution: Math.min(chosen.resolution, cap.resolution) as Resolution,
    fps: Math.min(chosen.fps, cap.fps) as FrameRate,
  };
}

export function setStreamQuality(q: StreamQuality): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // Private browsing: the choice holds for this session only.
  }
}

/**
 * Constraints for getDisplayMedia.
 *
 * `ideal` rather than `exact` throughout — a display that cannot produce the
 * requested size should share at whatever it can, not refuse to share.
 */
export function buildScreenConstraints(plan: SubscriptionPlan): MediaStreamConstraints {
  const q = getStreamQuality(plan);
  return {
    video: {
      width: { ideal: widthFor(q.resolution) },
      height: { ideal: q.resolution },
      frameRate: { ideal: q.fps },
    },
    audio: false,
  };
}
