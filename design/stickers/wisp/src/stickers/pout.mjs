// "Pout" – Hmph! Wisp turns her head away with a frown, fists stiff at her sides, stamps a
// foot twice a loop; her halo sits crooked and her tail bristles. 2 s loop at 60 fps.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { ease } from '../../../spectre/src/lib/anim.mjs';
import { series, gr, shapeLayer } from '../../../spectre/src/lib/lottie.mjs';
import { angerMark, puff } from '../../../spectre/src/lib/fx.mjs';

const N = 120;
const STOMP = 60;

function stomp(f) {
  const t = (((f % STOMP) + STOMP) % STOMP) / STOMP;
  const lift = t < 0.3 ? ease.outQuad(t / 0.3) : t < 0.4 ? 1 - ease.inQuad((t - 0.3) / 0.1) : 0;
  const impact = t >= 0.4 ? Math.exp(-((t - 0.4) * STOMP) / 4) : 0;
  return { lift, impact };
}

function pose(f) {
  const { lift, impact } = stomp(f);
  const huff = Math.sin((f / N) * Math.PI * 4);
  const sq = 1 - 0.05 * impact + 0.015 * lift;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq), x: 146 + 1.2 * Math.sin((f / N) * Math.PI * 2 * 20) * impact },
    body: { r: -2 * lift, y: 2 * impact },
    head: { r: -10 + 2 * impact, x: -4, y: 4 + 4 * impact },
    eyes: { angry: 0.85, open: 0.85, x: 12, y: 4 },
    halo: { r: -14 + 3 * huff, x: -6, y: 2 },
    tailFlutter: 2.2,
    tail: -6,
    // Stiff arms angled back and down, fists clenched.
    armL: { a1: 26 + 4 * lift, a2: -18, hand: 10 },
    armR: { a1: 26 + 4 * lift, a2: -18, hand: 10 },
    legL: { y: -14 * lift, r: 6 * lift },
    shadow: { s: 1 + 0.05 * impact },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const mark = gr('Anger mark', angerMark(13), {
    p: [62, 92],
    r: -12,
    s: series(n, (f) => {
      const t = (f % 30) / 30;
      const k = 100 * (0.92 + 0.2 * Math.pow(1 - t, 3));
      return [k, k];
    }),
  });
  // A little huff of air on each stamp.
  const huffs = [0, 60].map((start, k) => {
    const life = (f) => (((f - start - 24) % n) + n) % n;
    const dur = 30;
    return gr(`Huff ${k + 1}`, puff(8, '#F4F5FF'), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [96 - 1.1 * t, 172 - 0.3 * t];
      }, 0.25),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * (0.6 + 0.7 * ease.outCubic(t / dur)) * (1 - ease.inQuad(G.clamp((t - 18) / 12)));
        return [k2, k2];
      }),
      o: series(n, (f) => 100 * (1 - G.clamp((life(f) - 16) / 14))),
    });
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Hmph', op: n, shapes: [mark, ...huffs] })] };
}

export default { id: 'pout', name: 'Pout', frames: N, pose, layers, secondary: { tailGain: 0.6 } };
