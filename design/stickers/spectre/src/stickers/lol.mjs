// "LOL" – Spectre doubles up laughing: hands on belly, "> <" eyes, rapid bounces,
// "HA" popping out and tears of joy flying. 2 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { ease } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { DIM } from '../lib/spectre.mjs';
import { letters, tearShape } from '../lib/fx.mjs';

const N = 120;
const BURST = 60; // two laughing fits per loop
const HA = 15; // frames per "ha"

const TAU = Math.PI * 2;

// Each "ha": a sharp drop into a squash then a softer rebound (asymmetric, like a chuckle).
function haCurve(f) {
  const t = (((f % HA) + HA) % HA) / HA;
  // 0..0.3 fast drop, 0.3..1 ease back up
  return t < 0.3 ? ease.inQuad(t / 0.3) : 1 - ease.outCubic((t - 0.3) / 0.7);
}

function pose(f) {
  const burst = Math.floor(f / BURST) % 2; // alternate lean direction
  const bf = f % BURST;
  const side = burst === 0 ? 1 : -1;
  // Lean envelope within a burst: tip into the laugh, hold, swing back through centre.
  const lean = Math.sin((bf / BURST) * Math.PI);
  const h = haCurve(f); // 0 = up, 1 = squashed
  const sq = 1 - 0.085 * h + 0.03 * (1 - h);
  return {
    root: { sy: sq, sx: 1 / Math.sqrt(sq), r: side * 2.5 * lean },
    body: { r: side * 6 * lean, y: 4 * h },
    head: { r: side * 9 * lean + side * 3 * h * lean, y: 13 * h - 6 * lean, x: side * 6 * lean },
    eyes: { laugh: 1 },
    armL: { ik: { target: [-108 - side * 3 * lean, -96 + 8 * h], bend: 1 }, hand: -22 },
    armR: { ik: { target: [-108 + side * 3 * lean, -96 + 8 * h], bend: 1 }, hand: -22 },
    ear: -4 + 6 * h,
  };
}

function layers(ctx) {
  const { N: n, mats } = ctx;
  const front = [];

  // "HA" pops: one per laughing fit, alternating sides.
  const pops = [
    { start: 4, side: 1, x: 252, y: 92, rot: 14 },
    { start: 64, side: -1, x: 68, y: 96, rot: -14 },
  ];
  const haGroups = pops.map((p, k) => {
    const life = (f) => {
      let t = f - p.start;
      if (t < 0) t += n;
      return t;
    };
    const visible = (f) => life(f) < 46;
    return gr(`HA ${k + 1}`, letters('HA', 24, { fill: '#FFFFFF' }), {
      p: series(n, (f) => {
        const t = life(f);
        return visible(f) ? [p.x + p.side * 3 * ease.outCubic(Math.min(1, t / 40)), p.y - 14 * ease.outCubic(Math.min(1, t / 40))] : [p.x, p.y];
      }),
      s: series(n, (f) => {
        const t = life(f);
        if (!visible(f)) return [0, 0];
        const grow = t < 10 ? 118 * ease.outBack(t / 10, 2.6) : t < 16 ? 118 - 18 * ease.inOutSine((t - 10) / 6) : 100;
        const shrink = t > 34 ? 1 - ease.inBack((t - 34) / 12) : 1;
        // little bounce in time with the laugh
        const jig = 1 + 0.06 * Math.sin((t / HA) * TAU);
        const k2 = Math.max(0, grow * shrink * jig);
        return [k2, k2];
      }),
      r: series(n, (f) => (visible(f) ? p.rot + 6 * Math.sin((life(f) / HA) * TAU) : p.rot)),
    });
  });
  front.push(shapeLayer({ ind: 0, nm: 'HA', op: n, shapes: haGroups }));

  // Tears of joy: squirt from the outer corner of each eye on alternate fits.
  const drops = [];
  const shots = [
    { start: 10, side: 1 },
    { start: 22, side: -1 },
    { start: 70, side: -1 },
    { start: 82, side: 1 },
  ];
  shots.forEach((s, k) => {
    const life = (f) => {
      let t = f - s.start;
      if (t < 0) t += n;
      return t;
    };
    const dur = 30;
    const at = (f) => {
      const t = life(f);
      const f0 = (s.start + n) % n;
      const origin = G.apply(mats[f0].head, [s.side * (DIM.eye[0] + 22), DIM.eye[1] + 12]);
      const vx = s.side * 2.1;
      const vy = -2.6;
      return [origin[0] + vx * t, origin[1] + vy * t + 0.16 * t * t];
    };
    drops.push(
      gr(`Joy tear ${k + 1}`, tearShape(5.2), {
        p: series(n, (f) => at(life(f) < dur ? f : (s.start + dur) % n), 0.25),
        r: series(n, (f) => {
          const t = Math.min(life(f), dur);
          const vx = s.side * 2.1;
          const vy = -2.6 + 0.32 * t;
          return (Math.atan2(vx, -vy) * 180) / Math.PI;
        }),
        s: series(n, (f) => {
          const t = life(f);
          if (t >= dur) return [0, 0];
          const k2 = 100 * Math.min(1, t / 4) * (1 - Math.max(0, (t - 20) / 10));
          return [k2, k2];
        }),
      }),
    );
  });
  front.push(shapeLayer({ ind: 0, nm: 'Tears of joy', op: n, shapes: drops }));
  return { front };
}

export default { id: 'lol', name: 'LOL', frames: N, pose, layers, secondary: { stringGain: 0.8, earGain: 0.55 } };
