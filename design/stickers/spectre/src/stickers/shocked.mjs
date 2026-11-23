// "Shocked" – Spectre is idling, then jolts: he jumps back with his arms flung up, eyes
// wide, ear sticking straight up, an "!" pops and sweat flies; he trembles and slowly
// settles back. 2 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { letters, tearShape, burstLines } from '../lib/fx.mjs';

const N = 120;
const JOLT = 16;

// 0 = calm, 1 = full shock.
const shock = track([
  [0, 0, E.inOutSine],
  [JOLT - 3, -0.08, E.outQuad], // a tiny flinch first
  [JOLT + 4, 1.12, E.inOutSine],
  [JOLT + 12, 1, E.inOutSine],
  [72, 0.95, E.inOutSine],
  [100, 0, E.inOutSine],
  [N, 0],
]);
// Hop: up on the jolt, down with a squash.
const hop = track([
  [0, 0],
  [JOLT, 0, E.outQuad],
  [JOLT + 7, 12, E.inQuad],
  [JOLT + 15, 0, E.outQuad],
  [N, 0],
]);
const squash = track([
  [0, 1, E.inOutSine],
  [JOLT - 2, 0.95, E.outQuad],
  [JOLT + 4, 1.07, E.inOutSine],
  [JOLT + 14, 1.02, E.inQuad],
  [JOLT + 17, 0.88, E.outQuad],
  [JOLT + 26, 1.03, E.inOutSine],
  [JOLT + 34, 1, E.inOutSine],
  [N, 1],
]);
// Trembling while in shock (fades in and out with the shock).
const tremble = (f) => Math.sin((f / N) * Math.PI * 2 * 40) * G.clamp((shock(f) - 0.4) / 0.6) * (f > JOLT + 14 ? 1 : 0);

function pose(f) {
  const k = shock(f);
  const kk = G.clamp(k);
  const t = tremble(f);
  const s = squash(f);
  const idle = Math.sin((f / N) * Math.PI * 2) * (1 - kk);
  return {
    root: { y: 300 - hop(f), sy: s, sx: 1 / Math.sqrt(s), x: 160 + 1.6 * t },
    body: { r: -3 * kk + 0.8 * t, y: -4 * kk },
    head: { y: -4 * kk, r: -4 * kk + 1.2 * t + 1.5 * idle },
    eyes: { sx: 1 + 0.32 * kk, sy: 1 + 0.26 * kk, y: -6 * kk, glow: 1 + 0.4 * kk },
    ear: -22 * kk,
    // Arms fly up and out, hands open.
    armL: { a1: 44 + 90 * k + 3 * t, a2: -16 + 36 * k, hand: 20 * k },
    armR: { a1: 44 + 90 * k - 3 * t, a2: -16 + 36 * k, hand: 20 * k },
    legL: { r: 6 * kk, y: -6 * Math.max(0, hop(f) / 12) },
    legR: { r: -6 * kk, y: -6 * Math.max(0, hop(f) / 12) },
    shadow: { s: 1 - 0.3 * hop(f) / 12 },
  };
}

function layers(ctx) {
  const n = ctx.N;
  const pop = (f, start, dur) => {
    const t = f - start;
    if (t < 0 || t >= dur) return 0;
    return ease.outBack(Math.min(1, t / 8), 2.8) * (1 - ease.inBack(G.clamp((t - (dur - 12)) / 12)));
  };
  const bang = gr('Bang', letters('!', 46, { fill: '#FFE27A', weight: 0.26 }), {
    p: series(n, (f) => [250, 70 - 6 * ease.outCubic(G.clamp((f - JOLT) / 20))]),
    r: series(n, (f) => 12 + 8 * Math.sin((f - JOLT) * 0.5) * Math.exp(-Math.max(0, f - JOLT) / 18)),
    s: series(n, (f) => {
      const k = 100 * Math.max(0, pop(f, JOLT, 70));
      return [k, k];
    }),
  });
  const burst = gr('Shock lines', burstLines(9, 0, 18, { width: 3.6, from: -170, to: -10 }), {
    p: [160, 104],
    s: series(n, (f) => {
      const t = f - JOLT;
      if (t < 0 || t > 16) return [0, 0];
      const k = 100 * (0.9 + 0.5 * ease.outCubic(t / 16));
      return [k, k];
    }),
    o: series(n, (f) => 100 * (1 - G.clamp((f - JOLT - 6) / 10))),
  });
  // Lines need an inner radius: draw them from a ring.
  burst.it[0].it[0] = burstLines(9, 96, 116, { width: 3.6, from: -170, to: -10 })[0].it[0];
  for (let k = 1; k < 9; k++) burst.it[0].it[k] = burstLines(9, 96, 116, { width: 3.6, from: -170, to: -10 })[0].it[k];

  const drops = [
    { side: -1, x: 96, y: 96, vx: -2.2, vy: -3.2, delay: 0 },
    { side: 1, x: 222, y: 100, vx: 2.4, vy: -3.4, delay: 3 },
  ].map((d, k) => {
    const dur = 30;
    const life = (f) => f - JOLT - d.delay;
    return gr(`Sweat ${k + 1}`, tearShape(6), {
      p: series(n, (f) => {
        const t = G.clamp(life(f), 0, dur);
        return [d.x + d.vx * t, d.y + d.vy * t + 0.17 * t * t];
      }, 0.25),
      r: series(n, (f) => {
        const t = G.clamp(life(f), 0, dur);
        return (Math.atan2(d.vx, -(d.vy + 0.34 * t)) * 180) / Math.PI;
      }),
      s: series(n, (f) => {
        const t = life(f);
        if (t < 0 || t >= dur) return [0, 0];
        const k2 = 100 * Math.min(1, t / 4) * (1 - G.clamp((t - 22) / 8));
        return [k2, k2];
      }),
    });
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Shock', op: n, shapes: [bang, ...drops, burst] })] };
}

export default { id: 'shocked', name: 'Shocked', frames: N, pose, layers, secondary: { earGain: 0.6 } };
