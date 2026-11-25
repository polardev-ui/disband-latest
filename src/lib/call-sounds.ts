
import { isSoundEnabled } from "@/lib/user-settings";
import { isAppSoundEnabled } from "@/lib/audio-settings";

function newCtx(): AudioContext | null {
  try {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peak = 0.1,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

/** `preview` plays it even when turned off (the settings page's Play button). */
export function playCallConnected(preview = false) {
  if (!preview && (!isSoundEnabled() || !isAppSoundEnabled("callConnected"))) return;
  const ctx = newCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(ctx, 523.25, t, 0.12, 0.09);
  tone(ctx, 783.99, t + 0.1, 0.28, 0.09);
  setTimeout(() => void ctx.close(), 600);
}

/** `preview` plays it even when turned off (the settings page's Play button). */
export function playCallJoin(preview = false) {
  if (!preview && (!isSoundEnabled() || !isAppSoundEnabled("callJoin"))) return;
  const ctx = newCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(ctx, 659.25, t, 0.09, 0.07);
  tone(ctx, 880, t + 0.07, 0.14, 0.07);
  setTimeout(() => void ctx.close(), 400);
}

/** `preview` plays it even when turned off (the settings page's Play button). */
export function playCallLeave(preview = false) {
  if (!preview && (!isSoundEnabled() || !isAppSoundEnabled("callLeave"))) return;
  const ctx = newCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(ctx, 659.25, t, 0.09, 0.07);
  tone(ctx, 440, t + 0.07, 0.16, 0.07);
  setTimeout(() => void ctx.close(), 400);
}

/** `preview` plays it even when turned off (the settings page's Play button). */
export function playCallEnd(preview = false) {
  if (!preview && (!isSoundEnabled() || !isAppSoundEnabled("callEnd"))) return;
  const ctx = newCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(ctx, 440, t, 0.1, 0.08);
  tone(ctx, 329.63, t + 0.09, 0.2, 0.08);
  setTimeout(() => void ctx.close(), 500);
}

/** Update chime: two rising tones, distinct from the call sounds. Played
 * when an app update is offered so an auto-install never lands silent. */
/** `preview` plays it even when turned off (the settings page's Play button). */
export function playUpdateReady(preview = false) {
  if (!preview && (!isSoundEnabled() || !isAppSoundEnabled("updateReady"))) return;
  const ctx = newCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(ctx, 880, t, 0.1, 0.07);
  tone(ctx, 1174.66, t + 0.09, 0.22, 0.07);
  setTimeout(() => void ctx.close(), 500);
}
