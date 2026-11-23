// "Love" – Spectre swoons with hands on cheeks and heart eyes, in front of a big beating
// heart, with little hearts floating up. 2 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease } from '../lib/anim.mjs';
import { series, sh, fl, gr, shapeLayer } from '../lib/lottie.mjs';
import { DIM, PAL } from '../lib/spectre.mjs';
import { heartBody } from '../lib/fx.mjs';

const N = 120;
const TAU = Math.PI * 2;

// Heartbeat "lub-dub" twice per loop.
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

function pose(f) {
  const b = beat(f);
  const sw = Math.sin((f / N) * TAU); // one slow swoon per loop
  const swLag = Math.sin((f / N) * TAU - 0.6); // head follows the body
  const handLag = Math.sin((f / N) * TAU - 1.1); // hands follow the head
  const sq = 1 + 0.02 * b;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq), x: 160 + 4 * sw },
    body: { r: 3.5 * sw },
    head: { r: 7 * swLag, y: -3 * b, x: 4 * swLag },
    eyes: { heart: 1 + 0.14 * b, blush: 1 },
    // Hands pressed to the cheeks, wobbling a little behind the head's sway.
    armL: { a1: 56 + 3 * handLag, a2: 92 - 3 * handLag, hand: 64 + 4 * b },
    armR: { a1: 56 - 3 * handLag, a2: 92 + 3 * handLag, hand: 64 + 4 * b },
    ear: -4 * b,
  };
}

// Blush on the face, under the eyes.
function faceExtras() {
  return [1, -1].map((side) =>
    gr(side > 0 ? 'Blush R' : 'Blush L', [sh(G.ellipse(0, 0, 26, 11)), fl(PAL.blush, 60)], {
      p: [DIM.eye[0] * side + side * 10, DIM.eye[1] + 54],
    }),
  );
}

function layers(ctx) {
  const { N: n } = ctx;
  // Big heart behind Spectre, beating.
  const big = shapeLayer({
    ind: 0,
    nm: 'Big heart',
    op: n,
    ks: {
      p: [160, 152],
      s: series(n, (f) => {
        const k = 100 * (1 + 0.075 * beat(f));
        return [k, k * (1 - 0.01 * beat(f))];
      }),
    },
    shapes: heartBody(232, { line: 3.6, fill: '#FF7FA6', shade: '#F45C8B', hi: '#FFD1DE' }),
  });

  // Small hearts rise and fade on staggered, looping timelines.
  const floater = (h, k) => {
    const life = (f) => (((f - h.delay) % n) + n) % n;
    const dur = 72;
    return gr(`Floating heart ${k + 1}`, heartBody(h.size, { line: 2.6 }), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [h.x + h.drift * 9 * Math.sin((t / 36) * Math.PI), h.y - 1.35 * t];
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
  const frontHearts = [
    { x: 58, y: 190, delay: 8, size: 20, drift: -1 },
    { x: 262, y: 176, delay: 68, size: 22, drift: 1 },
  ].map(floater);
  const backHearts = [
    { x: 92, y: 120, delay: 38, size: 14, drift: 1 },
    { x: 232, y: 112, delay: 98, size: 15, drift: -1 },
  ].map(floater);
  return {
    front: [shapeLayer({ ind: 0, nm: 'Hearts (front)', op: n, shapes: frontHearts })],
    back: [shapeLayer({ ind: 0, nm: 'Hearts (back)', op: n, shapes: backHearts }), big],
  };
}

export default { id: 'love', name: 'Love', frames: N, pose, layers, faceExtras };
