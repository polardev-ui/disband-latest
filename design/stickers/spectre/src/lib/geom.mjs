// 2D helpers and Bezier paths in Lottie's format ({ v, i, o, c }, tangents relative to their vertex).

export const DEG = Math.PI / 180;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const rot = (a, deg) => {
  const r = deg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};
export const rotAbout = (p, centre, deg) => add(centre, rot(sub(p, centre), deg));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const dirOf = (deg) => [Math.sin(deg * DEG), Math.cos(deg * DEG)]; // 0deg = straight down
export const angleOf = (d) => Math.atan2(d[0], d[1]) / DEG; // inverse of dirOf
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------
// Path construction

/**
 * Smooth path through points. Each point is [x, y] or { p: [x, y], k, dir }:
 *   k   = handle length multiplier (0 = sharp corner, 1 = smooth)
 *   dir = explicit tangent angle in degrees (screen space, 0 = +x)
 */
export function smooth(points, closed = true, base = 0.39) {
  const pts = points.map((q) => (Array.isArray(q) ? { p: q } : q));
  const n = pts.length;
  const v = [];
  const ii = [];
  const oo = [];
  for (let k = 0; k < n; k++) {
    const P = pts[k].p;
    const prev = pts[closed ? (k - 1 + n) % n : Math.max(0, k - 1)].p;
    const next = pts[closed ? (k + 1) % n : Math.min(n - 1, k + 1)].p;
    const kk = pts[k].k ?? 1;
    let t;
    if (pts[k].dir !== undefined) t = [Math.cos(pts[k].dir * DEG), Math.sin(pts[k].dir * DEG)];
    else t = norm(sub(next, prev));
    const lin = len(sub(P, prev)) * base * kk * (pts[k].ki ?? 1);
    const lout = len(sub(next, P)) * base * kk * (pts[k].ko ?? 1);
    v.push([P[0], P[1]]);
    ii.push(!closed && k === 0 ? [0, 0] : mul(t, -lin));
    oo.push(!closed && k === n - 1 ? [0, 0] : mul(t, lout));
  }
  return { v, i: ii, o: oo, c: closed };
}

/** Mirror a list of right-hand points (x >= 0) into a full symmetric closed outline. */
export function mirrorPoints(rightHalf, { skipFirst = true, skipLast = true } = {}) {
  const left = [];
  for (let k = rightHalf.length - 1; k >= 0; k--) {
    if ((k === 0 && skipFirst) || (k === rightHalf.length - 1 && skipLast)) continue;
    const q = Array.isArray(rightHalf[k]) ? { p: rightHalf[k] } : { ...rightHalf[k] };
    q.p = [-q.p[0], q.p[1]];
    if (q.dir !== undefined) q.dir = 180 - q.dir;
    left.push(q);
  }
  return [...rightHalf, ...left];
}

const K = 0.5523;

export function ellipse(cx, cy, rx, ry, kappa = K) {
  const kx = rx * kappa;
  const ky = ry * kappa;
  return {
    v: [
      [cx, cy - ry],
      [cx + rx, cy],
      [cx, cy + ry],
      [cx - rx, cy],
    ],
    i: [
      [-kx, 0],
      [0, -ky],
      [kx, 0],
      [0, ky],
    ],
    o: [
      [kx, 0],
      [0, ky],
      [-kx, 0],
      [0, -ky],
    ],
    c: true,
  };
}

/** Rounded rectangle centred on (cx, cy). */
export function roundRect(cx, cy, w, h, r) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  r = Math.min(r, w / 2, h / 2);
  const k = r * K;
  return {
    v: [
      [x1 - r, y0],
      [x1, y0 + r],
      [x1, y1 - r],
      [x1 - r, y1],
      [x0 + r, y1],
      [x0, y1 - r],
      [x0, y0 + r],
      [x0 + r, y0],
    ],
    i: [
      [0, 0],
      [0, -k],
      [0, 0],
      [k, 0],
      [0, 0],
      [0, k],
      [0, 0],
      [-k, 0],
    ],
    o: [
      [k, 0],
      [0, 0],
      [0, k],
      [0, 0],
      [-k, 0],
      [0, 0],
      [0, -k],
      [0, 0],
    ],
    c: true,
  };
}

/** Polyline / polygon with straight segments. */
export function poly(points, closed = false) {
  return {
    v: points.map((p) => [p[0], p[1]]),
    i: points.map(() => [0, 0]),
    o: points.map(() => [0, 0]),
    c: closed,
  };
}

/** Heart centred on (cx, cy), size = overall width. Point at the bottom. */
export function heart(cx, cy, size) {
  const s = size / 100;
  const P = (x, y) => [cx + x * s, cy + y * s];
  return {
    v: [P(0, -22), P(50, -12), P(0, 46), P(-50, -12)],
    i: [
      [12 * s, -26 * s],
      [-2 * s, -34 * s],
      [26 * s, 18 * s],
      [-10 * s, 28 * s],
    ],
    o: [
      [-12 * s, -26 * s],
      [10 * s, 28 * s],
      [-26 * s, 18 * s],
      [2 * s, -34 * s],
    ],
    c: true,
  };
}

/** Teardrop pointing up, centred on its round part. */
export function drop(cx, cy, r) {
  return {
    v: [
      [cx, cy - r * 2.1],
      [cx + r, cy],
      [cx, cy + r],
      [cx - r, cy],
    ],
    i: [
      [0, 0],
      [0, -r * 0.9],
      [r * K, 0],
      [0, r * K],
    ],
    o: [
      [0, 0],
      [0, r * K],
      [-r * K, 0],
      [0, -r * 0.9],
    ],
    c: true,
  };
}

/** Four-point sparkle star. */
export function sparkle(cx, cy, r, waist = 0.22) {
  const w = r * waist;
  return {
    v: [
      [cx, cy - r],
      [cx + r, cy],
      [cx, cy + r],
      [cx - r, cy],
    ],
    i: [
      [-w, w * 2.2],
      [-w * 2.2, -w],
      [w, -w * 2.2],
      [w * 2.2, w],
    ],
    o: [
      [w, w * 2.2],
      [-w * 2.2, w],
      [-w, -w * 2.2],
      [w * 2.2, -w],
    ],
    c: true,
  };
}

// ---------------------------------------------------------------------------
// Path transforms

export function mapPath(path, fn) {
  const v = [];
  const ii = [];
  const oo = [];
  for (let k = 0; k < path.v.length; k++) {
    const p = path.v[k];
    const P = fn(p);
    v.push(P);
    ii.push(sub(fn(add(p, path.i[k])), P));
    oo.push(sub(fn(add(p, path.o[k])), P));
  }
  return { v, i: ii, o: oo, c: path.c };
}

export const translatePath = (path, d) => mapPath(path, (p) => add(p, d));
export const scalePath = (path, sx, sy, about = [0, 0]) =>
  mapPath(path, (p) => [about[0] + (p[0] - about[0]) * sx, about[1] + (p[1] - about[1]) * sy]);
export const rotatePath = (path, deg, about = [0, 0]) => mapPath(path, (p) => rotAbout(p, about, deg));

export function lerpPath(a, b, t) {
  return {
    v: a.v.map((p, k) => lerp2(p, b.v[k], t)),
    i: a.i.map((p, k) => lerp2(p, b.i[k], t)),
    o: a.o.map((p, k) => lerp2(p, b.o[k], t)),
    c: a.c,
  };
}

/** Evaluate a point on a cubic segment k → k+1 of a path at parameter t. */
export function pointOn(path, k, t) {
  const n = path.v.length;
  const p0 = path.v[k];
  const p3 = path.v[(k + 1) % n];
  const p1 = add(p0, path.o[k]);
  const p2 = add(p3, path.i[(k + 1) % n]);
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// ---------------------------------------------------------------------------
// 2D affine matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f

export const I = [1, 0, 0, 1, 0, 0];

export function matMul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Lottie layer transform: p' = position + R(rot) * S(scale) * (p - anchor). Scale in fractions. */
export function layerMat({ p = [0, 0], a = [0, 0], r = 0, s = [1, 1] }) {
  const c = Math.cos(r * DEG);
  const sn = Math.sin(r * DEG);
  const A = c * s[0];
  const B = sn * s[0];
  const C = -sn * s[1];
  const D = c * s[1];
  return [A, B, C, D, p[0] - (A * a[0] + C * a[1]), p[1] - (B * a[0] + D * a[1])];
}

export const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** Rotation (deg) of a matrix's x axis in screen space. */
export const matAngle = (m) => Math.atan2(m[1], m[0]) / DEG;
