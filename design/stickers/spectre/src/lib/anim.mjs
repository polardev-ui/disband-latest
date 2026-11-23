// Easing curves, keyed tracks and secondary-motion springs. Time is measured in frames.

export const ease = {
  linear: (t) => t,
  hold: () => 0,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** CSS-style cubic-bezier easing. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u;
  const sy = (u) => ((ay * u + by) * u + cy) * u;
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let k = 0; k < 8; k++) {
      const e = sx(u) - x;
      const d = dx(u);
      if (Math.abs(e) < 1e-7 || Math.abs(d) < 1e-7) break;
      u -= e / d;
    }
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 30 && Math.abs(sx(u) - x) > 1e-7; k++) {
      if (sx(u) > x) hi = u;
      else lo = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

// Animator-friendly presets
export const E = {
  ...ease,
  snappy: bezier(0.2, 0, 0, 1), // fast out, long settle
  smooth: bezier(0.45, 0, 0.55, 1),
  anticipate: bezier(0.5, 0, 0.75, 0), // slow build into an action
  release: bezier(0.12, 0.8, 0.3, 1),
  overshoot: (t) => ease.outBack(t, 2.2),
  softOvershoot: (t) => ease.outBack(t, 1.2),
};

const mix = (a, b, t) =>
  Array.isArray(a) ? a.map((x, k) => x + (b[k] - x) * t) : a + (b - a) * t;

/**
 * Keyed track. keys = [[frame, value, easeToNext?], ...] sorted by frame.
 * Values may be numbers or arrays. Outside the keyed range the end values hold.
 */
export function track(keys) {
  return (f) => {
    if (f <= keys[0][0]) return keys[0][1];
    for (let k = 0; k < keys.length - 1; k++) {
      const [f0, v0, e] = keys[k];
      const [f1, v1] = keys[k + 1];
      if (f <= f1) {
        const t = (f - f0) / (f1 - f0);
        return mix(v0, v1, (e || ease.inOutSine)(t));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** Periodic wave that loops cleanly: n whole cycles per loop of N frames. */
export const wave = (f, N, n = 1, phase = 0) => Math.sin(((f / N) * n + phase) * 2 * Math.PI);

/** Smooth pulse: 0 outside [a, b], rises and falls with sine easing inside. */
export function bump(f, a, b) {
  if (f <= a || f >= b) return 0;
  return Math.sin(((f - a) / (b - a)) * Math.PI);
}

/** 0 → 1 between frames a and b with easing. */
export const ramp = (f, a, b, e = ease.inOutSine) => (f <= a ? 0 : f >= b ? 1 : e((f - a) / (b - a)));

/**
 * Damped spring driven by an input series, simulated over several loops so the
 * result is the periodic steady state, then closed exactly at the seam.
 *   x'' = stiffness * (target - x) - damping * x' + force
 * drive(f) returns { target, force }.
 */
export function springLoop(N, drive, { stiffness = 0.08, damping = 0.25, loops = 6, sub = 4 } = {}) {
  let x = drive(0).target;
  let v = 0;
  let out = [];
  for (let loop = 0; loop < loops; loop++) {
    out = [];
    for (let f = 0; f <= N; f++) {
      out.push(x);
      if (f === N) break;
      for (let s = 0; s < sub; s++) {
        const t = f + s / sub;
        const d = drive(t);
        const a = stiffness * (d.target - x) - damping * v + (d.force || 0);
        v += a / sub;
        x += v / sub;
      }
    }
  }
  // Remove the tiny residual so frame N matches frame 0 exactly.
  const err = out[N] - out[0];
  return out.map((y, f) => y - (err * f) / N);
}

/** Second derivative of a sampled function (per frame²), using a loop-aware stencil. */
export function accel(fn, N) {
  return (t) => {
    const h = 1;
    return fn(wrap(t + h, N)) - 2 * fn(wrap(t, N)) + fn(wrap(t - h, N));
  };
}

export function velocity(fn, N) {
  return (t) => (fn(wrap(t + 0.5, N)) - fn(wrap(t - 0.5, N)));
}

export const wrap = (t, N) => ((t % N) + N) % N;

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
