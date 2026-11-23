// "Sleepy" – Spectre dozes on his feet: slow breaths, a drooping nod and a little jerk
// awake, a sleep bubble that swells and shrinks, and Zs drifting up. 3 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease } from '../lib/anim.mjs';
import { series, sh, st, fl, gr, shapeLayer } from '../lib/lottie.mjs';
import { PAL } from '../lib/spectre.mjs';
import { letters } from '../lib/fx.mjs';

const N = 180;
const TAU = Math.PI * 2;

// Two slow breaths per loop: 0 = out, 1 = in.
const breath = (f) => 0.5 - 0.5 * Math.cos((f / 90) * TAU);

// The head sinks as he drifts off, jerks up halfway through, then sinks again.
const nod = track([
  [0, 0.55, E.inOutSine],
  [84, 1, E.inQuad],
  [92, 1.06, E.outQuad],
  [98, 0.05, E.overshoot],
  [112, 0.12, E.inOutSine],
  [180, 0.55],
]);

function pose(f) {
  const b = breath(f);
  const n = nod(f);
  const sway = Math.sin((f / N) * TAU);
  const sq = 1 + 0.025 * b;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq), r: 1.4 * sway },
    body: { y: -3 * b, r: -1.2 * sway },
    head: { y: 4 + 16 * n - 3 * b, r: -3 + 9 * n * (0.6 + 0.4 * sway), x: 4 * n },
    eyes: { open: 0.1 + 0.25 * G.clamp((0.3 - n) / 0.3), droop: 0.35, y: 6 },
    ear: 18 + 16 * n,
    armL: { a1: 30 + 3 * b, a2: -8 - 4 * n },
    armR: { a1: 30 + 3 * b, a2: -8 - 4 * n },
  };
}

function layers(ctx) {
  const { N: n, mats, poses } = ctx;
  // Sleep bubble: grows on the breath out, shrinks on the breath in, pops when he jerks awake.
  const bubbleAt = (f) => G.apply(mats[f].head, [38, -22]);
  const bubbleSize = (f) => {
    if (f > 92 && f < 104) return 0; // popped
    const regrow = f >= 104 && f < 140 ? ease.outCubic((f - 104) / 36) : 1;
    return regrow * (0.35 + 0.65 * (1 - breath(f)));
  };
  const bubble = gr(
    'Sleep bubble',
    [
      gr('Shine', [sh(G.smooth([{ p: [-9, -3] }, { p: [-7, -9] }, { p: [-2, -12] }], false)), st('#FFFFFF', 3, { cap: 2 })]),
      gr('Bubble', [sh(G.ellipse(0, 0, 15, 15)), st('#BFE9FF', 2.6), fl('#BFE9FF', 45)]),
    ],
    {
      p: series(n, (f) => {
        const p = bubbleAt(f);
        const k = bubbleSize(f);
        return [p[0] + 15 * k, p[1] + 4 * k];
      }, 0.25),
      s: series(n, (f) => [100 * bubbleSize(f), 100 * bubbleSize(f)], 0.4),
    },
  );
  // Pop sparkle where the bubble was.
  const pop = gr(
    'Pop',
    [-60, -20, 20, 60, 100, 140, 180, 220].map((a, k) =>
      gr(`Bit ${k + 1}`, [sh(G.poly([[0, 0], [7, 0]], false)), st('#BFE9FF', 2.6, { cap: 2 })], { r: a }),
    ),
    {
      p: series(n, (f) => bubbleAt(Math.min(n, Math.max(92, Math.min(f, 104)))), 0.3),
      s: series(n, (f) => {
        const t = f - 92;
        if (t < 0 || t > 10) return [0, 0];
        const k = 60 + 80 * ease.outCubic(t / 10);
        return [k, k];
      }),
      o: series(n, (f) => 100 * (1 - G.clamp((f - 96) / 8))),
    },
  );

  // Zs drift up and to the right, one every 60 frames, growing and fading.
  const zs = [0, 60, 120].map((start, k) => {
    const life = (f) => (((f - start) % n) + n) % n;
    const dur = 110;
    const size = [16, 20, 24][k];
    return gr(`Z ${k + 1}`, letters('Z', size, { fill: '#D9DCFF', weight: 0.2 }), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [232 + 0.42 * t + 6 * Math.sin(t / 14), 104 - 0.82 * t];
      }, 0.25),
      r: series(n, (f) => 12 + 10 * Math.sin(Math.min(life(f), dur) / 18)),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * (0.55 + 0.45 * t / dur) * ease.outBack(Math.min(1, t / 14), 2) * (1 - ease.inQuad(G.clamp((t - 80) / 30)));
        return [k2, k2];
      }),
    });
  });
  void poses;
  return {
    front: [shapeLayer({ ind: 0, nm: 'Zs', op: n, shapes: zs }), shapeLayer({ ind: 0, nm: 'Sleep bubble', op: n, shapes: [pop, bubble] })],
  };
}

export default { id: 'sleepy', name: 'Sleepy', frames: N, pose, layers, secondary: { earGain: 0.8 } };
