/*
 Shared geometry for the drawn decorations. The canvas is 200 × 200 with the
 photo as the r=50 circle at (100, 100); see ../Decoration.tsx.
*/

export const C = 100;
export const PHOTO_R = 50;

/** Two decimals: keeps generated paths short and deterministic. */
export const f = (n: number) => Math.round(n * 100) / 100;

export const rad = (deg: number) => (deg * Math.PI) / 180;

/** A point `r` from (cx, cy) at `deg` (0° is +x, clockwise on screen). */
export function polar(deg: number, r: number, cx = C, cy = C): [number, number] {
  const a = rad(deg);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/**
 * For things that orbit in a tilted plane: the region they may be drawn in.
 *
 * The orbit is an ellipse centred on (ox, oy) whose major axis is turned by
 * `tilt` degrees; its far half is the side of that axis away from the
 * viewer (up the screen). An orbiter is hidden where it is both on the far
 * half and over the photo, so it passes behind the head and comes round in
 * front of it, from one layer with no second copy to keep in step.
 *
 * Returns a path for `<clipPath>` with clip-rule="evenodd": the whole canvas
 * minus (photo ∩ far half). The cut along the axis falls inside the photo,
 * where an orbiter only ever is on its near half, so nothing crosses it.
 */
export function behindClip(ox: number, oy: number, tilt: number, r = PHOTO_R, steps = 72): string {
  // Unit normal pointing to the near half (local +y after the tilt).
  const nx = -Math.sin(rad(tilt));
  const ny = Math.cos(rad(tilt));
  const side = (x: number, y: number) => (x - ox) * nx + (y - oy) * ny;
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p: [number, number] = [C + r * Math.cos(a), C + r * Math.sin(a)];
    const q: [number, number] = [C + r * Math.cos(a + (Math.PI * 2) / steps), C + r * Math.sin(a + (Math.PI * 2) / steps)];
    const sp = side(p[0], p[1]);
    const sq = side(q[0], q[1]);
    if (sp <= 0) pts.push(p);
    // Where the photo's edge crosses the axis, add the exact crossing point.
    if ((sp <= 0) !== (sq <= 0)) {
      const t = sp / (sp - sq);
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  const far = pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + "Z";
  return `M-20 -20H220V220H-20Z${far}`;
}

/** A closed tapering blade along an arc: `w` wide at its middle, pointed at both ends. */
export function arcBlade(r: number, from: number, to: number, w: number, steps = 40, cx = 0, cy = 0, power = 0.7): string {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = from + (to - from) * t;
    const half = (w / 2) * Math.pow(Math.sin(Math.PI * t), power);
    const [ox, oy] = polar(deg, r + half, cx, cy);
    const [ix, iy] = polar(deg, r - half, cx, cy);
    outer.push(`${f(ox)} ${f(oy)}`);
    inner.unshift(`${f(ix)} ${f(iy)}`);
  }
  return `M${outer.join("L")}L${inner.join("L")}Z`;
}

/** A blade that tapers one way only: `w0` wide at `from`, a point at `to`. */
export function arcTail(r: number, from: number, to: number, w0: number, steps = 24, cx = 0, cy = 0): string {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = from + (to - from) * t;
    const half = (w0 / 2) * Math.pow(1 - t, 1.3);
    const [ox, oy] = polar(deg, r + half, cx, cy);
    const [ix, iy] = polar(deg, r - half, cx, cy);
    outer.push(`${f(ox)} ${f(oy)}`);
    inner.unshift(`${f(ix)} ${f(iy)}`);
  }
  return `M${outer.join("L")}L${inner.join("L")}Z`;
}

/** An arc as an open path, for strokes. */
export function arcPath(r: number, from: number, to: number, cx = C, cy = C): string {
  const [x0, y0] = polar(from, r, cx, cy);
  const [x1, y1] = polar(to, r, cx, cy);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`;
}

/** Seeded scatter in [0, 1): the same decoration always gets the same pieces. */
export function seeded(i: number, k = 0): number {
  const x = Math.sin(i * 12.9898 + k * 78.233 + 0.31) * 43758.5453;
  return x - Math.floor(x);
}
