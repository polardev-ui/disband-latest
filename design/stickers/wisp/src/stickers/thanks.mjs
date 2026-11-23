// "Thanks" – Wisp clasps her mitts in front, bows her head with her eyes closed happily, holds
// it, and comes back up; little hearts and a sparkle float up. 2.5 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { heartBody, sparkleShape } from '../../../spectre/src/lib/fx.mjs';
import { reach } from '../lib/wisp.mjs';

const N = 150;

// 0 = upright, 1 = full bow.
const bow = track([
  [0, 0, E.inOutSine],
  [14, -0.06, E.anticipate],
  [34, 1.04, E.inOutSine],
  [44, 1, E.inOutSine],
  [86, 1, E.inOutCubic],
  [108, -0.05, E.inOutSine],
  [118, 0, E.inOutSine],
  [N, 0],
]);
const CLASP = reach([-10, -122], 1);

function pose(f) {
  const b = bow(f);
  const bb = G.clamp(b);
  const breath = Math.sin((f / N) * Math.PI * 2);
  return {
    root: { sy: 1 - 0.05 * bb, sx: 1 + 0.025 * bb },
    body: { y: 6 * bb, sy: 1 - 0.03 * bb },
    head: { y: 26 * b, sy: 1 - 0.07 * bb, r: 2 * breath },
    eyes: { happy: G.clamp(b * 1.4), y: 6 * bb },
    blush: 0.7 * bb,
    halo: { y: -6 * bb },
    armL: { a1: CLASP.a1 + 4 * bb, a2: CLASP.a2, hand: 0 },
    armR: { a1: CLASP.a1 + 4 * bb, a2: CLASP.a2, hand: 0 },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const floater = (h, k) => {
    const life = (f) => (((f - h.delay) % n) + n) % n;
    const dur = 70;
    const shape = h.heart ? heartBody(h.size, { line: 2.4 }) : sparkleShape(h.size, '#FFE27A');
    return gr(`Float ${k + 1}`, shape, {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [h.x + h.drift * 8 * Math.sin((t / 35) * Math.PI), h.y - 1.2 * t];
      }, 0.25),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * ease.outBack(Math.min(1, t / 12), 2) * (1 - ease.inQuad(G.clamp((t - 50) / 20)));
        return [k2, k2];
      }),
      r: series(n, (f) => h.drift * 12 * Math.sin((Math.min(life(f), dur) / 30) * Math.PI)),
    });
  };
  const items = [
    { x: 70, y: 150, delay: 36, size: 18, drift: -1, heart: true },
    { x: 240, y: 126, delay: 50, size: 15, drift: 1, heart: true },
    { x: 88, y: 98, delay: 62, size: 9, drift: 1, heart: false },
  ].map(floater);
  return { front: [shapeLayer({ ind: 0, nm: 'Hearts', op: n, shapes: items })] };
}

export default { id: 'thanks', name: 'Thanks', frames: N, pose, layers };
