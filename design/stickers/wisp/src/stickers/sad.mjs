// "Sad" – Wisp sobs: drooping eyes, tears streaming, her tail and halo sagging; two sobs a
// loop with a breath in, a catch and a shudder. 2 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E } from '../../../spectre/src/lib/anim.mjs';
import { series, sh, st, fl, gr, tm, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { PAL as SPAL } from '../../../spectre/src/lib/spectre.mjs';
import { tearShape } from '../../../spectre/src/lib/fx.mjs';
import { DIM } from '../lib/wisp.mjs';

const N = 120;
const SOB = 60;
const breath = track([
  [0, 0, E.inOutSine],
  [24, 1, E.anticipate],
  [31, -0.55, E.outQuad],
  [38, -0.2, E.inOutSine],
  [44, -0.42, E.inOutSine],
  [50, -0.12, E.inOutSine],
  [60, 0],
]);
const shudder = (f) => {
  const t = f - 30;
  if (t < 0 || t > 22) return 0;
  return Math.sin(t * 1.35) * Math.exp(-t / 9);
};

function pose(f) {
  const sf = f % SOB;
  const b = breath(sf);
  const s2 = shudder(sf);
  const sq = 1 + 0.03 * b;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq) },
    body: { y: -5 * b, r: 1.2 * s2 },
    head: { y: 14 - 9 * b, r: 6 + 2 * s2, x: 2 },
    eyes: { droop: 1, sy: 0.92 - 0.04 * b, y: 3 },
    tail: 20 + 6 * Math.max(0, -b),
    tailFlutter: 0.4,
    halo: { r: 10, y: 8, o: 0.85 },
    armL: { a1: 32 + 4 * b, a2: -6 - 3 * b },
    armR: { a1: 32 + 4 * b, a2: -6 - 3 * b },
  };
}

function faceExtras(ctx) {
  const { S } = ctx;
  const out = [];
  for (const side of [1, -1]) {
    const x0 = DIM.eye[0] * side;
    const y0 = DIM.eye[1] + 30;
    const stream = S((P, f) => {
      const w = Math.sin((f / N) * Math.PI * 2 * 3 + side) * 3;
      return G.smooth(
        [
          { p: [x0 + side * 2, y0] },
          { p: [x0 + side * (6 + w), y0 + 30] },
          { p: [x0 + side * (4 - w), y0 + 60] },
          { p: [x0 + side * 8, y0 + 90] },
        ],
        false,
      );
    }, 0.4);
    const start = side > 0 ? 0 : 180;
    out.push(
      gr(side > 0 ? 'Tear flow R' : 'Tear flow L', [sh(stream), tm(0, 22, series(N, (f) => start + (360 * 6 * f) / N)), st(SPAL.tearHi, 6, { cap: 2 })]),
      gr(side > 0 ? 'Tear stream R' : 'Tear stream L', [sh(stream), st(SPAL.tear, 15, { cap: 2 })]),
      gr(side > 0 ? 'Tear pool R' : 'Tear pool L', [sh(G.ellipse(x0, DIM.eye[1] + 31, 20, 8.5)), fl(SPAL.tear, 85)]),
    );
  }
  return out;
}

function layers(ctx) {
  const { N: n, mats } = ctx;
  const drips = [
    { start: 26, side: 1 },
    { start: 50, side: -1 },
    { start: 86, side: -1 },
    { start: 110, side: 1 },
  ].map((d, k) => {
    const life = (f) => {
      let t = f - d.start;
      if (t < 0) t += n;
      return t;
    };
    const dur = 26;
    const origin = G.apply(mats[d.start % n].head, [d.side * 58, 10]);
    const posAt = (t) => [origin[0] + d.side * 0.25 * t, origin[1] + 0.9 * t + 0.11 * t * t];
    return gr(`Drip ${k + 1}`, tearShape(4.6), {
      p: series(n, (f) => posAt(Math.min(life(f), dur)), 0.25),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * Math.min(1, t / 5) * (1 - Math.max(0, (t - 18) / 8));
        return [k2 * (1 - 0.15 * Math.min(1, t / 8)), k2 * (1 + 0.25 * Math.min(1, t / 8))];
      }),
    });
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Drips', op: n, shapes: drips })] };
}

export default { id: 'sad', name: 'Sad', frames: N, pose, layers, faceExtras, secondary: { tailGain: 0.5, haloFloat: 0.5 } };
