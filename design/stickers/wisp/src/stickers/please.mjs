// "Please" – Wisp clasps her mitts under her chin and gives you big, shiny, wobbling eyes,
// head tilted, bobbing hopefully; sparkles twinkle around her. 2 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { sparkleShape } from '../../../spectre/src/lib/fx.mjs';
import { reach } from '../lib/wisp.mjs';

const N = 120;
const TAU = Math.PI * 2;
const CLASP = reach([-12, -160], 1);

function pose(f) {
  const bob = Math.sin((f / N) * TAU * 2);
  const wobble = Math.sin((f / N) * TAU * 12); // the shine quivers
  return {
    root: { sy: 1 + 0.012 * bob, sx: 1 - 0.008 * bob },
    body: { y: -2 * bob },
    head: { r: 10 + 2 * Math.sin((f / N) * TAU), y: 4 - 2 * bob },
    eyes: { shine: 1 + 0.06 * wobble, sx: 1.18 + 0.02 * wobble, sy: 1.12, y: 4, glow: 1.2 },
    blush: 0.5,
    tail: 10,
    armL: { a1: CLASP.a1 + 2 * bob, a2: CLASP.a2, hand: -6 },
    armR: { a1: CLASP.a1 + 2 * bob, a2: CLASP.a2, hand: -6 },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const twinkle = (t0, period) => (f) => {
    const t = ((((f - t0) % period) + period) % period) / period;
    return t < 0.5 ? Math.sin(t * 2 * Math.PI) : 0;
  };
  const sparkles = [
    [56, 120, 9, 0, 60],
    [244, 104, 7, 30, 60],
    [70, 72, 5, 45, 60],
  ].map(([x, y, r, t0, period], k) => {
    const tw = twinkle(t0, period);
    return gr(`Sparkle ${k + 1}`, sparkleShape(r, '#FFE27A'), {
      p: [x, y],
      s: series(n, (f) => [100 * ease.outBack(tw(f)), 100 * ease.outBack(tw(f))]),
      r: series(n, (f) => 20 * tw(f)),
    });
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Sparkles', op: n, shapes: sparkles })] };
}

export default { id: 'please', name: 'Please', frames: N, pose, layers };
