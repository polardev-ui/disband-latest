// "Yay" – Wisp crouches, springs up with both mitts in the air, a burst of stars goes off,
// she lands with a squash and bounces. 2.4 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease, rng } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { sparkleShape } from '../../../spectre/src/lib/fx.mjs';

const N = 144;
const TAKEOFF = 18;
const LAND = 56;
const HEIGHT = 16;

function height(f) {
  if (f <= TAKEOFF || f >= LAND) return 0;
  const u = (f - TAKEOFF) / (LAND - TAKEOFF);
  return HEIGHT * 4 * u * (1 - u);
}
const squash = track([
  [0, 1, E.inOutSine],
  [15, 0.87, E.inQuad],
  [20, 1.09, E.outQuad],
  [30, 1.03, E.inOutSine],
  [LAND - 4, 1.06, E.inQuad],
  [LAND + 2, 0.82, E.outQuad],
  [LAND + 10, 1.05, E.inOutSine],
  [LAND + 17, 0.98, E.inOutSine],
  [LAND + 26, 1, E.inOutSine],
  [N, 1],
]);
const lift = track([
  [0, 0, E.inOutSine],
  [15, -0.3, E.overshoot],
  [26, 1.06, E.inOutSine],
  [34, 1, E.inOutSine],
  [LAND - 2, 0.95, E.inQuad],
  [LAND + 4, 0.72, E.outQuad],
  [LAND + 14, 1.03, E.inOutSine],
  [LAND + 22, 1, E.inOutSine],
  [104, 1, E.anticipate],
  [114, -0.06, E.inOutSine],
  [122, 0, E.inOutSine],
  [N, 0],
]);
const pump = (f) => (f > LAND + 22 && f < 104 ? Math.sin(((f - (LAND + 22)) / 18) * Math.PI * 2) * G.clamp((104 - f) / 10) : 0);

function pose(f) {
  const s = squash(f);
  const h = height(f);
  const l = lift(f);
  const p = pump(f);
  const air = h / HEIGHT;
  return {
    root: { y: 300 - h, sy: s, sx: 1 / Math.pow(s, 0.85) },
    head: { y: -6 * air + 16 * Math.max(0, 1 - s), r: -3 * Math.sin((f / N) * Math.PI * 4) * air },
    eyes: { happy: 1 },
    blush: 0.5,
    stars: 1 + 0.25 * air,
    armL: { a1: 55 + 95 * l + 6 * p, a2: 20 * l - 8 * p, hand: 6 * l },
    armR: { a1: 55 + 95 * l - 6 * p, a2: 20 * l + 8 * p, hand: 6 * l },
    legL: { y: -12 * air, r: 8 * air },
    legR: { y: -12 * air, r: -8 * air },
    shadow: { s: 1 - 0.4 * air, o: 1 - 0.5 * air },
  };
}

const COLOURS = ['#FFE27A', '#D9DCFF', '#FFC3D6', '#9FE7FF'];

function layers(ctx) {
  const n = ctx.N;
  const rand = rng(21);
  const burstAt = TAKEOFF + 6;
  const stars = [];
  for (let k = 0; k < 14; k++) {
    const ang = -Math.PI / 2 + (rand() - 0.5) * 2.8;
    const speed = 3.6 + rand() * 2.6;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const spin = (rand() - 0.5) * 16;
    const size = 6 + rand() * 6;
    const start = burstAt + Math.floor(rand() * 4);
    const ox = 146 + (rand() - 0.5) * 50;
    const oy = 92 + (rand() - 0.5) * 20;
    const end = n - 8 - start;
    const at = (t) => {
      const drag = 1 - Math.exp(-t / 12);
      return [ox + vx * 12 * drag, oy + vy * 12 * drag + 0.01 * Math.max(0, t - 10) ** 2 * 5];
    };
    stars.push(
      gr(`Star ${k + 1}`, sparkleShape(size, COLOURS[k % COLOURS.length]), {
        p: series(n, (f) => at(G.clamp(f - start, 0, end)), 0.3),
        r: series(n, (f) => spin * G.clamp(f - start, 0, end) * 0.5, 0.5),
        s: series(n, (f) => {
          const t = f - start;
          if (t < 0 || t >= end) return [0, 0];
          const k2 = 100 * ease.outBack(Math.min(1, t / 6), 2.2) * (1 - G.clamp((t - (end - 20)) / 20));
          return [k2, k2];
        }, 0.6),
      }),
    );
  }
  return {
    front: [shapeLayer({ ind: 0, nm: 'Stars (front)', op: n, shapes: stars.filter((_, k) => k % 2) })],
    back: [shapeLayer({ ind: 0, nm: 'Stars (back)', op: n, shapes: stars.filter((_, k) => !(k % 2)) })],
  };
}

export default { id: 'yay', name: 'Yay', frames: N, pose, layers, ground: 300, secondary: { tailGain: 0.8 } };
