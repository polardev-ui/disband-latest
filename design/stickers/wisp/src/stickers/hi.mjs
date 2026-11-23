// "Hi" – Wisp dips, throws a mitt up and waves, her tail swishing; a little star pops by
// her hand. 2.5 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease, ramp } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { sparkleShape } from '../../../spectre/src/lib/fx.mjs';
import { armGeometry } from '../lib/wisp.mjs';

const N = 150;
const WAVE_START = 30;
const WAVE_LEN = 20;
const WAVE_END = WAVE_START + WAVE_LEN * 4;

const raise = track([
  [0, 0, E.inOutSine],
  [9, -0.1, E.anticipate],
  [25, 1.08, E.inOutSine],
  [32, 1, E.inOutSine],
  [112, 1, E.anticipate],
  [126, -0.05, E.inOutSine],
  [134, 0, E.inOutSine],
  [N, 0],
]);
const env = (f) => ramp(f, WAVE_START - 4, WAVE_START + 6) * (1 - ramp(f, WAVE_END - 8, WAVE_END + 2));
const phase = (f) => ((f - WAVE_START) / WAVE_LEN) * 2 * Math.PI;
const squash = track([
  [0, 1, E.inOutSine],
  [9, 0.955, E.inOutSine],
  [20, 1.04, E.inOutSine],
  [30, 0.99, E.inOutSine],
  [38, 1, E.inOutSine],
  [118, 1, E.inOutSine],
  [130, 0.965, E.inOutSine],
  [139, 1.015, E.inOutSine],
  [147, 1, E.inOutSine],
  [N, 1],
]);
const happy = track([
  [0, 0, E.inOutSine],
  [13, 0, E.overshoot],
  [21, 1, E.inOutSine],
  [118, 1, E.inOutSine],
  [126, 0, E.inOutSine],
  [N, 0],
]);

function pose(f) {
  const r = raise(f);
  const rLag = raise(Math.max(0, f - 4));
  const e = env(f);
  const ph = phase(f);
  const s = squash(f);
  return {
    root: { sy: s, sx: 1 / Math.sqrt(s) },
    body: { r: -2.4 * r + 1.4 * Math.sin(ph) * e, x: -3 * Math.sin(ph) * e },
    head: { r: 5 * rLag + 2 * Math.sin(ph - 0.5) * e, y: -3 * rLag + 2 * Math.sin(2 * ph) * e },
    eyes: { happy: happy(f) },
    blush: 0.6 * happy(f),
    // The left arm (screen left, away from her tail) goes up and waves.
    armL: {
      a1: 55 + (148 - 55) * r + 6 * Math.sin(ph - 0.4) * e,
      a2: 18 * r + 22 * Math.sin(ph) * e,
      hand: 10 * Math.sin(ph - 1.1) * e,
    },
    armR: { a1: 55 - 6 * r, a2: -4 * r },
  };
}

function layers(ctx) {
  const { N: n, poses, mats } = ctx;
  const handWorld = (f) => G.apply(mats[f].body, armGeometry(poses[f].armL).mitt);
  const pop = (f) => G.clamp((f - 22) / 10) * (1 - G.clamp((f - 40) / 12));
  const sparkles = [
    [-34, -30, 9, 0, '#FFE27A'],
    [26, -40, 6, 4, '#D9DCFF'],
  ].map(([dx, dy, r, delay, c], k) =>
    gr(`Sparkle ${k + 1}`, sparkleShape(r, c), {
      p: series(n, (f) => {
        const h = handWorld(Math.min(n, 32));
        return [h[0] + dx, h[1] + dy - 6 * pop(f - delay)];
      }),
      s: series(n, (f) => {
        const t = pop(f - delay);
        const k2 = 100 * ease.outBack(Math.min(1, t * 1.4)) * (t > 0 ? 1 : 0);
        return [k2, k2];
      }),
      r: series(n, (f) => 40 * pop(f - delay)),
    }),
  );
  return { front: [shapeLayer({ ind: 0, nm: 'Sparkles', op: n, shapes: sparkles })] };
}

export default { id: 'hi', name: 'Hi', frames: N, pose, layers };
