// "Typing" – Spectre sits behind a laptop and mashes the keyboard with both mitts (no
// fingers, so it's all fists). The laptop hops and rocks with every slam and keys pop
// off. 2 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { E, ease, rng } from '../lib/anim.mjs';
import { series, sh, st, fl, gr, shapeLayer, gfRadial } from '../lib/lottie.mjs';
import { DIM, PAL } from '../lib/spectre.mjs';

const N = 120;
const CYCLE = 12; // frames per slam, per hand
const HALF = CYCLE / 2; // the hands alternate
const SLAMS = N / CYCLE; // per hand per loop
const SIT = 20; // how far Spectre sits down, sticker px

// Per-slam variety (indexed by slam number, so the loop repeats exactly).
const R = rng(11);
const VARY = Array.from({ length: SLAMS * 2 }, () => ({ h: 0.65 + R() * 0.4, x: (R() - 0.5) * 24 }));

/** One hand's slam cycle. u: 0..1. Returns lift 0 (on the keys) .. 1 (raised). */
function slamLift(u) {
  if (u < 0.12) return 0.12 * ease.outQuad(u / 0.12); // little rebound off the keys
  if (u < 0.62) return 0.12 + 0.88 * E.snappy((u - 0.12) / 0.5); // wind up
  if (u < 0.8) return 1 - ease.inQuad((u - 0.62) / 0.18); // slam
  return 0;
}

/** Slam state for one hand at frame f: lift and which slam it is. */
function hand(f, offset) {
  const t = (((f - offset) % N) + N) % N;
  const k = Math.floor(t / CYCLE);
  const u = (t % CYCLE) / CYCLE;
  // The next slam (the one being wound up) sets the height of this swing.
  const v = VARY[(k * 2 + (offset ? 1 : 0)) % VARY.length];
  return { lift: slamLift(u) * v.h, u, x: v.x };
}

/** Contact times (frames) of every slam in a loop, for the laptop's reaction. */
const CONTACTS = [];
for (let k = 0; k < SLAMS; k++) {
  CONTACTS.push({ t: k * CYCLE + 0.8 * CYCLE, side: -1, h: VARY[(k * 2) % VARY.length].h });
  CONTACTS.push({ t: k * CYCLE + 0.8 * CYCLE + HALF, side: 1, h: VARY[(k * 2 + 1) % VARY.length].h });
}

/** Sum of decaying impulses from recent slams, wrapped around the loop. */
function impulse(f, shape) {
  let out = 0;
  for (const c of CONTACTS) {
    for (const wrap of [0, -N]) {
      const dt = f - (c.t + wrap);
      if (dt >= 0 && dt < 30) out += shape(dt, c);
    }
  }
  return out;
}

// Laptop: a hop (up, px), a rock toward the slammed side (deg) and a squash.
const hop = (f) => impulse(f, (dt, c) => c.h * 2.4 * Math.sin(Math.min(dt / 5, 1) * Math.PI) * (dt < 5 ? 1 : 0));
const rock = (f) => impulse(f, (dt, c) => c.side * c.h * 2.2 * Math.exp(-dt / 5) * Math.cos(dt * 0.7));
const squish = (f) => impulse(f, (dt, c) => c.h * 0.05 * Math.exp(-dt / 2.5));

function pose(f) {
  const L = hand(f, 0);
  const Rh = hand(f, HALF);
  // The body leans into whichever hand is slamming.
  const lean = (Rh.lift - L.lift) * 2.4;
  const bob = impulse(f, (dt, c) => c.h * Math.exp(-dt / 4) * Math.sin(Math.min(1, dt / 3) * Math.PI * 0.5));
  const target = (h, side) => {
    // Canonical left-arm space (body space, x mirrored for the right arm).
    const x = -116 - 22 * h.lift + h.x * 0.6;
    const y = -100 - 98 * h.lift;
    return [x, y];
  };
  return {
    root: { y: DIM.ground + SIT, sy: 1 - 0.018 * bob, sx: 1 + 0.012 * bob },
    body: { r: lean, y: 3 * bob },
    head: { r: -lean * 1.4, y: 6 + 3 * bob, x: 0 },
    eyes: { angry: 0.62, open: 0.86, y: 4 },
    armL: { ik: { target: target(L, -1), bend: -1 }, hand: -10 + 10 * L.lift },
    armR: { ik: { target: target(Rh, 1), bend: -1 }, hand: -10 + 10 * Rh.lift },
    // Sitting cross-legged: the legs fold up and the boots poke out either side of the laptop.
    legL: { y: -14, x: -64, r: 42 },
    legR: { y: -14, x: 64, r: -42 },
    shadow: { s: 1.35, o: 1 },
  };
}

// The screen's light on Spectre's face.
function faceExtras() {
  return [
    gr('Screen glow', [
      sh(G.ellipse(0, 0, 100, 100)),
      gfRadial(
        [
          [0, '#9FE7FF', 0.24],
          [0.6, '#6FB8FF', 0.08],
          [1, '#5B8CFF', 0],
        ],
        { end: [100, 0] },
      ),
    ], { p: [0, 20], s: [100, 45] }),
  ];
}

const LAP = { w: 156, lidH: 60, baseH: 10, x: 160, y: 310 };
const LAPTOP = {
  lid: '#7C82B0',
  lidLight: '#9399C6',
  lidShade: '#666C9A',
  base: '#565B86',
  baseLight: '#6C72A0',
  glow: '#9FE7FF',
};

function laptopShapes() {
  const { w, lidH, baseH } = LAP;
  const lid = G.roundRect(0, -baseH - lidH / 2 + 2, w, lidH, 11);
  const lidLit = G.roundRect(-6, -baseH - lidH / 2 - 2, w - 26, lidH - 18, 8);
  const base = G.roundRect(0, -baseH / 2, w + 14, baseH, 5);
  // Spectre's own face as the logo on the back of the lid.
  const logo = [
    gr('Logo eyes', [sh(G.roundRect(-7, 0, 6, 13, 3)), sh(G.roundRect(7, 0, 6, 13, 3)), fl('#FFFFFF')]),
    gr('Logo hood', [sh(G.smooth([{ p: [0, -17], dir: 0 }, { p: [16, -4] }, { p: [13, 14], k: 0.6 }, { p: [0, 17], dir: 180 }, { p: [-13, 14], k: 0.6 }, { p: [-16, -4] }], true)), fl(PAL.void)]),
    gr('Logo rim', [sh(G.smooth([{ p: [0, -22], dir: 0 }, { p: [21, -5] }, { p: [17, 18], k: 0.6 }, { p: [0, 21], dir: 180 }, { p: [-17, 18], k: 0.6 }, { p: [-21, -5] }], true)), fl('#D4D5F1')]),
  ];
  return [
    gr('Logo', logo, { p: [0, -baseH - lidH / 2 + 2] }),
    gr('Lid glint', [
      sh(G.smooth([{ p: [-w / 2 + 14, -baseH - lidH + 30] }, { p: [-w / 2 + 16, -baseH - lidH + 16] }, { p: [-w / 2 + 28, -baseH - lidH + 10] }], false)),
      st('#C9CDF0', 3.2, { cap: 2 }),
    ]),
    gr('Lid outline', [sh(lid), st(PAL.line, 3.6)]),
    gr('Lid lit', [sh(lidLit), fl(LAPTOP.lidLight)]),
    gr('Lid', [sh(lid), fl(LAPTOP.lid)]),
    gr('Base outline', [sh(base), st(PAL.line, 3.6)]),
    gr('Base light', [sh(G.roundRect(0, -baseH / 2 - 2, w + 4, 3, 1.5)), fl(LAPTOP.baseLight)]),
    gr('Base', [sh(base), fl(LAPTOP.base)]),
    // Light from the screen spilling over the top of the lid.
    gr('Spill', [
      sh(G.ellipse(0, 0, w * 0.55, 20)),
      gfRadial(
        [
          [0, LAPTOP.glow, 0.55],
          [0.6, LAPTOP.glow, 0.18],
          [1, LAPTOP.glow, 0],
        ],
        { end: [w * 0.55, 0] },
      ),
    ], { p: [0, -baseH - lidH + 2], s: [100, 100] }),
  ];
}

/** A keycap that pops off and tumbles away. */
function keycap(size, colour) {
  return [
    gr('Mark', [sh(G.roundRect(0, -size * 0.12, size * 0.32, size * 0.08, size * 0.04)), fl(PAL.line, 70)]),
    gr('Top', [sh(G.roundRect(0, -size * 0.1, size * 0.72, size * 0.62, size * 0.14)), fl(colour)]),
    gr('Cap', [sh(G.roundRect(0, 0, size, size * 0.92, size * 0.2)), st(PAL.line, 2.6), fl('#B9BCE0')]),
  ];
}

function layers(ctx) {
  const n = ctx.N;
  const lapKs = {
    a: [LAP.x, LAP.y],
    p: series(n, (f) => [LAP.x, LAP.y - hop(f)], 0.2),
    r: series(n, (f) => rock(f), 0.1),
    s: series(n, (f) => [100 * (1 + squish(f) * 0.6), 100 * (1 - squish(f))], 0.2),
  };
  const laptop = shapeLayer({
    ind: 0,
    nm: 'Laptop',
    op: n,
    ks: lapKs,
    shapes: [gr('Laptop', laptopShapes(), { p: [LAP.x, LAP.y] })],
  });

  // Keys fly off on some slams.
  const rand = rng(5);
  const lidTop = LAP.y - LAP.baseH - LAP.lidH;
  const keys = [];
  CONTACTS.forEach((c, k) => {
    if (k % 3 !== 1) return;
    const t0 = c.t;
    const vx = c.side * (1.3 + rand() * 1.4);
    const vy = -(3.6 + rand() * 1.6);
    const spin = (rand() - 0.5) * 30;
    const x0 = LAP.x + c.side * (26 + rand() * 26);
    const dur = 34;
    const life = (f) => (((f - t0) % n) + n) % n;
    keys.push(
      gr(`Key ${keys.length + 1}`, keycap(15, ['#FFFFFF', '#FFE27A', '#9FE7FF'][keys.length % 3]), {
        p: series(n, (f) => {
          const t = Math.min(life(f), dur);
          return [x0 + vx * t, lidTop + 6 + vy * t + 0.19 * t * t];
        }, 0.25),
        r: series(n, (f) => spin * Math.min(life(f), dur) * 0.5, 0.5),
        s: series(n, (f) => {
          const t = life(f);
          if (t >= dur) return [0, 0];
          const k2 = 100 * ease.outBack(Math.min(1, t / 5), 2) * (1 - ease.inQuad(G.clamp((t - 24) / 10)));
          return [k2, k2];
        }),
      }),
    );
  });

  // Impact ticks at the top of the lid: one set per hand, flashing on each of its slams.
  const ticks = [-1, 1].map((side) => {
    const mine = CONTACTS.filter((c) => c.side === side);
    const flash = (f) => {
      let k2 = 0;
      for (const c of mine) {
        for (const wrap of [0, -n]) {
          const t = f - (c.t + wrap);
          if (t >= 0 && t < 9) k2 = Math.max(k2, c.h * ease.outQuad(Math.min(1, t / 3)) * (1 - ease.inQuad(G.clamp((t - 4) / 5))));
        }
      }
      return k2;
    };
    return gr(
      side < 0 ? 'Ticks L' : 'Ticks R',
      [-1, 0, 1].map((j) =>
        gr(`Line ${j + 2}`, [sh(G.poly([[0, 0], [0, -9]], false)), st(PAL.line, 3.2, { cap: 2 })], {
          p: [j * 10 * side, Math.abs(j) * 3],
          r: j * 26 * side,
        }),
      ),
      {
        p: [LAP.x + side * 58, lidTop - 6],
        s: series(n, (f) => [100 * flash(f), 100 * flash(f)]),
      },
    );
  });

  return {
    front: [
      shapeLayer({ ind: 0, nm: 'Keys', op: n, shapes: keys }),
      shapeLayer({ ind: 0, nm: 'Impact ticks', op: n, shapes: ticks }),
      laptop,
    ],
  };
}

export default { id: 'typing', name: 'Typing', frames: N, pose, layers, faceExtras, ground: DIM.ground + 4, secondary: { earGain: 0.45, stringGain: 0.5 }, armsInFront: true };
