// "Shy" – Wisp blushes with her mitts on her cheeks, eyes turned away, swaying side to side
// and twisting one foot; her tail curls and a tiny heart floats up. 2.5 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { track, E, ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { heartBody } from '../../../spectre/src/lib/fx.mjs';
import { reach } from '../lib/wisp.mjs';

const N = 150;
const TAU = Math.PI * 2;
const CHEEK = reach([-72, -208], -1);

// She peeks at you once, then looks away again.
const peek = track([
  [0, 0, E.inOutSine],
  [62, 0, E.inOutCubic],
  [72, 1, E.inOutSine],
  [92, 1, E.inOutCubic],
  [104, 0, E.inOutSine],
  [N, 0],
]);

function pose(f) {
  const sway = Math.sin((f / N) * TAU * 2);
  const swayLag = Math.sin((f / N) * TAU * 2 - 0.7);
  const p = peek(f);
  return {
    root: { r: 1.5 * sway },
    body: { r: 3 * sway, x: 3 * sway },
    head: { r: -8 + 6 * swayLag + 6 * p, x: -4 * swayLag, y: 6 },
    eyes: { happy: 1 - p, x: -10 * (1 - p), y: 8 * (1 - p), sy: 0.9 },
    blush: 1,
    tail: 8 - 6 * p,
    armL: { a1: CHEEK.a1 + 2 * swayLag, a2: CHEEK.a2, hand: 0 },
    armR: { a1: CHEEK.a1 - 2 * swayLag, a2: CHEEK.a2, hand: 0 },
    // A shy foot twist on the right foot.
    legR: { r: -8 * Math.max(0, Math.sin((f / N) * TAU * 2)), x: 4 * Math.max(0, Math.sin((f / N) * TAU * 2)) },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const life = (f) => (((f - 20) % n) + n) % n;
  const dur = 80;
  const heart = gr('Heart', heartBody(16, { line: 2.4 }), {
    p: series(n, (f) => {
      const t = Math.min(life(f), dur);
      return [238 + 6 * Math.sin(t / 10), 120 - 1.0 * t];
    }, 0.25),
    s: series(n, (f) => {
      const t = life(f);
      if (t >= dur) return [0, 0];
      const k = 100 * ease.outBack(Math.min(1, t / 12), 2.2) * (1 - ease.inQuad(G.clamp((t - 60) / 20)));
      return [k, k];
    }),
    r: series(n, (f) => 12 * Math.sin(Math.min(life(f), dur) / 12)),
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Heart', op: n, shapes: [heart] })] };
}

export default { id: 'shy', name: 'Shy', frames: N, pose, layers };
