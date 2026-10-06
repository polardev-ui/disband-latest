
import { isSoundEnabled } from "@/lib/user-settings";

let ctx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;
let ringNodes: OscillatorNode[] = [];

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playPulse() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();

  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
  gain.connect(ac.destination);

  const freqs = [220, 330];
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.98, now + 1.4);
    const g = ac.createGain();
    g.gain.value = i === 0 ? 0.7 : 0.35;
    osc.connect(g);
    g.connect(gain);
    osc.start(now);
    osc.stop(now + 1.5);
    ringNodes.push(osc);
  });
}

export function startRingtone() {
  stopRingtone();
  if (!isSoundEnabled()) return;
  playPulse();
  ringInterval = setInterval(playPulse, 2200);
}

export function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  ringNodes.forEach((n) => {
    try { n.stop(); } catch { /* already stopped */ }
  });
  ringNodes = [];
}

/**
 * Three rising notes when a screen share starts, for the sharer and for
 * everyone watching, so nobody has to notice a new tile on their own.
 */
export function playScreenShareJingle() {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  const start = ac.currentTime + 0.02;
  [523.25, 659.25, 987.77].forEach((freq, i) => {
    const t = start + i * 0.09;
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/**
 * Legacy deterministic 1:1 call id (`min:max` of the two user ids).
 * Retired: predictable channel names let anyone who knew both user ids join
 * the signaling channel. Callers mint `crypto.randomUUID()` per call now.
 * Kept exported for tests; do not use for new calls.
 */
export function directCallId(a: string, b: string) {
  return [a, b].sort().join(":");
}
