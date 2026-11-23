// Minimal Lottie (Bodymovin 5.x schema) writer.
// Animated values are sampled once per frame and reduced to the fewest linear
// keyframes that stay within a sub-pixel tolerance, so playback at 60 fps (and
// in-between frames on high-refresh screens) matches the sampled motion.

export class Series {
  constructor(values, tol) {
    this.values = values;
    this.tol = tol; // optional keyframe-reduction tolerance override
  }
}

/** Sample fn(f) for f = 0..N inclusive (frame N must equal frame 0 for a seamless loop). */
export const series = (N, fn, tol) => new Series(Array.from({ length: N + 1 }, (_, f) => fn(f)), tol);

const round = (x, dp = 2) => {
  const m = 10 ** dp;
  const v = Math.round(x * m) / m;
  return Object.is(v, -0) ? 0 : v;
};

export function rgba(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1].map((c) => round(c, 4));
}

const TOL = { pos: 0.1, scale: 0.12, rot: 0.06, opacity: 0.5, path: 0.14, num: 0.06 };

const flatPath = (p) => [...p.v.flat(), ...p.i.flat(), ...p.o.flat()];

const pathJSON = (p, dp) => ({
  i: p.i.map((q) => [round(q[0], dp), round(q[1], dp)]),
  o: p.o.map((q) => [round(q[0], dp), round(q[1], dp)]),
  v: p.v.map((q) => [round(q[0], dp), round(q[1], dp)]),
  c: p.c,
});

/** Douglas–Peucker over time: keep the frames needed for linear interpolation within tol. */
function reduce(flat, tol) {
  const N = flat.length - 1;
  const keep = new Uint8Array(N + 1);
  keep[0] = 1;
  keep[N] = 1;
  const stack = [[0, N]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let wi = -1;
    const A = flat[a];
    const B = flat[b];
    for (let k = a + 1; k < b; k++) {
      const t = (k - a) / (b - a);
      const S = flat[k];
      let e = 0;
      for (let d = 0; d < S.length; d++) {
        const err = Math.abs(S[d] - (A[d] + (B[d] - A[d]) * t));
        if (err > e) e = err;
      }
      if (e > worst) {
        worst = e;
        wi = k;
      }
    }
    if (worst > tol) {
      keep[wi] = 1;
      stack.push([a, wi], [wi, b]);
    }
  }
  return keep;
}

const LIN_O = { x: 0, y: 0 };
const LIN_I = { x: 1, y: 1 };

/**
 * Convert a static value or Series into a Lottie animatable property.
 * kind: 'pos' | 'scale' | 'rot' | 'opacity' | 'num' | 'path'
 * dims: for vectors, pad to this many components (Lottie layers use 3).
 */
export function prop(x, kind = 'num', { dims = 0, dp = kind === 'path' ? 1 : 2, tol } = {}) {
  const fmt = (val) => {
    if (kind === 'path') return [pathJSON(val, dp)];
    let arr = Array.isArray(val) ? val.map((c) => round(c, dp)) : [round(val, dp)];
    if (dims && arr.length < dims) arr = [...arr, ...Array(dims - arr.length).fill(kind === 'scale' ? 100 : 0)];
    return arr;
  };
  const statik = (val) => {
    const nums = kind === 'path' ? flatPath(val) : Array.isArray(val) ? val : [val];
    if (nums.some((c) => !Number.isFinite(c))) throw new Error(`Non-finite static ${kind} value`);
    if (kind === 'path') return { a: 0, k: pathJSON(val, dp) };
    const arr = fmt(val);
    return { a: 0, k: Array.isArray(val) || dims ? arr : arr[0] };
  };
  if (!(x instanceof Series)) return statik(x);
  const vals = x.values;
  const flat = vals.map((v) => (kind === 'path' ? flatPath(v) : Array.isArray(v) ? v : [v]));
  for (let f = 0; f < flat.length; f++) {
    if (flat[f].some((c) => !Number.isFinite(c))) throw new Error(`Non-finite ${kind} value at frame ${f}`);
  }
  const t = tol ?? x.tol ?? TOL[kind] ?? TOL.num;
  // Constant?
  let constant = true;
  for (let f = 1; f < flat.length && constant; f++) {
    for (let d = 0; d < flat[0].length; d++) {
      if (Math.abs(flat[f][d] - flat[0][d]) > t * 0.5) {
        constant = false;
        break;
      }
    }
  }
  if (constant) return statik(vals[0]);
  const keep = reduce(flat, t);
  const k = [];
  const last = vals.length - 1;
  for (let f = 0; f <= last; f++) {
    if (!keep[f]) continue;
    const kf = { t: f, s: fmt(vals[f]) };
    if (f !== last) {
      kf.i = LIN_I;
      kf.o = LIN_O;
    }
    k.push(kf);
  }
  return { a: 1, k };
}

/** Hold (step) keyframes for discrete switches, e.g. [[0, 0], [40, 100]]. */
export function holdProp(keys) {
  return {
    a: 1,
    k: keys.map(([t, v], idx) => (idx === keys.length - 1 ? { t, s: [v] } : { t, s: [v], h: 1 })),
  };
}

// ---------------------------------------------------------------------------
// Shapes

export const sh = (path, nm) => ({ ty: 'sh', nm, ks: prop(path, 'path') });

export const fl = (hex, opacity = 100, rule = 1) => ({
  ty: 'fl',
  c: { a: 0, k: rgba(hex) },
  o: opacity instanceof Series ? prop(opacity, 'opacity') : { a: 0, k: opacity },
  r: rule,
});

export const st = (hex, width, { cap = 2, join = 2, opacity = 100 } = {}) => ({
  ty: 'st',
  c: { a: 0, k: rgba(hex) },
  o: opacity instanceof Series ? prop(opacity, 'opacity') : { a: 0, k: opacity },
  w: width instanceof Series ? prop(width, 'num') : { a: 0, k: width },
  lc: cap,
  lj: join,
  ml: 4,
});

/** Radial gradient fill. stops: [[position 0..1, hex, alpha 0..1], ...]; centre at `start`, radius to `end`. */
export function gfRadial(stops, { start = [0, 0], end = [20, 0], opacity = 100 } = {}) {
  const cols = stops.flatMap(([p, hex]) => [p, ...rgba(hex).slice(0, 3)]);
  const alphas = stops.flatMap(([p, , a]) => [p, a]);
  return {
    ty: 'gf',
    o: opacity instanceof Series ? prop(opacity, 'opacity') : { a: 0, k: opacity },
    r: 1,
    bm: 0,
    g: { p: stops.length, k: { a: 0, k: [...cols, ...alphas] } },
    s: { a: 0, k: start },
    e: { a: 0, k: end },
    t: 2,
    h: { a: 0, k: 0 },
    a: { a: 0, k: 0 },
  };
}

/** Trim paths (start/end in %). */
export const tm = (start = 0, end = 100, offset = 0) => ({
  ty: 'tm',
  s: start instanceof Series ? prop(start, 'num') : { a: 0, k: start },
  e: end instanceof Series ? prop(end, 'num') : { a: 0, k: end },
  o: offset instanceof Series ? prop(offset, 'num') : { a: 0, k: offset },
  m: 1,
});

export function tr({ p = [0, 0], a = [0, 0], s = [100, 100], r = 0, o = 100 } = {}) {
  return {
    ty: 'tr',
    p: prop(p, 'pos'),
    a: prop(a, 'pos'),
    s: prop(s, 'scale'),
    r: prop(r, 'rot'),
    o: prop(o, 'opacity'),
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
  };
}

export const gr = (nm, items, transform = {}) => ({ ty: 'gr', nm, it: [...items.filter(Boolean), tr(transform)] });

// ---------------------------------------------------------------------------
// Layers and composition

export function layerKs({ p = [0, 0], a = [0, 0], s = [100, 100], r = 0, o = 100 } = {}) {
  return {
    o: prop(o, 'opacity'),
    r: prop(r, 'rot'),
    p: prop(p, 'pos', { dims: 3 }),
    a: prop(a, 'pos', { dims: 3 }),
    s: prop(s, 'scale', { dims: 3 }),
  };
}

export function shapeLayer({ ind, nm, parent, ks = {}, shapes, op, td, tt }) {
  const L = { ddd: 0, ind, ty: 4, nm, sr: 1, ks: layerKs(ks), ao: 0, shapes, ip: 0, op, st: 0, bm: 0 };
  if (parent) L.parent = parent;
  if (td) L.td = td; // this layer is a matte for the layer below it
  if (tt) L.tt = tt; // 1 = alpha matte, 2 = inverted alpha matte
  return L;
}

export function nullLayer({ ind, nm, parent, ks = {}, op }) {
  const L = { ddd: 0, ind, ty: 3, nm, sr: 1, ks: layerKs(ks), ao: 0, ip: 0, op, st: 0, bm: 0 };
  if (parent) L.parent = parent;
  return L;
}

export function composition({ nm, w = 320, h = 320, fr = 60, op, layers, meta }) {
  return { v: '5.12.0', fr, ip: 0, op, w, h, nm, ddd: 0, assets: [], layers, markers: [], meta };
}
