// "Cool" – Spectre in sunglasses, one hand on his hip, nodding to a beat; he pushes the
// shades up with a mitt, a glint flashes across the lenses and a sparkle pops.
// 2.5 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease } from '../lib/anim.mjs';
import { series, sh, st, fl, gr, shapeLayer } from '../lib/lottie.mjs';
import { DIM, PAL } from '../lib/spectre.mjs';
import { sparkleShape } from '../lib/fx.mjs';

const N = 150;
const BEAT = 37.5; // four nods per loop

// The right hand comes up to push the shades: 0 = on the hip, 1 = at the glasses.
const push = track([
  [0, 0, E.inOutSine],
  [34, 0, E.inOutCubic],
  [50, 1, E.inOutSine],
  [58, 1, E.inOutCubic],
  [76, 0, E.inOutSine],
  [N, 0],
]);
// The glasses ride up a little as the mitt pushes them.
const lift = track([
  [0, 0],
  [48, 0, E.outQuad],
  [53, -7, E.overshoot],
  [62, 0, E.inOutSine],
  [N, 0],
]);

// Joint angles (see armGeometry): elbow at (-141, -131), wrist at the hip (-118, -92).
const AKIMBO = { a1: 55, a2: -85, hand: 25 };
// Upper arm raised out, forearm across: the mitt's tip reaches the shades (-21, -257).
const PUSH = { a1: 150, a2: 93, hand: 0 };

function pose(f) {
  const nod = Math.sin((f / BEAT) * Math.PI * 2);
  const dip = Math.max(0, -nod);
  const p = push(f);
  const sway = Math.sin((f / N) * Math.PI * 2);
  return {
    root: { r: -1.5 + 0.8 * sway, sy: 1 - 0.01 * dip },
    body: { r: -2.5 + 1.2 * sway, x: 2 * sway },
    head: { r: 6 + 3 * nod - 4 * p, y: 3 * dip, x: 2 * sway },
    eyes: { open: 0.6 },
    ear: 6 * nod,
    // Left hand on the hip: elbow out to the side, forearm down and in, mitt on the hip.
    armL: { ...AKIMBO },
    // Right hand: hip -> up to the glasses and back (joint angles, so the elbow stays out).
    armR: {
      a1: AKIMBO.a1 + (PUSH.a1 - AKIMBO.a1) * p,
      a2: AKIMBO.a2 + (PUSH.a2 - AKIMBO.a2) * p,
      hand: AKIMBO.hand + (PUSH.hand - AKIMBO.hand) * p,
    },
  };
}

const LENS = '#2A2D48';
const RIM = '#ECEEFF';

// Sunglasses, in head space over the eyes: light frames so they read on the dark face.
function faceExtras(ctx) {
  const { S } = ctx;
  const [ex, ey] = DIM.eye;
  const lens = (side) =>
    G.smooth(
      [
        { p: [side * (ex - 42), ey - 28], k: 0.4 },
        { p: [side * (ex + 42), ey - 32], k: 0.4 },
        { p: [side * (ex + 36), ey + 18] },
        { p: [side * ex, ey + 32], dir: 180 },
        { p: [side * (ex - 34), ey + 16] },
      ],
      true,
    );
  const glint = (side, t) => {
    // A diagonal streak that slides across the lens while t goes 0 -> 1.
    const x = side * (ex - 30) + side * 60 * t;
    return G.poly([[x - 8, ey + 16], [x + 8, ey - 20]], false);
  };
  const glintT = (f) => G.clamp((f - 60) / 16);
  const glintOn = (f) => (f >= 60 && f <= 78 ? 100 : 0);
  return [
    gr(
      'Glasses',
      [
        gr('Glint R', [sh(S((P, f) => glint(1, glintT(f)), 0.3)), st('#FFFFFF', 7, { cap: 2, opacity: S((P, f) => glintOn(f)) })]),
        gr('Glint L', [sh(S((P, f) => glint(-1, G.clamp(glintT(f) - 0.25)), 0.3)), st('#FFFFFF', 7, { cap: 2, opacity: S((P, f) => glintOn(f + 4)) })]),
        gr('Shine', [
          sh(G.poly([[ex - 24, ey - 12], [ex - 8, ey - 20]], false)),
          sh(G.poly([[-ex - 24, ey - 12], [-ex - 8, ey - 20]], false)),
          sh(G.poly([[ex + 6, ey + 14], [ex + 20, ey + 6]], false)),
          sh(G.poly([[-ex + 6, ey + 14], [-ex + 20, ey + 6]], false)),
          st('#8C9EFF', 5, { cap: 2, opacity: 80 }),
        ]),
        gr('Bridge', [sh(G.smooth([{ p: [-ex + 42, ey - 24] }, { p: [0, ey - 30], dir: 0 }, { p: [ex - 42, ey - 24] }], false)), st(RIM, 8, { cap: 2 })]),
        gr('Lenses', [sh(lens(1)), sh(lens(-1)), st(RIM, 8), fl(LENS)]),
      ],
      { p: S((P, f) => [0, lift(f)]) },
    ),
  ];
}

function layers(ctx) {
  const n = ctx.N;
  const sp = (f, t0) => {
    const t = f - t0;
    if (t < 0 || t > 26) return 0;
    return ease.outBack(Math.min(1, t / 8), 2.4) * (1 - ease.inBack(G.clamp((t - 14) / 12)));
  };
  const sparkles = [
    [212, 96, 11, 66],
    [232, 76, 6, 72],
  ].map(([x, y, r, t0], k) =>
    gr(`Sparkle ${k + 1}`, sparkleShape(r), {
      p: [x, y],
      s: series(n, (f) => [100 * Math.max(0, sp(f, t0)), 100 * Math.max(0, sp(f, t0))]),
      r: series(n, (f) => 3 * G.clamp(f - t0, 0, 26)),
    }),
  );
  return { front: [shapeLayer({ ind: 0, nm: 'Sparkles', op: n, shapes: sparkles })] };
}

export default { id: 'cool', name: 'Cool', frames: N, pose, layers, faceExtras, armsInFront: true, secondary: { earGain: 0.7 } };
