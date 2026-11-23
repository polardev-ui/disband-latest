// "Wink" – Wisp leans in with a hand up by her face, tilts her head and winks; a star pops
// out of the wink and her own stars twinkle. 2 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { sparkleShape } from '../../../spectre/src/lib/fx.mjs';

const N = 120;

// 0 = both eyes open, 1 = winking.
const wink = track([
  [0, 0, E.inOutSine],
  [24, 0, E.inQuad],
  [30, 1, E.inOutSine],
  [70, 1, E.inOutSine],
  [78, 0, E.inOutSine],
  [N, 0],
]);
// The lean into the wink.
const lean = track([
  [0, 0, E.inOutSine],
  [18, -0.1, E.anticipate],
  [32, 1.06, E.inOutSine],
  [40, 1, E.inOutSine],
  [74, 1, E.inOutCubic],
  [92, 0, E.inOutSine],
  [N, 0],
]);

function pose(f) {
  const w = wink(f);
  const l = lean(f);
  const ll = G.clamp(l);
  return {
    root: { r: -2 * l, sy: 1 + 0.02 * l },
    body: { r: -3 * l, x: -4 * l },
    head: { r: -10 * l, x: -4 * l },
    eyes: { wink: w, x: -4 * ll },
    blush: 0.6 * ll,
    stars: 1 + 0.3 * Math.max(0, Math.sin(((f - 30) / 24) * Math.PI)) * (f > 30 && f < 54 ? 1 : 0),
    // Left mitt comes up beside her face; the right rests.
    armL: { a1: 55 + 95 * l, a2: 40 * l, hand: -20 * l },
    armR: { a1: 55 - 8 * ll, a2: -6 * ll },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const pop = (f, t0) => {
    const t = f - t0;
    if (t < 0 || t > 34) return 0;
    return ease.outBack(Math.min(1, t / 9), 2.6) * (1 - ease.inBack(G.clamp((t - 22) / 12)));
  };
  const items = [
    [212, 118, 15, 30, '#FFE27A'],
    [236, 96, 8, 35, '#D9DCFF'],
    [222, 146, 6, 38, '#FFC3D6'],
  ].map(([x, y, r, t0, c], k) =>
    gr(`Star ${k + 1}`, sparkleShape(r, c), {
      p: series(n, (f) => [x + 8 * ease.outCubic(G.clamp((f - t0) / 30)), y - 6 * ease.outCubic(G.clamp((f - t0) / 30))]),
      s: series(n, (f) => [100 * Math.max(0, pop(f, t0)), 100 * Math.max(0, pop(f, t0))]),
      r: series(n, (f) => 4 * G.clamp(f - t0, 0, 34)),
    }),
  );
  return { front: [shapeLayer({ ind: 0, nm: 'Wink stars', op: n, shapes: items })] };
}

export default { id: 'wink', name: 'Wink', frames: N, pose, layers };
