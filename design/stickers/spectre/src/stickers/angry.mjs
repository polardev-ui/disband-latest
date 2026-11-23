// "Angry" – Spectre fumes: fists clenched and pumping, stomping in place, shaking, steam
// puffing out of the hood and an anger mark throbbing. 2 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { ease } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { puff, angerMark } from '../lib/fx.mjs';

const N = 120;
const STOMP = 30; // frames per stomp; the feet alternate

/** Stomp cycle: lift (0..1) of the stomping foot and an impact pulse at touchdown. */
function stomp(f) {
  const t = (((f % STOMP) + STOMP) % STOMP) / STOMP;
  const lift = t < 0.5 ? ease.outQuad(t / 0.5) : t < 0.72 ? 1 - ease.inQuad((t - 0.5) / 0.22) : 0;
  const impact = t >= 0.72 ? Math.exp(-((t - 0.72) * STOMP) / 3.5) : 0;
  return { lift, impact };
}

function pose(f) {
  const which = Math.floor(f / STOMP) % 2; // 0 = left foot, 1 = right foot
  const { lift, impact } = stomp(f);
  // Whole numbers of cycles per loop, so the shaking loops cleanly.
  const shake = Math.sin((f / N) * Math.PI * 2 * 36) * 1.5;
  const sq = 1 - 0.06 * impact + 0.02 * lift;
  const sideOf = which === 0 ? -1 : 1;
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq), x: 160 + shake * 0.9, r: sideOf * 2.5 * lift },
    body: { r: -sideOf * 2 * lift, y: 3 * impact },
    head: { y: 6 + 6 * impact, r: sideOf * 2 * lift },
    eyes: { angry: 1, open: 0.9, glow: 1.15, y: 4 },
    ear: -6 + 10 * impact,
    // Fists clenched by the sides, pumping down on each stomp.
    armL: { a1: 30 + 10 * lift - 8 * impact, a2: 70 + 10 * lift - 14 * impact, hand: 34 },
    armR: { a1: 30 + 10 * lift - 8 * impact, a2: 70 + 10 * lift - 14 * impact, hand: 34 },
    legL: { y: which === 0 ? -14 * lift : 0, r: which === 0 ? 8 * lift : 0 },
    legR: { y: which === 1 ? -14 * lift : 0, r: which === 1 ? -8 * lift : 0 },
    shadow: { s: 1 + 0.06 * impact },
  };
}

function layers(ctx) {
  const n = ctx.N;
  // Steam puffs from either side of the hood's top, alternating.
  const puffs = [
    { start: 0, x: 104, y: 74, side: -1 },
    { start: 30, x: 216, y: 66, side: 1 },
    { start: 60, x: 112, y: 70, side: -1 },
    { start: 90, x: 210, y: 62, side: 1 },
  ].map((p, k) => {
    const dur = 54;
    const life = (f) => (((f - p.start) % n) + n) % n;
    return gr(`Steam ${k + 1}`, puff(11, '#F4F5FF'), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [p.x + p.side * 0.5 * t, p.y - 1.1 * t];
      }, 0.25),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * (0.5 + 0.9 * ease.outCubic(t / dur)) * ease.outBack(Math.min(1, t / 8), 2) * (1 - ease.inQuad(G.clamp((t - 34) / 20)));
        return [k2, k2];
      }),
      o: series(n, (f) => 100 * (1 - G.clamp((life(f) - 30) / 24))),
    });
  });
  // Anger mark throbs twice a stomp at the hood's corner.
  const mark = gr('Anger mark', angerMark(15), {
    p: [246, 116],
    r: 10,
    s: series(n, (f) => {
      const t = (f % (STOMP / 2)) / (STOMP / 2);
      const k = 100 * (0.92 + 0.2 * Math.pow(1 - t, 3));
      return [k, k];
    }),
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Anger', op: n, shapes: [mark] })], back: [shapeLayer({ ind: 0, nm: 'Steam', op: n, shapes: puffs })] };
}

export default { id: 'angry', name: 'Angry', frames: N, pose, layers, secondary: { earGain: 0.35, stringGain: 0.5 } };
