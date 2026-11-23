// "Sleepy" – Wisp dozes on her feet: slow breaths, her head nodding lower and lower while her
// halo slips and dims, then a jerk awake that sets it straight; Zs drift up. 3 s loop.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { letters } from '../../../spectre/src/lib/fx.mjs';

const N = 180;
const TAU = Math.PI * 2;
const breath = (f) => 0.5 - 0.5 * Math.cos((f / 90) * TAU);
const nod = track([
  [0, 0.5, E.inOutSine],
  [84, 1, E.inQuad],
  [92, 1.06, E.outQuad],
  [98, 0.05, E.overshoot],
  [112, 0.12, E.inOutSine],
  [180, 0.5],
]);

function pose(f) {
  const b = breath(f);
  const n = nod(f);
  const sway = Math.sin((f / N) * TAU);
  const sq = 1 + 0.025 * b;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq), r: 1.2 * sway },
    body: { y: -3 * b },
    head: { y: 4 + 16 * n - 3 * b, r: 3 + 9 * n * (0.6 + 0.4 * sway), x: 3 * n },
    eyes: { open: 0.1 + 0.3 * G.clamp((0.3 - n) / 0.3), droop: 0.3, y: 6 },
    // The halo slides down and tilts as she nods off, and dims a little.
    halo: { y: 18 * n, r: 16 * n, o: 1 - 0.3 * n },
    tail: 6 + 14 * n,
    tailFlutter: 0.5,
    armL: { a1: 38 + 3 * b, a2: -6 },
    armR: { a1: 38 + 3 * b, a2: -6 },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const zs = [0, 60, 120].map((start, k) => {
    const life = (f) => (((f - start) % n) + n) % n;
    const dur = 110;
    const size = [15, 19, 23][k];
    return gr(`Z ${k + 1}`, letters('Z', size, { fill: '#D9DCFF', weight: 0.2 }), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [70 - 0.36 * t + 6 * Math.sin(t / 14), 118 - 0.8 * t];
      }, 0.25),
      r: series(n, (f) => -12 - 10 * Math.sin(Math.min(life(f), dur) / 18)),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * (0.55 + (0.45 * t) / dur) * ease.outBack(Math.min(1, t / 14), 2) * (1 - ease.inQuad(G.clamp((t - 80) / 30)));
        return [k2, k2];
      }),
    });
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Zs', op: n, shapes: zs })] };
}

export default { id: 'sleepy', name: 'Sleepy', frames: N, pose, layers, secondary: { haloFloat: 0.5 } };
