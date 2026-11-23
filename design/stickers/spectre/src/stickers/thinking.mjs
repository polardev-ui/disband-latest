// "Hmm" – Spectre strokes his chin with one mitt, eyes turned up and to the side, head
// tilting as he mulls it over; a question mark pops up, wobbles and pops again.
// 2.5 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { questionMark } from '../lib/fx.mjs';

const N = 150;
const TAU = Math.PI * 2;

// The thinking hand rubs the chin: three little strokes per loop.
const rub = (f) => Math.sin((f / N) * TAU * 3);
// Eyes glance from up-left to up-right and back once per loop.
const glance = track([
  [0, -1, E.inOutSine],
  [50, -1, E.inOutCubic],
  [62, 0.9, E.softOvershoot],
  [104, 0.9, E.inOutCubic],
  [116, -1, E.softOvershoot],
  [150, -1],
]);
const blink = track([
  [0, 1],
  [70, 1, E.inQuad],
  [73, 0.1, E.inOutSine],
  [75, 0.1, E.outQuad],
  [79, 1],
  [150, 1],
]);

function pose(f) {
  const g = glance(f);
  const r = rub(f);
  const sway = Math.sin((f / N) * TAU);
  return {
    root: { r: 0.8 * sway },
    body: { r: -1.5 + 1.2 * sway, x: 1.5 * sway },
    head: { r: 9 + 3 * g + 1.5 * sway, y: 2, x: 2 * g },
    eyes: { x: 7 * g, y: -9, sx: 0.94, open: 0.84 * blink(f), angry: 0.18 },
    ear: 4 - 3 * g,
    // Right mitt under the chin (canonical left-arm space, so x is mirrored).
    // Elbow down by his side, forearm folded up so the mitt's tip rests under his chin
    // (tip at (-32, -191) in arm space), rubbing a little.
    armR: { a1: 24 + 2 * r, a2: -155 - 3 * r, hand: 4 * r },
    // The other hand on the hip, elbow out.
    armL: { a1: 55, a2: -85, hand: 25 },
  };
}

function layers(ctx) {
  const n = ctx.N;
  // A "?" pops in, wobbles, then shrinks away; two per loop on alternate sides.
  const pops = [
    { start: 6, x: 252, y: 72, rot: 12, size: 34 },
    { start: 81, x: 226, y: 50, rot: -8, size: 28 },
  ].map((p, k) => {
    const life = (f) => (((f - p.start) % n) + n) % n;
    const dur = 66;
    return gr(`Question ${k + 1}`, questionMark(p.size, { fill: '#FFE27A' }), {
      p: series(n, (f) => {
        const t = Math.min(life(f), dur);
        return [p.x, p.y - 8 * ease.outCubic(Math.min(1, t / 30))];
      }, 0.25),
      r: series(n, (f) => p.rot + 10 * Math.sin(Math.min(life(f), dur) / 6) * Math.exp(-Math.min(life(f), dur) / 30)),
      s: series(n, (f) => {
        const t = life(f);
        if (t >= dur) return [0, 0];
        const k2 = 100 * ease.outBack(Math.min(1, t / 12), 2.6) * (1 - ease.inBack(G.clamp((t - 52) / 14)));
        return [Math.max(0, k2), Math.max(0, k2)];
      }),
    });
  });
  return { front: [shapeLayer({ ind: 0, nm: 'Question marks', op: n, shapes: pops })] };
}

export default { id: 'thinking', name: 'Hmm', frames: N, pose, layers, secondary: { earGain: 0.8 }, armsInFront: true };
