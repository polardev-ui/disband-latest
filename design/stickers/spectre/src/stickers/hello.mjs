// "Hi!" – Spectre dips, throws an arm up and waves, then settles. 2.5 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease, ramp } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { armGeometry, HAND_LEN } from '../lib/spectre.mjs';
import { arcMark, sparkleShape } from '../lib/fx.mjs';

const N = 150;
const WAVE_START = 30;
const WAVE_LEN = 20; // frames per wave
const WAVES = 4;
const WAVE_END = WAVE_START + WAVE_LEN * WAVES; // 110

// Arm raise: 0 = resting, 1 = up. Anticipation dip, overshoot on the way up, eased drop.
const raise = track([
  [0, 0, E.inOutSine],
  [9, -0.09, E.anticipate],
  [25, 1.08, E.inOutSine],
  [32, 1, E.inOutSine],
  [112, 1, E.anticipate],
  [126, -0.05, E.inOutSine],
  [134, 0, E.inOutSine],
  [N, 0],
]);

// Envelope for the waving oscillation.
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

const blink = track([
  [0, 1],
  [138, 1, E.inQuad],
  [141, 0.08, E.inOutSine],
  [143, 0.08, E.outQuad],
  [147, 1],
  [N, 1],
]);

function pose(f) {
  const r = raise(f);
  const rLag = raise(Math.max(0, f - 4));
  const e = env(f);
  const ph = phase(f);
  const s = squash(f);
  const bob = 0.009 * Math.sin(2 * ph) * e;
  return {
    root: { sy: s + bob, sx: 1 / Math.sqrt(s + bob) },
    body: { r: 2.4 * r + 1.4 * Math.sin(ph + Math.PI) * e, x: 3 * Math.sin(ph + Math.PI) * e },
    head: {
      r: -5 * rLag - 2 * Math.sin(ph - 0.5) * e,
      y: -3 * rLag + 2 * Math.sin(2 * ph) * e,
    },
    eyes: { happy: happy(f), open: blink(f) },
    armL: {
      a1: 44 + (136 - 44) * r + 5 * Math.sin(ph - 0.4) * e,
      a2: -18 + (10 + 18) * r + 18 * Math.sin(ph) * e,
      hand: 12 * Math.sin(ph - 1.1) * e,
    },
    armR: { a1: 44 + 5 * r, a2: -16 - 6 * r },
    ear: -5 * rLag,
  };
}

/** Wave marks: two small arcs beside the hand at each end of a wave. */
function layers(ctx) {
  const { N: n, poses, mats } = ctx;
  const handWorld = (f) => {
    const g = armGeometry(poses[f].armL);
    const d = [-Math.sin(g.angle * G.DEG), Math.cos(g.angle * G.DEG)];
    const mitt = G.add(g.wrist, G.mul(d, HAND_LEN * 0.65));
    return G.apply(mats[f].body, mitt);
  };
  const marks = [];
  for (const side of [-1, 1]) {
    // Visible near the extreme of each swing on this side.
    const vis = (f) => {
      const e = env(f);
      const v = Math.max(0, side * Math.sin(phase(f)));
      return e * Math.pow(v, 3);
    };
    marks.push(
      gr(
        side < 0 ? 'Wave mark out' : 'Wave mark in',
        arcMark(11, side < 0 ? 200 : -20, side < 0 ? 250 : 30, 3.4).concat(
          arcMark(18, side < 0 ? 196 : -16, side < 0 ? 244 : 24, 3.4),
        ),
        {
          p: series(n, (f) => {
            const h = handWorld(f);
            return [h[0] + side * 22, h[1] - 6];
          }, 0.3),
          s: series(n, (f) => {
            const k = 70 + 30 * vis(f);
            return [k, k];
          }),
          o: series(n, (f) => 100 * Math.min(1, vis(f) * 1.6)),
        },
      ),
    );
  }
  // A pop of sparkles when the arm first goes up.
  const pop = (f) => G.clamp((f - 20) / 10) * (1 - G.clamp((f - 34) / 12));
  const sparkles = [
    [-30, -30, 7, 0],
    [24, -38, 5, 3],
  ].map(([dx, dy, r, delay], k) =>
    gr(
      `Sparkle ${k + 1}`,
      sparkleShape(r),
      {
        p: series(n, (f) => {
          const h = handWorld(Math.min(n, 30));
          return [h[0] + dx, h[1] + dy - 6 * pop(f - delay)];
        }),
        s: series(n, (f) => {
          const t = pop(f - delay);
          const k2 = 100 * ease.outBack(Math.min(1, t * 1.4)) * (t > 0 ? 1 : 0);
          return [k2, k2];
        }),
        r: series(n, (f) => 40 * pop(f - delay)),
        o: series(n, (f) => (pop(f - delay) > 0 ? 100 : 0)),
      },
    ),
  );
  return {
    front: [shapeLayer({ ind: 0, nm: 'Wave marks', op: n, shapes: [...marks, ...sparkles] })],
  };
}

export default { id: 'hello', name: 'Hello', frames: N, pose, layers };
