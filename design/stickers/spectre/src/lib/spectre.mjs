// Spectre's 2D rig, built from shapes traced off the front turnaround (tools/trace_reference.py).
//
// All geometry is in reference pixels (the turnaround's front view); the root layer
// scales it to the 320 x 320 sticker. Spaces:
//   root – origin on the ground between the boots; squash and stretch happen here
//   body – origin at the hem (hip pivot); torso, arms
//   head – origin at the neck pivot (bottom of the face opening); hood, face, eyes
// Lottie layers mirror this hierarchy through parenting, so most motion is transform
// keyframes; only the ear flex, sleeves and drawstrings carry path keyframes.

import * as G from './geom.mjs';
import { springLoop } from './anim.mjs';
import { series, sh, fl, st, gr, gfRadial, shapeLayer, nullLayer, composition } from './lottie.mjs';
import TR from './shapes.mjs';

export const SCALE = 0.43; // reference px -> sticker px
export const PX = 1 / SCALE; // one sticker pixel in reference units
export const LINE = 3.6 * PX;
export const SEAM = 2.2 * PX;

export const PAL = {
  line: '#262842',
  hoodLight: '#D4D5F1',
  hood: '#C0C2E6',
  hoodShade: '#A7AAD2',
  hoodDeep: '#8E92BD',
  hoodDeeper: '#767CA6',
  pocket: '#9DA0CB',
  void: '#181A29',
  eye: '#FFFFFF',
  navy: '#2D3047',
  navyShade: '#24263A',
  navyLight: '#3C405E',
  navyHi: '#596089',
  string: '#F1F2FC',
  stringShade: '#CDD0EA',
  tear: '#8FDDFF',
  tearHi: '#E9FAFF',
  blush: '#FF8FBF',
  heart: '#FF5A8F',
  heartShade: '#E23C72',
  heartHi: '#FFC3D6',
  shadow: '#1B1D33',
};

const CX = 329; // body centre line in the reference
const REF = { root: [CX, 604], hip: [CX, 490], neck: [CX, 300] };
const local = (p, o) => [p[0] - o[0], p[1] - o[1]];

/** Smooth closed path through traced points expressed in a local space. corners: [[x, y, k], ...] in ref px. */
function traced(points, origin, corners = []) {
  const pts = points.map((p) => ({ p: local(p, origin) }));
  for (const c of corners) {
    const target = local(c, origin);
    let best = 0;
    let bd = Infinity;
    pts.forEach((q, i) => {
      const d = G.len(G.sub(q.p, target));
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    pts[best].k = c[2] ?? 0.3;
  }
  return G.smooth(pts, true);
}

export const DIM = {
  ground: 300, // comp-space y of the ground line
  centreX: 160,
  hip: [0, -114], // hip pivot in root space
  neck: [0, -190], // neck pivot in body space
  shoulder: [-100, -160], // left shoulder in body space (the right arm mirrors it)
  l1: 50,
  l2: 45,
  // Sleeves are tapered tubes, as thick as the cuff at the wrist (see the T-pose turnaround).
  sleeve0: 84, // width at the shoulder
  sleeve1: 74, // width at the wrist
  eye: [50.5, -77.5], // right eye centre in head space
  eyeW: 31,
  eyeH: 74,
  cordX: 33,
  cordTop: 4,
  cordLen: 60,
  legHip: [-58, -120], // left leg pivot in root space
};

// ---------------------------------------------------------------------------
// Static traced geometry

const V_TIP = [CX, 323, 0.25];
const HEAD = {
  hood: traced(TR.hood, REF.neck, [V_TIP]),
  void: traced(TR.void, REF.neck, [[CX, 315, 0.35]]),
  voidOut: traced(TR.voidOut, REF.neck, [[CX, 325, 0.5]]),
  rimOuter: traced(TR.rimOuter, REF.neck, [[CX, 333, 0.5]]),
  drapeL: traced(TR.drapeL, REF.neck),
  drapeR: traced(TR.drapeR, REF.neck),
  light: TR.hoodLight.map((r) => [r.outer, ...r.holes].map((c) => traced(c, REF.neck))),
  shade: TR.hoodShade.map((r) => [r.outer, ...r.holes].map((c) => traced(c, REF.neck))),
  deep: TR.hoodDeep.map((r) => [r.outer, ...r.holes].map((c) => traced(c, REF.neck))),
};

/** Flop the ear (part of the hood outline) about its base; only points beyond the base move. */
function earDeform(path, bend) {
  if (!bend) return path;
  const w = (p) => {
    const d = G.sub(p, EAR_BASE_A);
    const out = d[0] * EAR_NORMAL[0] + d[1] * EAR_NORMAL[1];
    return G.clamp((out + 4) / 52, 0, 1);
  };
  return G.mapPath(path, (p) => {
    const k = w(p);
    return k ? G.rotAbout(p, EAR_PIVOT, bend * k * k * (3 - 2 * k)) : p;
  });
}

// The ear's base runs from where it leaves the dome to where the hood's side resumes.
const EAR_BASE_A = local([431, 60], REF.neck);
const EAR_BASE_B = local([483, 172], REF.neck);
const EAR_PIVOT = G.lerp2(EAR_BASE_A, EAR_BASE_B, 0.5);
const EAR_NORMAL = (() => {
  const b = G.norm(G.sub(EAR_BASE_B, EAR_BASE_A));
  return [b[1], -b[0]]; // points from the base towards the tip
})();

/** Sub-path of a closed path from vertex a to vertex b (inclusive, wrapping), as an open path. */
function subPath(path, a, b) {
  const n = path.v.length;
  const idx = [];
  for (let k = a; ; k = (k + 1) % n) {
    idx.push(k);
    if (k === b) break;
  }
  return {
    v: idx.map((k) => path.v[k]),
    i: idx.map((k, j) => (j === 0 ? [0, 0] : path.i[k])),
    o: idx.map((k, j) => (j === idx.length - 1 ? [0, 0] : path.o[k])),
    c: false,
  };
}

function nearestVertex(path, p) {
  let best = 0;
  let bd = Infinity;
  path.v.forEach((q, k) => {
    const d = G.len(G.sub(q, p));
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}

/** Hood split into a static dome (ear cut off along its base) and the ear itself, which can flop. */
const HOOD_PARTS = (() => {
  const hood = HEAD.hood;
  const ia = nearestVertex(hood, EAR_BASE_A);
  const ib = nearestVertex(hood, EAR_BASE_B);
  // The traced contour may run either way round; the ear is the shorter arc between the bases.
  const n = hood.v.length;
  const fwd = (ib - ia + n) % n;
  const [s0, s1] = fwd <= n / 2 ? [ia, ib] : [ib, ia];
  const ear = subPath(hood, s0, s1);
  const dome = subPath(hood, s1, s0);
  const domeClosed = { ...dome, c: true };
  const inward = G.mul(EAR_NORMAL, -34);
  const A = ear.v[0];
  const B = ear.v[ear.v.length - 1];
  const earClosed = {
    v: [...ear.v, G.add(B, inward), G.add(A, inward)],
    i: [...ear.i, [0, 0], [0, 0]],
    o: [...ear.o, [0, 0], [0, 0]],
    c: true,
  };
  return { ear, dome, domeClosed, earClosed };
})();

function mirrorHalf(half) {
  const pts = [...half];
  for (let k = half.length - 2; k >= 1; k--) {
    const q = { ...half[k], p: [-half[k].p[0], half[k].p[1]] };
    if (q.dir !== undefined) q.dir = -q.dir;
    pts.push(q);
  }
  return pts;
}

function torsoOutline() {
  return G.smooth(
    mirrorHalf([
      { p: [0, -198], dir: 0 },
      { p: [58, -194] },
      { p: [86, -168] },
      { p: [96, -112] },
      { p: [106, -66] },
      { p: [114, -34] },
      { p: [119, -14], k: 0.8 },
      { p: [111, 2], k: 0.55 },
      { p: [0, 4], dir: 180 },
    ]),
    true,
  );
}

function pocketOutline() {
  return G.smooth(
    mirrorHalf([
      { p: [0, -90], dir: 0 },
      { p: [44, -89.5] },
      { p: [57, -84], k: 0.55 },
      { p: [63, -70] },
      { p: [81, -33] },
      { p: [80, -25], k: 0.5 },
      { p: [70, -22] },
      { p: [0, -21.5], dir: 180 },
    ]),
    true,
  );
}

// Left leg and boot in root space; the top extends up under the hem so the body can stretch.
const LEG = (() => {
  const pts = TR.leg.map((p) => {
    const q = local(p, REF.root);
    if (q[1] < -100) q[1] -= 56;
    return { p: q };
  });
  return G.smooth(pts, true);
})();

// Hand pieces traced from the T-pose left hand, re-oriented so +y runs along the arm from the wrist.
const WRIST_REF = [122, 343];
// The traced hand is drawn at 0.76 of its traced size so the cuff matches the sleeve's
// width and the mitts sit in the turnaround's proportions (about a third of the chest).
export const HAND_SCALE = 0.76;
const toHand = (p) => G.mul(G.rot(local(p, WRIST_REF), -90), HAND_SCALE);
const CUFF = G.smooth(TR.cuff.map((p) => ({ p: toHand(p) })), true);
const MITT = G.smooth(TR.mitt.map((p) => ({ p: toHand(p) })), true);
/** Distance from the wrist to the tip of the mitt. */
export const HAND_LEN = 95 * HAND_SCALE;

// ---------------------------------------------------------------------------
// Pose

export function rest() {
  return {
    root: { x: DIM.centreX, y: DIM.ground, r: 0, sx: 1, sy: 1 },
    body: { x: 0, y: 0, r: 0, sx: 1, sy: 1 },
    head: { x: 0, y: 0, r: 0, sx: 1, sy: 1 },
    ear: 0,
    eyes: { x: 0, y: 0, open: 1, happy: 0, droop: 0, angry: 0, laugh: 0, heart: 0, sx: 1, sy: 1, glow: 1, blush: 0 },
    armL: { a1: 44, a2: -16, hand: 0, hs: 1, ik: null },
    armR: { a1: 44, a2: -16, hand: 0, hs: 1, ik: null },
    legL: { x: 0, y: 0, r: 0 },
    legR: { x: 0, y: 0, r: 0 },
    shadow: { s: 1, o: 1 },
    strings: {},
  };
}

function merge(base, over) {
  if (!over) return base;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') merge(base[k], v);
    else base[k] = v;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Arms (canonical left arm; the right arm layer mirrors x)

const adir = (deg) => [-Math.sin(deg * G.DEG), Math.cos(deg * G.DEG)]; // 0 = down, + = outward (left)

/** Two-bone IK in left-arm space: angles that put the wrist on target. */
export function armIK(target, bend = 1) {
  const S = DIM.shoulder;
  const { l1, l2 } = DIM;
  const v = G.sub(target, S);
  const d = G.clamp(G.len(v), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const phi = Math.atan2(-v[0], v[1]) / G.DEG;
  const alpha = Math.acos(G.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) / G.DEG;
  const gamma = Math.acos(G.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1)) / G.DEG;
  return { a1: phi + bend * alpha, a2: -bend * (180 - gamma) };
}

export function armGeometry(arm) {
  let { a1, a2 } = arm;
  if (arm.ik) ({ a1, a2 } = armIK(arm.ik.target, arm.ik.bend ?? 1));
  const S = DIM.shoulder;
  const d1 = adir(a1);
  const d2 = adir(a1 + a2);
  const l1 = DIM.l1 * (arm.stretch ?? 1);
  const l2 = DIM.l2 * (arm.stretch ?? 1);
  const E = G.add(S, G.mul(d1, l1));
  const W = G.add(E, G.mul(d2, l2));
  const tE = G.norm(G.add(d1, d2));
  return {
    path: {
      v: [S, E, W],
      i: [[0, 0], G.mul(tE, -l1 * 0.42), G.mul(d2, -l2 * 0.4)],
      o: [G.mul(d1, l1 * 0.42), G.mul(tE, l2 * 0.42), [0, 0]],
      c: false,
    },
    wrist: W,
    angle: a1 + a2 + (arm.hand ?? 0),
    a1,
  };
}

/** Point, first and second derivative of a cubic Bezier at t. */
function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const pt = [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
  const d = [0, 1].map((k) => 3 * u * u * (p1[k] - p0[k]) + 6 * u * t * (p2[k] - p1[k]) + 3 * t * t * (p3[k] - p2[k]));
  const dd = [0, 1].map((k) => 6 * u * (p2[k] - 2 * p1[k] + p0[k]) + 6 * t * (p3[k] - 2 * p2[k] + p1[k]));
  return { pt, d, dd };
}

const SLEEVE_T = [0, 0.5, 1];

/**
 * The sleeve as a tapered tube around the arm's centreline (shoulder -> elbow -> wrist).
 * Returns the closed outline, the open edge for the ink line (no line across the shoulder,
 * where the sleeve grows out of the torso) and a narrower lit band. On the inside of a
 * bend the offset is limited by the bend's radius, so a sharp elbow makes a crease
 * instead of folding over itself. Vertex counts never change, so the paths animate.
 */
export function sleeveShapes(geo, scale = 1) {
  const [S, E, W] = geo.path.v;
  const segs = [
    [S, G.add(S, geo.path.o[0]), G.add(E, geo.path.i[1]), E],
    [E, G.add(E, geo.path.o[1]), G.add(W, geo.path.i[2]), W],
  ];
  const samples = [];
  segs.forEach((seg, k) => {
    for (const t of SLEEVE_T) {
      if (k === 1 && t === 0) continue;
      samples.push(cubicAt(...seg, t));
    }
  });
  const n = samples.length;
  const side = (frac, widthAt, shift = 0) =>
    samples.map((q, k) => {
      const u = k / (n - 1);
      const len = Math.max(1e-6, G.len(q.d));
      const tan = G.mul(q.d, 1 / len);
      const nrm = [-tan[1], tan[0]];
      const cross = q.d[0] * q.dd[1] - q.d[1] * q.dd[0];
      const radius = Math.abs(cross) > 1e-6 ? (len * len * len) / Math.abs(cross) : Infinity;
      const half = (widthAt(u) / 2) * scale;
      const concave = Math.sign(cross) === Math.sign(frac);
      const off = concave ? Math.min(half, radius * 0.92) : half;
      return G.add(q.pt, G.mul(nrm, frac * off + shift * half));
    });
  const width = (u) => G.lerp(DIM.sleeve0, DIM.sleeve1, u);
  const left = side(1, width);
  const right = side(-1, width);
  const tW = G.norm(samples[n - 1].d);
  const tS = G.norm(samples[0].d);
  const capW = G.add(W, G.mul(tW, DIM.sleeve1 * 0.32 * scale));
  const capS = G.sub(S, G.mul(tS, DIM.sleeve0 * 0.3 * scale));
  const pts = (arr) => arr.map((p) => ({ p }));
  const outline = G.smooth([...pts(left), { p: capW }, ...pts([...right].reverse()), { p: capS }], true);
  const edge = G.smooth([...pts(left), { p: capW }, ...pts([...right].reverse())], false);
  // Lit band: the inner (body) side of the sleeve catches the light; the outer edge is in shade.
  const litW = (u) => width(u) * 0.62;
  const lit = G.smooth(
    [...pts(side(1, litW, -0.34)), { p: G.add(W, G.mul(tW, DIM.sleeve1 * 0.1)) }, ...pts([...side(-1, litW, -0.34)].reverse()), { p: capS }],
    true,
  );
  return { outline, edge, lit };
}

// ---------------------------------------------------------------------------
// Build

/**
 * def = { id, name, frames, pose(f), armsBehind?: { l, r }, layers?(ctx), faceExtras?(ctx), secondary? }
 */
export function buildSticker(def) {
  const N = def.frames;
  const poses = [];
  for (let f = 0; f <= N; f++) poses.push(merge(rest(), def.pose(f)));
  checkSeam(def, poses[0], poses[N]);

  const mats = poses.map((P) => {
    const root = G.layerMat({ p: [P.root.x, P.root.y], r: P.root.r, s: [P.root.sx * SCALE, P.root.sy * SCALE] });
    const body = G.matMul(
      root,
      G.layerMat({ p: [DIM.hip[0] + P.body.x, DIM.hip[1] + P.body.y], r: P.body.r, s: [P.body.sx, P.body.sy] }),
    );
    const head = G.matMul(
      body,
      G.layerMat({ p: [DIM.neck[0] + P.head.x, DIM.neck[1] + P.head.y], r: P.head.r, s: [P.head.sx, P.head.sy] }),
    );
    return { root, body, head };
  });

  secondary(def, poses, mats, N);

  const S = (fn, tol) => series(N, (f) => fn(poses[f], f), tol);
  const ctx = { N, poses, mats, S, PAL, LINE, DIM, SCALE, PX };

  const IND = { root: 1, body: 2, head: 3 };
  const rootLayer = nullLayer({
    ind: IND.root,
    nm: 'Spectre',
    op: N,
    ks: {
      p: S((P) => [P.root.x, P.root.y]),
      r: S((P) => P.root.r),
      s: S((P) => [P.root.sx * SCALE * 100, P.root.sy * SCALE * 100]),
    },
  });

  const bodyLayer = shapeLayer({
    ind: IND.body,
    nm: 'Torso',
    parent: IND.root,
    op: N,
    ks: {
      p: S((P) => [DIM.hip[0] + P.body.x, DIM.hip[1] + P.body.y]),
      r: S((P) => P.body.r),
      s: S((P) => [P.body.sx * 100, P.body.sy * 100]),
    },
    shapes: torsoShapes(),
  });

  const headLayer = shapeLayer({
    ind: IND.head,
    nm: 'Head',
    parent: IND.body,
    op: N,
    ks: {
      p: S((P) => [DIM.neck[0] + P.head.x, DIM.neck[1] + P.head.y]),
      r: S((P) => P.head.r),
      s: S((P) => [P.head.sx * 100, P.head.sy * 100]),
    },
    shapes: headShapes(ctx, def),
  });

  const stringsLayer = shapeLayer({
    ind: 4,
    nm: 'Drawstrings',
    parent: IND.head,
    op: N,
    shapes: [cordShape(ctx, 1), cordShape(ctx, -1)],
  });

  const armLayer = (side, ind) =>
    shapeLayer({
      ind,
      nm: side < 0 ? 'Arm L' : 'Arm R',
      parent: IND.body,
      op: N,
      ks: { s: [side < 0 ? 100 : -100, 100] },
      // An invisible box widens the layer's bounding box: SVG masks default to the object
      // bounding box, which ignores stroke width and would clip the thick sleeves.
      shapes: [...armShapes(ctx, side), gr('Bounds', [sh(G.roundRect(0, -150, 900, 900, 0)), fl('#000000', 0)])],
    });
  const armL = armLayer(-1, 5);
  const armR = armLayer(1, 6);
  // Each arm sits over the head but is matted out where it overlaps the hood's drape corner,
  // so a sleeve tucks under the hood at the shoulder and passes in front of it when raised.
  // As an arm lifts, the drape hole shrinks down to the hood's hem so the raised sleeve
  // comes out in front of the hood instead of being tucked under it.
  const drapeMatte = (side, ind) => {
    const key = side < 0 ? 'armL' : 'armR';
    const base = side < 0 ? HEAD.drapeL : HEAD.drapeR;
    const lift = (P) => {
      // How high the mitt tip is above the shoulder decides whether the arm is in front.
      // A raised upper arm or a mitt held above the shoulder means the arm is in front.
      const g = armGeometry(P[key]);
      const tip = G.add(g.wrist, G.rot([0, HAND_LEN], g.angle));
      let t = Math.max(G.clamp((-tip[1] - 150) / 46), G.clamp((g.a1 - 70) / 24));
      t = t * t * (3 - 2 * t);
      return t < 0.02 ? 0 : t > 0.98 ? 1 : t; // snap the ends so a resting matte stays static
    };
    // def.armsInFront: the arms stay in front of the hood for the whole loop (a static matte).
    const front = def.armsInFront;
    const anyLift = !front && poses.some((P) => lift(P) > 0.001);
    const hole = front
      ? G.scalePath(base, 0.001, 0.001, [side * 96, 14])
      : anyLift
        ? S((P) => G.scalePath(base, 1 - lift(P), 1 - lift(P), [side * 96, 14]))
        : base;
    return shapeLayer({
      ind,
      nm: side < 0 ? 'Drape matte L' : 'Drape matte R',
      parent: IND.head,
      op: N,
      td: 1,
      // Everything except the drape corner (even-odd), used as a plain alpha matte.
      shapes: [gr('Visible', [sh(G.roundRect(0, 0, 1600, 1600, 0)), sh(hole), fl('#000000', 100, 2)])],
    });
  };
  armL.tt = 1;
  armR.tt = 1;

  const legsLayer = shapeLayer({ ind: 7, nm: 'Legs', parent: IND.root, op: N, shapes: legShapes(ctx) });

  const shadowLayer = shapeLayer({
    ind: 8,
    nm: 'Shadow',
    op: N,
    ks: {
      p: S((P) => [P.root.x, (def.ground ?? DIM.ground) + 1]),
      s: S((P) => [P.shadow.s * 100, P.shadow.s * 100]),
      o: S((P) => P.shadow.o * 100),
    },
    shapes: [gr('Shadow', [sh(G.ellipse(0, 0, 62, 7.5)), fl(PAL.shadow, 18)])],
  });

  const extra = def.layers ? def.layers(ctx) : {};
  let ind = 20;
  const reindex = (L) => {
    L.ind = ind++;
    return L;
  };
  const front = (extra.front || []).map(reindex);
  const props = (extra.props || []).map(reindex);
  const back = (extra.back || []).map(reindex);

  const layers = [
    ...front,
    drapeMatte(1, 9),
    armR,
    drapeMatte(-1, 10),
    armL,
    headLayer,
    ...props,
    stringsLayer,
    bodyLayer,
    legsLayer,
    shadowLayer,
    ...back,
    rootLayer,
  ];

  return composition({
    nm: `Spectre – ${def.name}`,
    op: N,
    layers,
    meta: { g: 'Disband sticker generator', a: 'Disband', d: `Spectre sticker: ${def.name}` },
  });
}

// ---------------------------------------------------------------------------
// Secondary motion: drawstring swing and ear follow-through, simulated to a steady loop.

function secondary(def, poses, mats, N) {
  const opts = def.secondary || {};
  const at = (arr, t) => {
    const f0 = Math.floor(t);
    const u = t - f0;
    const a = arr[((f0 % N) + N) % N];
    const b = arr[(((f0 + 1) % N) + N) % N];
    return a + (b - a) * u;
  };
  const ex = [];
  const ey = [];
  const hr = [];
  for (let f = 0; f <= N; f++) {
    const m = mats[f].head;
    const p = G.apply(m, [0, 0]);
    ex.push(p[0]);
    ey.push(p[1]);
    hr.push(G.matAngle(m));
  }
  const acc = (arr) => (t) => at(arr, t + 1) - 2 * at(arr, t) + at(arr, t - 1);
  const ax = acc(ex);
  const ay = acc(ey);
  const ar = acc(hr);

  // Drawstrings: pendulums (~0.5 s period, light damping, kept off the 20-frame rhythm of
  // most actions so they don't resonate) driven by the eyelets' sideways acceleration.
  const gain = opts.stringGain ?? 1;
  const sw = springLoop(N, (t) => ({ target: 0, force: (-ax(t) / 26) * gain }), {
    stiffness: 0.044,
    damping: 0.105,
  });
  // Ear: soft fabric that lags the head. + bend = droop (tip clockwise on screen), so it
  // swings down when the head accelerates up, and against the head's spin and sideways moves.
  const earGain = opts.earGain ?? 1;
  const ear = springLoop(
    N,
    (t) => ({ target: 0, force: (-(ay(t) / 30) * 1.2 - ar(t) * G.DEG * 2 - (ax(t) / 30) * 0.8) * earGain }),
    { stiffness: 0.27, damping: 0.31 },
  );
  for (let f = 0; f <= N; f++) {
    poses[f].strings.world = 40 * Math.tanh(sw[f] / G.DEG / 40); // soft limit, no hard stops
    poses[f].strings.headAngle = hr[f];
    poses[f].earSim = opts.ears === false ? 0 : 16 * Math.tanh(ear[f] / G.DEG / 16);
  }
}

// ---------------------------------------------------------------------------
// Parts

function torsoShapes() {
  const torso = torsoOutline();
  const lit = G.translatePath(G.scalePath(torso, 0.86, 0.95, [10, -100]), [7, 0]);
  const hoodShadow = G.smooth(
    [
      { p: [-96, -196] },
      { p: [96, -196] },
      { p: [92, -160] },
      { p: [40, -150], k: 1 },
      { p: [0, -146], dir: 180 },
      { p: [-40, -150] },
      { p: [-92, -160] },
    ],
    true,
  );
  return [
    gr('Hem crease', [
      sh(G.smooth([{ p: [-116, -25] }, { p: [0, -23], dir: 0 }, { p: [116, -25] }], false)),
      st(PAL.hoodDeep, SEAM, { cap: 2 }),
    ]),
    gr('Pocket', [sh(pocketOutline()), st(PAL.hoodDeep, SEAM), fl(PAL.pocket)]),
    gr('Outline', [sh(torso), st(PAL.line, LINE)]),
    gr('Hood shadow', [sh(hoodShadow), fl(PAL.hoodShade)]),
    gr('Lit', [sh(lit), fl(PAL.hood)]),
    gr('Base', [sh(torso), fl(PAL.hoodShade)]),
  ];
}

function headShapes(ctx, def) {
  const { S } = ctx;
  const bendOf = (P) => P.ear + (P.earSim || 0);
  const anyBend = ctx.poses.some((P) => Math.abs(bendOf(P)) > 0.01);
  // Ear follow-through is soft secondary motion: a looser (still sub-pixel) key tolerance.
  const deform = (path) => (anyBend ? S((P) => earDeform(path, bendOf(P)), 0.5) : path);
  // Only the ear and the tone patches on it animate; everything else stays static.
  const onEar = (path) => path.v.reduce((acc, p) => acc + (p[0] > EAR_PIVOT[0] - 20 ? 1 : 0), 0) > path.v.length / 2;
  const tone = (nm, paths, colour) =>
    gr(nm, [...paths.map((p) => sh(onEar(p) ? deform(p) : p)), fl(colour, 100, paths.length > 1 ? 2 : 1)]);

  const shapes = [];
  shapes.push(
    gr('V seam', [
      sh(G.smooth([{ p: [0, 21] }, { p: [-9, 6] }, { p: [-24, -2] }], false)),
      st(PAL.hoodDeep, SEAM, { cap: 2 }),
    ]),
    gr('Ear outline', [sh(deform(HOOD_PARTS.ear)), st(PAL.line, LINE)]),
    gr('Dome outline', [sh(HOOD_PARTS.dome), st(PAL.line, LINE)]),
    gr('Rim crease', [sh(HEAD.rimOuter), st(PAL.hoodShade, SEAM * 1.1, { opacity: 85 })]),
    gr('Inner band', [sh(HEAD.voidOut), sh(HEAD.void), fl(PAL.hoodDeep, 100, 2)]),
    gr('Rim', [sh(HEAD.rimOuter), sh(HEAD.voidOut), fl(PAL.hoodLight, 100, 2)]),
    ...HEAD.light.map((ps, k) => tone(`Light ${k + 1}`, ps, PAL.hoodLight)),
    ...HEAD.deep.map((ps, k) => tone(`Deep ${k + 1}`, ps, PAL.hoodDeep)),
    ...HEAD.shade.map((ps, k) => tone(`Shade ${k + 1}`, ps, PAL.hoodShade)),
    gr('Hood', [sh(HOOD_PARTS.domeClosed), sh(HEAD.void), fl(PAL.hood, 100, 2)]),
    gr('Ear', [sh(deform(HOOD_PARTS.earClosed)), fl(PAL.hood)]),
  );
  // Face contents sit under the hood fabric, which masks them to the opening.
  shapes.push(...faceShapes(ctx, def));
  shapes.push(gr('Void', [sh(HEAD.voidOut), fl(PAL.void)]));
  return shapes;
}

function faceShapes(ctx, def) {
  const { S } = ctx;
  const out = [];
  if (def.faceExtras) out.push(...def.faceExtras(ctx));
  const [ex, ey] = DIM.eye;

  for (const side of [1, -1]) {
    const cx = ex * side;
    out.push(
      gr(side > 0 ? 'Lid R' : 'Lid L', [sh(G.ellipse(0, 0, 36, 24)), fl(PAL.void)], {
        // droop lowers the outer corners (sad); angry lowers the inner corners (a frown).
        p: S((P) => [
          cx + P.eyes.x + side * P.eyes.droop * 4 - side * (P.eyes.angry || 0) * 6,
          ey + P.eyes.y - 76 + P.eyes.droop * 54 + (P.eyes.angry || 0) * 46,
        ]),
        r: S((P) => side * P.eyes.droop * 20 - side * (P.eyes.angry || 0) * 24),
      }),
    );
  }

  const chevron = (side) =>
    G.poly(
      [
        [-15 * side, -21],
        [15 * side, 0],
        [-15 * side, 21],
      ],
      false,
    );
  const smile = G.smooth([{ p: [-17, 9] }, { p: [0, -11], dir: 0 }, { p: [17, 9] }], false);
  for (const side of [1, -1]) {
    const cx = ex * side;
    out.push(
      gr(
        side > 0 ? 'Smile eye R' : 'Smile eye L',
        [
          sh(smile),
          st(PAL.eye, 12.5, { cap: 2, join: 2 }),
          st('#DCE3FF', 24, { cap: 2, join: 2, opacity: 40 }),
          st('#9AA9FF', 38, { cap: 2, join: 2, opacity: 16 }),
        ],
        {
          p: S((P) => [cx + P.eyes.x, ey + P.eyes.y - 6]),
          s: S((P) => [P.eyes.happy * 100, P.eyes.happy * 100]),
        },
      ),
      gr(
        side > 0 ? 'Laugh eye R' : 'Laugh eye L',
        [
          sh(chevron(-side)),
          st(PAL.eye, 12.5, { cap: 2, join: 2 }),
          st('#DCE3FF', 24, { cap: 2, join: 2, opacity: 40 }),
          st('#9AA9FF', 38, { cap: 2, join: 2, opacity: 16 }),
        ],
        {
          p: S((P) => [cx + P.eyes.x, ey + P.eyes.y]),
          s: S((P) => [P.eyes.laugh * 100, P.eyes.laugh * 100]),
        },
      ),
      gr(
        side > 0 ? 'Heart eye R' : 'Heart eye L',
        [
          gr('Core', [sh(G.heart(0, -6, 62)), fl('#FFF2F6')]),
          gr('Glow in', [sh(G.heart(0, -7, 84)), fl(PAL.heartHi, 50)]),
          gr('Glow out', [sh(G.heart(0, -8, 108)), fl(PAL.heart, 26)]),
        ],
        {
          p: S((P) => [cx + P.eyes.x, ey + P.eyes.y + 4]),
          s: S((P) => [P.eyes.heart * 100, P.eyes.heart * 100]),
        },
      ),
    );
  }

  for (const side of [1, -1]) {
    const cx = ex * side;
    out.push(
      gr(
        side > 0 ? 'Eye R' : 'Eye L',
        [
          gr('Core', [sh(G.roundRect(0, 0, DIM.eyeW, DIM.eyeH, DIM.eyeW / 2)), fl(PAL.eye)]),
          gr(
            'Glow',
            [
              sh(G.ellipse(0, 0, 44, 44)),
              gfRadial(
                [
                  [0, '#F2F4FF', 0.7],
                  [0.5, '#C4CEFF', 0.45],
                  [0.74, '#9DAEFF', 0.18],
                  [1, '#8C9EFF', 0],
                ],
                { end: [44, 0], opacity: S((P) => 100 * P.eyes.glow) },
              ),
            ],
            { s: [72, 112] },
          ),
        ],
        {
          p: S((P) => [cx + P.eyes.x, ey + P.eyes.y]),
          s: S((P) => {
            const k = 1 - Math.max(P.eyes.laugh, P.eyes.heart, P.eyes.happy);
            return [P.eyes.sx * 100 * k, P.eyes.sy * P.eyes.open * 100 * k];
          }),
        },
      ),
    );
  }
  return out;
}

function cordShape(ctx, side) {
  const { S } = ctx;
  const top = [DIM.cordX * side, DIM.cordTop];
  const L = DIM.cordLen;
  const angleOf = (P) => -(P.strings.world || 0) * (side > 0 ? 1 : 1.1) - (P.strings.headAngle || 0);
  const endOf = (P) => G.add(top, G.mul(G.rot([0, 1], angleOf(P)), L));
  const path = S((P) => {
    const d = G.rot([0, 1], angleOf(P));
    return { v: [top, endOf(P)], i: [[0, 0], G.mul(d, -L * 0.32)], o: [[0, L * 0.36], [0, 0]], c: false };
  }, 0.5);
  const knot = [
    gr('Tip', [sh(G.roundRect(0, 13, 17, 13, 6.5)), st(PAL.line, SEAM * 1.25), fl(PAL.string)]),
    gr('Ring', [sh(G.roundRect(0, 3, 21, 11, 5.5)), st(PAL.line, SEAM * 1.25), fl(PAL.string)]),
  ];
  return gr(side > 0 ? 'Cord R' : 'Cord L', [
    gr('Knot', knot, { p: S((P) => endOf(P), 0.5), r: S((P) => angleOf(P), 0.35) }),
    gr('Cord', [sh(path), st(PAL.string, 11, { cap: 2 }), st(PAL.line, 11 + SEAM * 2.5, { cap: 2 })]),
  ]);
}

/**
 * A tapered capsule along local +y from (0, 0) to (0, len): width w0 at the top, w1 at the
 * bottom, round ends. Sleeves are two of these (upper arm, forearm) that only rotate, so a
 * moving arm costs a few numbers per frame instead of a reshaped path.
 */
function capsule(len, w0, w1, dx = 0) {
  const a = w0 / 2;
  const b = w1 / 2;
  return G.smooth(
    [
      { p: [dx, -a], dir: 0 },
      { p: [dx + a, 0], dir: 90 },
      { p: [dx + b, len], dir: 90 },
      { p: [dx, len + b], dir: 180 },
      { p: [dx - b, len], dir: 270 },
      { p: [dx - a, 0], dir: 270 },
    ],
    true,
    0.5,
  );
}

/** The capsule's two sides and bottom end as one open path (no line across the top end). */
function capsuleEdge(len, w0, w1) {
  const a = w0 / 2;
  const b = w1 / 2;
  return G.smooth(
    [
      { p: [a, 0], dir: 90 },
      { p: [b, len], dir: 90 },
      { p: [0, len + b], dir: 180 },
      { p: [-b, len], dir: 270 },
      { p: [-a, 0], dir: 270 },
    ],
    false,
    0.5,
  );
}

function armShapes(ctx, side) {
  const { S } = ctx;
  const key = side < 0 ? 'armL' : 'armR';
  const geo = (P) => armGeometry(P[key]);
  const angles = (P) => {
    const arm = P[key];
    return arm.ik ? armIK(arm.ik.target, arm.ik.bend ?? 1) : { a1: arm.a1, a2: arm.a2 };
  };
  const { l1, l2, sleeve0: w0, sleeve1: w1 } = DIM;
  const wE = (w0 + w1) / 2;
  const s = HAND_SCALE;
  const upperKs = {
    p: DIM.shoulder,
    r: S((P) => angles(P).a1),
    s: S((P) => [100, 100 * (P[key].stretch ?? 1)]),
  };
  const foreKs = {
    p: S((P) => geo(P).path.v[1]),
    r: S((P) => angles(P).a1 + angles(P).a2),
    s: S((P) => [100, 100 * (P[key].stretch ?? 1)]),
  };
  // Both pieces have their outline under their own fill (a doubled stroke, so only the outer
  // half shows) and one flat fill, so where they meet at the elbow nothing changes and the
  // sleeve reads as one tube. The forearm is drawn on top and its outline leaves out the
  // elbow end, so a folded arm still shows the forearm over the upper arm. A short glint
  // near the shoulder gives the sleeve some roundness without a band that could break.
  const glint = G.smooth([{ p: [w0 * 0.2, 4] }, { p: [w0 * 0.27, 18] }, { p: [w0 * 0.27, 32] }], false);
  return [
    gr(
      'Hand',
      [
        gr('Mitt glint', [
          sh(G.smooth([{ p: [-30 * s, 58 * s] }, { p: [-26 * s, 74 * s] }, { p: [-16 * s, 84 * s] }], false)),
          st(PAL.navyHi, 2.4 * PX, { cap: 2 }),
        ]),
        gr('Mitt', [sh(MITT), st(PAL.line, LINE), fl(PAL.navy)]),
        gr('Cuff rib', [sh(G.poly([[-40 * s, 22 * s], [40 * s, 22 * s]], false)), st(PAL.navyLight, SEAM, { cap: 2 })]),
        gr('Cuff', [sh(CUFF), st(PAL.line, LINE), fl(PAL.navy)]),
      ],
      {
        p: S((P) => geo(P).wrist),
        r: S((P) => geo(P).angle),
        s: S((P) => [P[key].hs * 100, P[key].hs * 100]),
      },
    ),
    gr('Forearm', [
      gr('Fill', [sh(capsule(l2, wE, w1)), fl(PAL.hoodShade)]),
      gr('Edge', [sh(capsuleEdge(l2, wE, w1)), st(PAL.line, LINE * 2)]),
    ], foreKs),
    gr('Upper arm', [
      gr('Glint', [sh(glint), st(PAL.hoodLight, 2.6 * PX, { cap: 2 })]),
      gr('Fill', [sh(capsule(l1, w0, wE)), fl(PAL.hoodShade)]),
      gr('Line', [sh(capsule(l1, w0, wE)), st(PAL.line, LINE * 2)]),
    ], upperKs),
  ];
}

function legShapes(ctx) {
  const { S } = ctx;
  const out = [];
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'legL' : 'legR';
    const pivot = [DIM.legHip[0], DIM.legHip[1]];
    out.push(
      gr(
        side < 0 ? 'Leg L' : 'Leg R',
        [
          gr('Toe glint', [
            sh(G.smooth([{ p: [-118, -38] }, { p: [-106, -48] }, { p: [-88, -52] }], false)),
            st(PAL.navyHi, 2.4 * PX, { cap: 2 }),
          ]),
          gr('Shin light', [sh(G.roundRect(-88, -112, 22, 58, 11)), fl(PAL.navyLight)]),
          gr('Leg', [sh(LEG), st(PAL.line, LINE), fl(PAL.navy)]),
        ],
        {
          a: pivot,
          p: S((P) => [pivot[0] * -side + P[key].x, pivot[1] + P[key].y]),
          r: S((P) => P[key].r),
          s: [side < 0 ? 100 : -100, 100],
        },
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------

function flatten(o, out = [], key = '') {
  if (typeof o === 'number') out.push([key, o]);
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) flatten(o[k], out, key + '.' + k);
  return out;
}

function checkSeam(def, a, b) {
  const A = flatten(a);
  const B = new Map(flatten(b));
  const bad = A.filter(([k, v]) => B.has(k) && Math.abs(B.get(k) - v) > 1e-6);
  if (bad.length) {
    throw new Error(
      `${def.id}: pose at frame ${def.frames} does not match frame 0: ` +
        bad.map(([k, v]) => `${k} ${v} vs ${B.get(k)}`).join(', '),
    );
  }
}
