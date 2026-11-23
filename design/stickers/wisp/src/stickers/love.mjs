// "Love" – Wisp hugs a big heart to her chest; it beats lub-dub twice a loop, she sways
// with happy eyes and a blush, and little hearts float up. 2 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { heartBody } from '../../../spectre/src/lib/fx.mjs';
import { reach } from '../lib/wisp.mjs';

const N = 120;
const TAU = Math.PI * 2;
const beat1 = track([
  [0, 0, E.outQuad],
  [5, 1, E.inOutSine],
  [11, -0.25, E.inOutSine],
  [15, 0.62, E.inOutSine],
  [22, -0.08, E.inOutSine],
  [30, 0, E.inOutSine],
  [60, 0],
]);
const beat = (f) => beat1(f % 60);
// Mitts on either side of the heart.
const HUG = reach([-62, -104], 1);
const HEART = [0, -96]; // body space: in front of her chest

function pose(f) {
  const b = beat(f);
  const sw = Math.sin((f / N) * TAU);
  const swLag = Math.sin((f / N) * TAU - 0.6);
  return {
    root: { r: 1.2 * sw },
    body: { r: 3 * sw },
    head: { r: 6 * swLag, y: 4 - 2 * b },
    eyes: { happy: 1, y: 2 },
    blush: 1,
    halo: { s: 1 + 0.04 * b },
    armL: { a1: HUG.a1 + 2 * b, a2: HUG.a2, hand: -10 },
    armR: { a1: HUG.a1 + 2 * b, a2: HUG.a2, hand: -10 },
  };
}

function layers(ctx) {
  const { N: n, mats } = ctx;
  // The heart is held in front of the tunic (under the arms), so it follows the body.
  const heart = shapeLayer({
    ind: 0,
    nm: 'Held heart',
    op: n,
    ks: {
      p: series(n, (f) => G.apply(mats[f].body, HEART), 0.2),
      r: series(n, (f) => G.matAngle(mats[f].body), 0.1),
      s: series(n, (f) => {
        const k = 100 * (1 + 0.1 * beat(f));
        return [k, k];
      }),
    },
    shapes: heartBody(64, { line: 3.4, fill: '#FF7FA6', shade: '#F45C8B', hi: '#FFD1DE' }),
  });
  const floater = (h, k) => {
    const life = (f) => (((f - h.delay) % n) + n) % n;
    const dur = 72;
    return gr(`Floating heart ${k + 1}`, heartBody(h.size, { line: 2.4 }), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [h.x + h.drift * 9 * Math.sin((t / 36) * Math.PI), h.y - 1.3 * t];
      }, 0.25),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * ease.outBack(Math.min(1, t / 12), 2) * (1 - ease.inQuad(Math.max(0, (t - 50) / 22)));
        return [k2, k2];
      }),
      r: series(n, (f) => h.drift * 14 * Math.sin((Math.min(life(f), dur) / 30) * Math.PI)),
    });
  };
  const floats = [
    { x: 54, y: 170, delay: 8, size: 18, drift: -1 },
    { x: 250, y: 160, delay: 68, size: 20, drift: 1 },
  ].map(floater);
  return { props: [heart], front: [shapeLayer({ ind: 0, nm: 'Hearts', op: n, shapes: floats })] };
}

export default { id: 'love', name: 'Love', frames: N, pose, layers };
