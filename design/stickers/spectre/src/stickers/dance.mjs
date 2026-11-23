// "Dance" – Spectre grooves: a bounce on every beat, hips swaying side to side, disco
// points (one arm up, the other down across), feet stepping, and music notes floating up.
// 2 s loop at 60 fps (four beats at 120 bpm).

import * as G from '../lib/geom.mjs';
import { ease } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { armIK } from '../lib/spectre.mjs';
import { musicNote } from '../lib/fx.mjs';

const N = 120;
const BEAT = 30;
const TAU = Math.PI * 2;

/** 0 at each beat (the down), 1 halfway between (the up). */
const bounce = (f) => {
  const t = (((f % BEAT) + BEAT) % BEAT) / BEAT;
  return Math.sin(t * Math.PI);
};

const UP = { a1: 128, a2: 4, hand: 0 };
const ACROSS = { ...armIK([14, -78], 1), hand: 6 };
/** +1 = this arm points up, -1 = down across; snaps over a few frames at each switch. */
const point = (f) => {
  const t = (((f % (BEAT * 2)) + BEAT * 2) % (BEAT * 2)) / (BEAT * 2);
  const phase = Math.floor(f / (BEAT * 2)) % 2 === 0 ? 1 : -1;
  const snap = t < 0.14 ? ease.outBack(t / 0.14, 1.6) : 1;
  return phase * (2 * snap - 1);
};
function discoArm(p, pump) {
  const u = (p + 1) / 2; // 0 = across, 1 = up
  return {
    a1: ACROSS.a1 + (UP.a1 - ACROSS.a1) * u + 4 * pump * u,
    a2: ACROSS.a2 + (UP.a2 - ACROSS.a2) * u,
    hand: ACROSS.hand + (UP.hand - ACROSS.hand) * u,
  };
}

function pose(f) {
  const b = bounce(f);
  const down = 1 - b;
  const sway = Math.sin((f / (BEAT * 2)) * Math.PI); // left on beats 1 and 3, right on 2 and 4
  const swayLag = Math.sin(((f - 5) / (BEAT * 2)) * Math.PI);
  const pump = Math.sin((f / BEAT) * TAU); // a little push on every beat
  const sq = 1 - 0.07 * Math.pow(down, 3) + 0.03 * b;
  const stepL = Math.max(0, sway) * b;
  const stepR = Math.max(0, -sway) * b;
  return {
    root: { y: 300 - 6 * b, sy: sq, sx: 1 / Math.sqrt(sq), x: 160 + 10 * sway, r: -3 * sway },
    body: { r: 6 * sway, x: 3 * sway },
    head: { r: -7 * swayLag, y: 4 * Math.pow(down, 2), x: -3 * swayLag },
    eyes: { happy: 1 },
    ear: -6 * swayLag,
    // Disco: one arm points up and out while the other points down across the body,
    // switching every two beats with a snap.
    armL: discoArm(point(f), pump),
    armR: discoArm(-point(f), -pump),
    legL: { y: -12 * stepL, r: 10 * stepL },
    legR: { y: -12 * stepR, r: -10 * stepR },
    shadow: { s: 1 - 0.15 * b },
  };
}

const COLOURS = ['#FFE27A', '#FF5EA8', '#2DD4BF', '#35C3F3'];

function layers(ctx) {
  const n = ctx.N;
  const notes = [
    { start: 0, x: 58, y: 150, drift: -1, double: false },
    { start: 30, x: 262, y: 140, drift: 1, double: true },
    { start: 60, x: 70, y: 120, drift: -1, double: true },
    { start: 90, x: 254, y: 170, drift: 1, double: false },
  ].map((m, k) => {
    const dur = 66;
    const life = (f) => (((f - m.start) % n) + n) % n;
    return gr(`Note ${k + 1}`, musicNote(m.double ? 13 : 15, COLOURS[k % COLOURS.length], m.double), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [m.x + m.drift * (6 * Math.sin(t / 9) + 0.25 * t), m.y - 1.1 * t];
      }, 0.25),
      r: series(n, (f) => m.drift * 14 * Math.sin(Math.min(life(f), dur) / 8)),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * ease.outBack(Math.min(1, t / 10), 2.4) * (1 - ease.inQuad(G.clamp((t - 46) / 20)));
        return [k2, k2];
      }),
    });
  });
  return {
    front: [shapeLayer({ ind: 0, nm: 'Notes (front)', op: n, shapes: notes.filter((_, k) => k % 2 === 0) })],
    back: [shapeLayer({ ind: 0, nm: 'Notes (back)', op: n, shapes: notes.filter((_, k) => k % 2 === 1) })],
  };
}

export default { id: 'dance', name: 'Dance', frames: N, pose, layers, secondary: { earGain: 0.7, stringGain: 0.8 } };
