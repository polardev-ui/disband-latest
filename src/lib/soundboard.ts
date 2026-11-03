"use client";

import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";
import { getParticipantControls } from "@/lib/call-participant-settings";
import { PUBLIC_ENV } from "@/lib/public-env";

/*
 Soundboard clips travel as an event, not inside the sender's microphone.
 Mixed into the mic, a clip was part of someone's voice, so "Mute their
 soundboard" had nothing it could turn off. Now the call in progress
 announces each clip to the room and everyone plays it themselves, skipping
 it if they muted that person's soundboard or are deafened.
*/

type Sender = (url: string) => void;
let sender: Sender | null = null;

/** Set by the call in progress: how to tell the room a clip was played. */
export function setSoundboardSender(fn: Sender | null) {
  sender = fn;
}

export function soundboardSender(): Sender | null {
  return sender;
}

/** Only clips from the space soundboard bucket are ever played. */
export function isSoundboardUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  const base = `${PUBLIC_ENV.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/server-sounds/`;
  return url.startsWith(base) && !url.includes("..");
}

export function playSoundboardLocally(url: string, volume = 1): HTMLAudioElement | null {
  if (typeof window === "undefined" || !isSoundboardUrl(url)) return null;
  const audio = new Audio(url);
  audio.volume = Math.min(1, Math.max(0, volume));
  void applyAudioOutputToElement(audio, getPreferredAudioOutputId());
  void audio.play().catch(() => {});
  return audio;
}

const recent = new Map<string, number[]>();

/** A clip someone else in the call played. */
export function receiveSoundboard(from: string, url: unknown, deafened: boolean) {
  if (deafened || !isSoundboardUrl(url)) return;
  const controls = getParticipantControls(from);
  if (controls.soundboardMuted) return;
  // At most 4 clips per person in 3 seconds, however fast they are sent.
  const now = Date.now();
  const times = (recent.get(from) ?? []).filter((t) => now - t < 3_000);
  if (times.length >= 4) return;
  times.push(now);
  recent.set(from, times);
  playSoundboardLocally(url, Math.min(1, controls.volume / 100));
}
