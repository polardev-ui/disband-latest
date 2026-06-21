/** Cinematic dual-tone ring loop via Web Audio (no external assets). */

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

export function directCallId(a: string, b: string) {
  return [a, b].sort().join(":");
}
