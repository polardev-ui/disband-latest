// "Shrug" – ¯\_(ツ)_/¯ Spectre lifts his shoulders, turns his mitts up and out, tilts his
// head with a flat "meh" look, holds it, and drops back. 2 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { arcMark } from '../lib/fx.mjs';

const N = 120;

// 0 = relaxed, 1 = full shrug.
const shrug = track([
  [0, 0, E.inOutSine],
  [10, -0.06, E.anticipate],
  [24, 1.08, E.inOutSine],
  [32, 1, E.inOutSine],
  [78, 1, E.inOutCubic],
  [96, -0.04, E.inOutSine],
  [106, 0, E.inOutSine],
  [N, 0],
]);
const blink = track([
  [0, 1],
  [56, 1, E.inQuad],
  [59, 0.12, E.inOutSine],
  [61, 0.12, E.outQuad],
  [65, 1],
  [N, 1],
]);

function pose(f) {
  const k = shrug(f);
  const kk = G.clamp(k);
  const bob = Math.sin(((f - 32) / 46) * Math.PI * 2) * (f > 32 && f < 78 ? 1 : 0);
  const sq = 1 + 0.03 * k;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq) },
    body: { y: -6 * k, sy: 1 + 0.03 * k },
    head: { y: 12 * k, r: 10 * kk + 1.5 * bob, x: 3 * kk },
    eyes: { open: 1 - 0.42 * kk * blink(f) - (1 - blink(f)) * 0.9, droop: 0.28 * kk, x: -6 * kk, y: 6 * kk },
    ear: 8 * kk,
    // Elbows stay low, forearms swing out, mitts turned palm-up.
    armL: { a1: 30 + 6 * k, a2: -16 + 104 * k + 4 * bob, hand: -40 * k },
    armR: { a1: 30 + 6 * k, a2: -16 + 104 * k - 4 * bob, hand: -40 * k },
  };
}

function layers(ctx) {
  const n = ctx.N;
  // Little motion arcs above each hand as the shrug lands.
  const vis = (f) => G.clamp((f - 20) / 6) * (1 - G.clamp((f - 40) / 10));
  const marks = [-1, 1].map((side) =>
    gr(side < 0 ? 'Shrug marks L' : 'Shrug marks R', [...arcMark(12, side < 0 ? 200 : -20, side < 0 ? 250 : 30, 3.4), ...arcMark(19, side < 0 ? 196 : -16, side < 0 ? 244 : 24, 3.4)], {
      p: [160 + side * 104, 190],
      o: series(n, (f) => 100 * vis(f)),
      s: series(n, (f) => [80 + 20 * vis(f), 80 + 20 * vis(f)]),
    }),
  );
  return { front: [shapeLayer({ ind: 0, nm: 'Shrug marks', op: n, shapes: marks })] };
}

export default { id: 'shrug', name: 'Shrug', frames: N, pose, layers };
