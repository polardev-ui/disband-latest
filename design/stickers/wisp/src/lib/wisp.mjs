// Wisp's 2D rig, modelled from the front view of her turnaround (reference/wisp-turnaround.webp).
//
// Geometry is in reference pixels of the front view (the turnaround's top-left panel, cropped
// at x = 60), so Wisp has the same scale as Spectre: her eyes are 31 x 74 there, like his.
// The root layer scales everything to the 320 x 320 sticker. Spaces:
//   root – origin on the ground between the feet; squash and stretch happen here
//   body – origin at the tunic's middle (hip pivot); tunic, scarf, arms
//   head – origin at the neck (bottom of the face opening); hood and tail, face, stars, halo
// Secondary motion (the hood's tail and the floating halo) is simulated to a steady loop.

import * as G from '../../../spectre/src/lib/geom.mjs';
import { springLoop } from '../../../spectre/src/lib/anim.mjs';
import { series, sh, fl, st, gr, gfRadial, shapeLayer, nullLayer, composition } from '../../../spectre/src/lib/lottie.mjs';

export const SCALE = 0.43;
export const PX = 1 / SCALE;
export const LINE = 3.6 * PX;
export const SEAM = 2.2 * PX;

export const PAL = {
  line: '#262842',
  light: '#D6D7F8',
  lav: '#BFC1EF',
  shade: '#A5A8DE',
  deep: '#8B8FCA',
  void: '#181A29',
  eye: '#FFFFFF',
  navy: '#2B2C48',
  navyLight: '#3F4166',
  navyHi: '#62669A',
  star: '#3A3469',
  starHi: '#5F57A0',
  blush: '#FF8FBF',
  shadow: '#1B1D33',
};

const CX = 260;
const REF = { root: [CX, 609], hip: [CX, 500], neck: [CX, 320] };
const inSpace = (o) => (pts) => pts.map((p) => (p.length > 2 ? [p[0] - o[0], p[1] - o[1], p[2]] : [p[0] - o[0], p[1] - o[1]]));
const H = inSpace(REF.neck); // head space
const B = inSpace(REF.hip); // body space
const Rt = inSpace(REF.root); // root space

export const DIM = {
  ground: 300,
  centreX: 146, // the tail sweeps right, so the body sits a little left of centre
  hip: [0, -109],
  neck: [0, -180],
  shoulder: [-106, -112], // left shoulder in body space (the right arm mirrors it), at the tunic's edge
  l1: 38,
  l2: 32,
  sleeve0: 74,
  sleeve1: 66,
  mitt: [48, 42, 24], // across, along, offset from the wrist along the arm
  eye: [50, -70],
  eyeW: 31,
  eyeH: 74,
  legHip: [-66, -110],
  tailPivot: [150, -100], // head space: where the tail leaves the dome
  tailTip: [320, -109],
};

// ---------------------------------------------------------------------------
// Modelled geometry (front view, reference px)

/** Smooth closed path; points are [x, y] or [x, y, k] with k the handle scale (0 = corner). */
const path = (pts, closed = true) => G.smooth(pts.map((p) => ({ p: [p[0], p[1]], k: p[2] ?? 1 })), closed);

const HOOD_PTS = H([
  [265, 86], [319, 90], [355, 95], [386, 106], [408, 122], [421, 142], [432, 161],
  [448, 177], [470, 189], [502, 199], [540, 205], [580, 211, 0],
  [566, 234], [548, 254], [520, 268], [488, 275], [452, 274], [425, 277],
  [412, 288], [398, 300], [372, 311], [340, 318], [300, 324], [260, 326], [220, 324],
  [181, 315], [150, 298], [133, 284], [118, 272], [106, 258], [97, 244], [89, 228], [85, 212],
  [84, 196], [87, 178], [93, 162], [102, 150], [113, 138], [126, 126], [144, 115], [170, 103], [212, 91],
]);

// The tail: the hood's outline from where it leaves the dome round the tip and back (the
// first TAIL_EDGE points, which get the ink line), closed through points inside the dome.
const TAIL_EDGE = 14;
const TAIL_PTS = [...HOOD_PTS.slice(5, 19), ...H([[392, 254], [388, 196]])];
const DOME_PTS = [...HOOD_PTS.slice(18), ...HOOD_PTS.slice(0, 6)];
const TAIL_TIP = 6; // index of the tip in TAIL_PTS

const VOID_PTS = H([
  [240, 157], [275, 163], [294, 174], [313, 186], [329, 198], [342, 210], [352, 222], [360, 234],
  [366, 246], [369, 258], [368, 272], [362, 286], [350, 298], [330, 309], [295, 318], [262, 321],
  [228, 318], [193, 309], [170, 296], [158, 284], [151, 270], [148, 256], [148, 242], [151, 228],
  [157, 212], [166, 198], [178, 184], [194, 172], [215, 162],
]);

const SCARF = path(
  B([
    [165, 318], [215, 312], [260, 311], [305, 312], [352, 318], [363, 336], [359, 353], [344, 365],
    [300, 377], [267, 382], [234, 378], [188, 367], [164, 354], [154, 337],
  ]),
);
const SCARF_FOLD = G.smooth(B([[178, 347], [260, 355], [345, 344]]).map((p) => ({ p })), false);
const SCARF_HI = G.smooth(B([[188, 322], [260, 318], [330, 322]]).map((p) => ({ p })), false);

const TUNIC = path(
  B([
    [178, 358], [262, 356], [345, 358], [376, 378], [390, 420], [398, 462], [403, 501, 0],
    [356, 484], [312, 466, 0], [122, 553, 0], [128, 520], [136, 480], [145, 430], [155, 395], [165, 372],
  ]),
);
const TUNIC_SEAM = G.smooth(B([[322, 372], [316, 420], [312, 464]]).map((p) => ({ p })), false);
const HEM_LINE = G.smooth(B([[140, 538], [230, 500], [305, 469]]).map((p) => ({ p })), false);

const CHEST_STAR = B([[265, 416]])[0];
const HOOD_STAR = H([[403, 195]])[0];
const HALO = { c: H([[339, 74]])[0], rx: 120, ry: 31, r: 19, w: 19 };

const LEG = G.roundRect(0, -78, 108, 156, 30);

/** Four-pointed star with curved sides, like the ones on her hood and chest. */
export function star4(r, waist = 0.3) {
  return G.sparkle(0, 0, r, waist);
}

// ---------------------------------------------------------------------------
// Pose

export function rest() {
  return {
    root: { x: DIM.centreX, y: DIM.ground, r: 0, sx: 1, sy: 1 },
    body: { x: 0, y: 0, r: 0, sx: 1, sy: 1 },
    head: { x: 0, y: 0, r: 0, sx: 1, sy: 1 },
    tail: 0, // extra bend of the hood's tail (+ = droops down), on top of the simulated sway
    tailFlutter: 1,
    halo: { x: 0, y: 0, r: 0, s: 1, o: 1 },
    stars: 1, // twinkle scale of the hood and chest stars
    eyes: { x: 0, y: 0, open: 1, happy: 0, droop: 0, angry: 0, laugh: 0, heart: 0, wink: 0, sx: 1, sy: 1, glow: 1, shine: 0 },
    blush: 0,
    armL: { a1: 55, a2: 0, hand: 0, hs: 1 },
    armR: { a1: 55, a2: 0, hand: 0, hs: 1 },
    legL: { x: 0, y: 0, r: 0 },
    legR: { x: 0, y: 0, r: 0 },
    shadow: { s: 1, o: 1 },
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

const adir = (deg) => [-Math.sin(deg * G.DEG), Math.cos(deg * G.DEG)];

/** Joint positions of an arm in left-arm space. */
export function armGeometry(arm) {
  const S = DIM.shoulder;
  const E = G.add(S, G.mul(adir(arm.a1), DIM.l1));
  const W = G.add(E, G.mul(adir(arm.a1 + arm.a2), DIM.l2));
  const angle = arm.a1 + arm.a2 + (arm.hand ?? 0);
  const mitt = G.add(W, G.mul(adir(angle), DIM.mitt[2]));
  return { S, E, W, angle, mitt };
}

/** Arm angles that put the mitt's centre on a target (left-arm space). bend: +1 / -1 elbow side. */
export function reach(target, bend = 1) {
  const S = DIM.shoulder;
  const L1 = DIM.l1;
  const L2 = DIM.l2 + DIM.mitt[2];
  const v = G.sub(target, S);
  const d = G.clamp(G.len(v), Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.01);
  const phi = Math.atan2(-v[0], v[1]) / G.DEG;
  const alpha = Math.acos(G.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)) / G.DEG;
  const gamma = Math.acos(G.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)) / G.DEG;
  return { a1: phi + bend * alpha, a2: -bend * (180 - gamma) };
}

// ---------------------------------------------------------------------------
// Tail: points past the dome bend about the tail's root; the bend grows along the tail and a
// travelling wave runs down it, so it flutters like a flame.

const TAIL_LEN = DIM.tailTip[0] - DIM.tailPivot[0];
function tailDeform(pts, bend, wave) {
  return pts.map((p) => {
    const u = G.clamp((p[0] - DIM.tailPivot[0] + 6) / TAIL_LEN);
    if (u <= 0) return p;
    const w = u * u * (3 - 2 * u);
    const a = bend * w + wave(u) * w;
    const q = G.rotAbout([p[0], p[1]], DIM.tailPivot, a);
    return [q[0], q[1], p[2]];
  });
}

// ---------------------------------------------------------------------------
// Build

/** def = { id, name, frames, pose(f), layers?(ctx), faceExtras?(ctx), secondary?, ground? } */
export function buildSticker(def) {
  const N = def.frames;
  const poses = [];
  for (let f = 0; f <= N; f++) poses.push(merge(rest(), def.pose(f)));
  checkSeam(def, poses[0], poses[N]);

  const mats = poses.map((P) => {
    const root = G.layerMat({ p: [P.root.x, P.root.y], r: P.root.r, s: [P.root.sx * SCALE, P.root.sy * SCALE] });
    const body = G.matMul(root, G.layerMat({ p: [DIM.hip[0] + P.body.x, DIM.hip[1] + P.body.y], r: P.body.r, s: [P.body.sx, P.body.sy] }));
    const head = G.matMul(body, G.layerMat({ p: [DIM.neck[0] + P.head.x, DIM.neck[1] + P.head.y], r: P.head.r, s: [P.head.sx, P.head.sy] }));
    return { root, body, head };
  });

  secondary(def, poses, mats, N);

  const S = (fn, tol) => series(N, (f) => fn(poses[f], f), tol);
  const ctx = { N, poses, mats, S, PAL, LINE, DIM, SCALE, PX };

  const IND = { root: 1, body: 2, head: 3 };
  const rootLayer = nullLayer({
    ind: IND.root,
    nm: 'Wisp',
    op: N,
    ks: {
      p: S((P) => [P.root.x, P.root.y]),
      r: S((P) => P.root.r),
      s: S((P) => [P.root.sx * SCALE * 100, P.root.sy * SCALE * 100]),
    },
  });
  const bodyKs = {
    p: S((P) => [DIM.hip[0] + P.body.x, DIM.hip[1] + P.body.y]),
    r: S((P) => P.body.r),
    s: S((P) => [P.body.sx * 100, P.body.sy * 100]),
  };
  const bodyLayer = shapeLayer({ ind: IND.body, nm: 'Tunic', parent: IND.root, op: N, ks: bodyKs, shapes: tunicShapes(ctx) });
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
  const scarfLayer = shapeLayer({ ind: 4, nm: 'Scarf', parent: IND.body, op: N, shapes: scarfShapes() });
  const haloLayer = shapeLayer({
    ind: 5,
    nm: 'Halo',
    parent: IND.head,
    op: N,
    ks: {
      a: HALO.c,
      p: S((P) => [HALO.c[0] + P.halo.x + (P.haloSim?.x || 0), HALO.c[1] + P.halo.y + (P.haloSim?.y || 0)], 0.15),
      r: S((P) => P.halo.r + (P.haloSim?.r || 0), 0.1),
      s: S((P) => [P.halo.s * 100, P.halo.s * 100]),
      o: S((P) => P.halo.o * 100),
    },
    shapes: haloShapes(),
  });
  const armLayer = (side, ind) =>
    shapeLayer({
      ind,
      nm: side < 0 ? 'Arm L' : 'Arm R',
      parent: IND.body,
      op: N,
      ks: { s: [side < 0 ? 100 : -100, 100] },
      shapes: armShapes(ctx, side),
    });
  const legsLayer = shapeLayer({ ind: 8, nm: 'Legs', parent: IND.root, op: N, shapes: legShapes(ctx) });
  const shadowLayer = shapeLayer({
    ind: 9,
    nm: 'Shadow',
    op: N,
    ks: {
      p: S((P) => [P.root.x + 4, (def.ground ?? DIM.ground) + 1]),
      s: S((P) => [P.shadow.s * 100, P.shadow.s * 100]),
      o: S((P) => P.shadow.o * 100),
    },
    shapes: [gr('Shadow', [sh(G.ellipse(0, 0, 64, 7.5)), fl(PAL.shadow, 18)])],
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
    armLayer(1, 6),
    armLayer(-1, 7),
    ...props,
    haloLayer,
    scarfLayer,
    headLayer,
    bodyLayer,
    legsLayer,
    shadowLayer,
    ...back,
    rootLayer,
  ];
  return composition({
    nm: `Wisp – ${def.name}`,
    op: N,
    layers,
    meta: { g: 'Disband sticker generator', a: 'Disband', d: `Wisp sticker: ${def.name}` },
  });
}

// ---------------------------------------------------------------------------
// Secondary motion

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
  // Tail: soft fabric, lags the head (+ = droop). Sideways and vertical moves both swing it.
  const tg = opts.tailGain ?? 1;
  const tail = springLoop(N, (t) => ({ target: 0, force: (-(ay(t) / 30) * 1.4 - ar(t) * G.DEG * 2.2 + (ax(t) / 30) * 1.2) * tg }), {
    stiffness: 0.16,
    damping: 0.2,
  });
  // Halo: floats on a soft spring above the head, trailing its moves.
  const hg = opts.haloGain ?? 1;
  const hy = springLoop(N, (t) => ({ target: 0, force: -ay(t) * 0.9 * hg }), { stiffness: 0.12, damping: 0.22 });
  const hx = springLoop(N, (t) => ({ target: 0, force: -ax(t) * 0.7 * hg }), { stiffness: 0.12, damping: 0.22 });
  const hrot = springLoop(N, (t) => ({ target: 0, force: -ar(t) * 0.6 * hg }), { stiffness: 0.1, damping: 0.2 });
  for (let f = 0; f <= N; f++) {
    poses[f].tailSim = 22 * Math.tanh(tail[f] / G.DEG / 22);
    // Plus a gentle float: once up and down per loop.
    const float = (opts.haloFloat ?? 1) * 4 * Math.sin((f / N) * Math.PI * 2);
    poses[f].haloSim = { x: 30 * Math.tanh(hx[f] / 30), y: 30 * Math.tanh(hy[f] / 30) + float, r: 12 * Math.tanh(hrot[f] / 12) };
  }
}

// ---------------------------------------------------------------------------
// Parts

function headShapes(ctx, def) {
  const { S, N } = ctx;
  // Idle flutter: about one ripple a second, a whole number of them per loop.
  const cycles = Math.max(1, Math.round(N / 60));
  const wave = (P, f) => (u) => 5 * (P.tailFlutter ?? 1) * Math.sin((f / N) * Math.PI * 2 * cycles - u * 2.4);
  // The hood is a still dome plus the tail, which is the only part that moves. The tail is
  // drawn over the dome and closes through points inside it, so the join doesn't show; its
  // ink line leaves out that inner edge.
  const tailPts = (P, f) => tailDeform(TAIL_PTS, P.tail + (P.tailSim || 0), wave(P, f));
  const tailPath = (P, f) => path(tailPts(P, f));
  const tailEdge = (P, f) => path(tailPts(P, f).slice(0, TAIL_EDGE), false);
  // Lit part of the tail: its top edge as is, and the underside pulled a third of the way
  // toward the nearest point on the top edge, leaving a shade band along the underside.
  const tailLit = (P, f) => {
    const pts = tailPts(P, f);
    const top = pts.slice(0, TAIL_TIP + 1);
    return path(
      pts.map((p, k) => {
        if (k <= TAIL_TIP || k >= TAIL_EDGE) return p;
        let best = top[0];
        for (const q of top) if (Math.abs(q[0] - p[0]) < Math.abs(best[0] - p[0])) best = q;
        const q = G.lerp2(p, best, 0.34);
        return [q[0], q[1], p[2]];
      }),
    );
  };
  const tol = 0.6;
  const voidPath = path(VOID_PTS);
  const dome = path(DOME_PTS);
  const domeLit = G.scalePath(dome, 0.9, 0.88, [-150, -230]);
  const shapes = [];
  shapes.push(
    gr('Hood star', starShapes(30), { p: HOOD_STAR, r: -12, s: S((P) => [100 * P.stars, 100 * P.stars]) }),
    gr('Hood glint', [sh(G.smooth([{ p: [-132, -150] }, { p: [-118, -176] }, { p: [-92, -200] }], false)), st(PAL.light, 3.2 * PX, { cap: 2 })]),
    gr('Rim', [sh(voidPath), st(PAL.light, 9)]),
    gr('Tail outline', [sh(S(tailEdge, tol)), st(PAL.line, LINE)]),
    gr('Tail lit', [sh(S(tailLit, tol)), fl(PAL.lav)]),
    gr('Tail', [sh(S(tailPath, tol)), fl(PAL.shade)]),
    gr('Outline', [sh(dome), st(PAL.line, LINE)]),
    gr('Lit', [sh(domeLit), sh(voidPath), fl(PAL.lav, 100, 2)]),
    gr('Base', [sh(dome), sh(voidPath), fl(PAL.shade, 100, 2)]),
  );
  shapes.push(...faceShapes(ctx, def));
  shapes.push(gr('Void', [sh(voidPath), fl(PAL.void)]));
  return shapes;
}

function starShapes(r) {
  return [
    gr('Shine', [sh(G.poly([[-r * 0.08, -r * 0.62], [-r * 0.05, -r * 0.3]], false)), st(PAL.starHi, r * 0.12, { cap: 2 })]),
    gr('Star', [sh(star4(r)), st(PAL.line, Math.max(2.5, r * 0.08)), fl(PAL.star)]),
  ];
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
        p: S((P) => [
          cx + P.eyes.x + side * P.eyes.droop * 4 - side * P.eyes.angry * 6,
          ey + P.eyes.y - 76 + P.eyes.droop * 54 + P.eyes.angry * 46,
        ]),
        r: S((P) => side * P.eyes.droop * 20 - side * P.eyes.angry * 24),
      }),
    );
  }
  out.push(
    gr('Blush', [sh(G.ellipse(-ex - 10, ey + 50, 25, 11)), sh(G.ellipse(ex + 10, ey + 50, 25, 11)), fl(PAL.blush, 85)], {
      o: S((P) => 100 * P.blush),
    }),
  );
  // A fresh set each time: Lottie players edit the data in place, so shapes must not share objects.
  const glowStrokes = () => [st(PAL.eye, 12.5, { cap: 2, join: 2 }), st('#DCE3FF', 24, { cap: 2, join: 2, opacity: 40 }), st('#9AA9FF', 38, { cap: 2, join: 2, opacity: 16 })];
  const smile = G.smooth([{ p: [-17, 9] }, { p: [0, -11], dir: 0 }, { p: [17, 9] }], false);
  const chevron = (s) => G.poly([[-15 * s, -21], [15 * s, 0], [-15 * s, 21]], false);
  for (const side of [1, -1]) {
    const cx = ex * side;
    // happy arcs; the right eye also closes into one for a wink
    out.push(
      gr(side > 0 ? 'Smile eye R' : 'Smile eye L', [sh(smile), ...glowStrokes()], {
        p: S((P) => [cx + P.eyes.x, ey + P.eyes.y - 6]),
        s: S((P) => {
          const k = Math.max(P.eyes.happy, side > 0 ? P.eyes.wink : 0);
          return [k * 100, k * 100];
        }),
      }),
      gr(side > 0 ? 'Laugh eye R' : 'Laugh eye L', [sh(chevron(-side)), ...glowStrokes()], {
        p: S((P) => [cx + P.eyes.x, ey + P.eyes.y]),
        s: S((P) => [P.eyes.laugh * 100, P.eyes.laugh * 100]),
      }),
    );
  }
  for (const side of [1, -1]) {
    const cx = ex * side;
    out.push(
      gr(
        side > 0 ? 'Eye R' : 'Eye L',
        [
          // Pleading shine: two little highlights in each eye.
          gr('Shine', [sh(G.ellipse(-5, -18, 6.5, 9)), sh(G.ellipse(6, 14, 3.5, 4.5)), fl('#B9C6FF')], {
            s: S((P) => [100 * P.eyes.shine, 100 * P.eyes.shine]),
          }),
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
            const k = 1 - Math.max(P.eyes.laugh, P.eyes.heart, P.eyes.happy, side > 0 ? P.eyes.wink : 0);
            return [P.eyes.sx * 100 * k, P.eyes.sy * P.eyes.open * 100 * k];
          }),
        },
      ),
    );
  }
  return out;
}

function scarfShapes() {
  return [
    gr('Highlight', [sh(SCARF_HI), st(PAL.navyHi, 3 * PX, { cap: 2 })]),
    gr('Fold', [sh(SCARF_FOLD), st(PAL.line, SEAM * 1.2, { cap: 2, opacity: 80 })]),
    gr('Scarf', [sh(SCARF), st(PAL.line, LINE), fl(PAL.navy)]),
  ];
}

function tunicShapes(ctx) {
  const { S } = ctx;
  const lit = G.scalePath(TUNIC, 0.86, 0.94, [-110, -150]);
  return [
    gr('Chest star', starShapes(23), { p: CHEST_STAR, s: S((P) => [100 * P.stars, 100 * P.stars]) }),
    gr('Seam', [sh(TUNIC_SEAM), st(PAL.deep, SEAM, { cap: 2 })]),
    gr('Hem crease', [sh(HEM_LINE), st(PAL.deep, SEAM, { cap: 2, opacity: 70 })]),
    gr('Outline', [sh(TUNIC), st(PAL.line, LINE)]),
    gr('Lit', [sh(lit), fl(PAL.lav)]),
    gr('Base', [sh(TUNIC), fl(PAL.shade)]),
  ];
}

function haloShapes() {
  const { c, rx, ry, r, w } = HALO;
  const ring = G.rotatePath(G.ellipse(c[0], c[1], rx, ry), r, c);
  const hi = G.rotatePath(
    G.smooth(
      [
        { p: [c[0] - rx * 0.78, c[1] - ry * 0.62] },
        { p: [c[0] - rx * 0.35, c[1] - ry * 0.98] },
        { p: [c[0] + rx * 0.1, c[1] - ry * 1.02] },
      ],
      false,
    ),
    r,
    c,
  );
  return [
    gr('Shine', [sh(hi), st(PAL.navyHi, w * 0.3, { cap: 2 })]),
    gr('Ring', [sh(ring), st(PAL.navy, w)]),
    gr('Ring line', [sh(ring), st(PAL.line, w + LINE * 1.6)]),
  ];
}

function capsule(len, w0, w1) {
  const a = w0 / 2;
  const b = w1 / 2;
  return G.smooth(
    [
      { p: [0, -a], dir: 0 },
      { p: [a, 0], dir: 90 },
      { p: [b, len], dir: 90 },
      { p: [0, len + b], dir: 180 },
      { p: [-b, len], dir: 270 },
      { p: [-a, 0], dir: 270 },
    ],
    true,
    0.5,
  );
}

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
  const { l1, l2, sleeve0: w0, sleeve1: w1 } = DIM;
  const wE = (w0 + w1) / 2;
  const geo = (P) => armGeometry(P[key]);
  const [across, along, off] = DIM.mitt;
  const upperKs = { p: DIM.shoulder, r: S((P) => P[key].a1) };
  const foreKs = { p: S((P) => geo(P).E), r: S((P) => P[key].a1 + P[key].a2) };
  // Like Spectre's sleeves (outlines under the fills, the forearm on top with no line across
  // its elbow end), but the upper arm has no line across its shoulder end either and shares
  // the tunic's colour, so the sleeve grows out of the tunic instead of sitting on it.
  return [
    gr(
      'Mitt',
      [
        gr('Glint', [sh(G.smooth([{ p: [-across * 0.55, off + 4] }, { p: [-across * 0.5, off + along * 0.5] }, { p: [-across * 0.2, off + along * 0.82] }], false)), st(PAL.navyHi, 2.4 * PX, { cap: 2 })]),
        gr('Ball', [sh(G.ellipse(0, off, across, along)), st(PAL.line, LINE), fl(PAL.navy)]),
      ],
      {
        p: S((P) => geo(P).W),
        r: S((P) => geo(P).angle),
        s: S((P) => [P[key].hs * 100, P[key].hs * 100]),
      },
    ),
    gr('Forearm', [gr('Fill', [sh(capsule(l2, wE, w1)), fl(PAL.lav)]), gr('Edge', [sh(capsuleEdge(l2, wE, w1)), st(PAL.line, LINE * 2)])], foreKs),
    gr(
      'Upper arm',
      [
        gr('Shade', [sh(G.poly([[-w0 * 0.36, 4], [-wE * 0.36, l1]], false)), st(PAL.shade, w0 * 0.24, { cap: 1 })]),
        gr('Fill', [sh(capsule(l1, w0, wE)), fl(PAL.lav)]),
        gr('Edge', [sh(capsuleEdge(l1, w0, wE)), st(PAL.line, LINE * 2)]),
      ],
      upperKs,
    ),
  ];
}

function legShapes(ctx) {
  const { S } = ctx;
  const out = [];
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'legL' : 'legR';
    const [px, py] = DIM.legHip;
    out.push(
      gr(
        side < 0 ? 'Leg L' : 'Leg R',
        [
          gr('Glint', [sh(G.smooth([{ p: [-36, -40] }, { p: [-38, -22] }, { p: [-30, -10] }], false)), st(PAL.navyHi, 2.4 * PX, { cap: 2 })]),
          gr('Leg', [sh(LEG), st(PAL.line, LINE), fl(PAL.navy)]),
        ],
        {
          a: [0, py],
          p: S((P) => [px * -side + P[key].x, py + P[key].y]),
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
  const Bm = new Map(flatten(b));
  const bad = A.filter(([k, v]) => Bm.has(k) && Math.abs(Bm.get(k) - v) > 1e-6);
  if (bad.length) {
    throw new Error(`${def.id}: pose at frame ${def.frames} does not match frame 0: ` + bad.map(([k, v]) => `${k} ${v} vs ${Bm.get(k)}`).join(', '));
  }
}
