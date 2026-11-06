import type { CSSProperties, ReactNode } from "react";

/*
 Shared building blocks for profile skins. See ../Skin.tsx for the layout
 rules; the keyframes live in ../skins.css.
*/

/** Seeded random in [0, 1): the same card always gets the same scatter. */
export function rand(i: number, k = 0): number {
  const x = Math.sin(i * 12.9898 + k * 78.233 + 0.5) * 43758.5453;
  return x - Math.floor(x);
}

export const round = (n: number) => Math.round(n * 100) / 100;

export interface Particle {
  /** Left edge, % of the card's width. */
  x: number;
  /** Width, % of the card's width (the sprite is square unless it says otherwise). */
  size: number;
  /** Seconds for one trip across the card. */
  dur: number;
  /** How far through its trip it starts, 0–1, so the card is full from the first frame. */
  phase: number;
  /** Side-to-side sway, in sprite widths. */
  sway?: number;
  swayDur?: number;
  /** Seconds per turn; omit for none. Negative turns the other way. */
  spin?: number;
  /** Resting angle in degrees (also where a spin starts); scattered by default. */
  rot?: number;
  opacity?: number;
}

/**
 * Sprites travelling the full height of the card. Each is moved with a
 * transform in container units (the skin is a size container), so the
 * compositor can run it alone and its layer is only as big as the sprite.
 * `--y0` is where a sprite rests when motion is off.
 */
export function Particles({
  items,
  rise = false,
  className,
  render,
}: {
  items: Particle[];
  rise?: boolean;
  className?: string;
  render: (i: number, p: Particle) => ReactNode;
}) {
  return (
    <>
      {items.map((p, i) => (
        <span
          key={i}
          className={`sk-col${className ? ` ${className}` : ""}`}
          style={{
            left: `${round(p.x)}%`,
            width: `${round(p.size)}%`,
            opacity: p.opacity,
            "--dur": `${round(p.dur)}s`,
            "--delay": `${round(-p.phase * p.dur)}s`,
            "--y0": round(8 + p.phase * 80),
            "--sway": p.sway ?? 0,
            "--sway-dur": `${round(p.swayDur ?? 3)}s`,
            "--spin": `${round(Math.abs(p.spin ?? 0))}s`,
            "--spin-dir": (p.spin ?? 0) < 0 ? "reverse" : "normal",
            "--rot": `${round(p.rot ?? (i * 137.5) % 360)}deg`,
          } as CSSProperties}
        >
          <span className={rise ? "sk-rise" : "sk-fall"}>
            <span className="sk-sway">
              <span className={p.spin ? "sk-spin" : "sk-still"}>{render(i, p)}</span>
            </span>
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * A sprite that wanders a loop of four points (in % of the card), easing in
 * and out of each, like a moth that keeps changing its mind.
 */
export function Wander({
  points,
  dur,
  phase = 0,
  size,
  className,
  children,
}: {
  points: [number, number][];
  dur: number;
  phase?: number;
  size: number;
  className?: string;
  children: ReactNode;
}) {
  const vars: Record<string, number> = {};
  points.forEach(([x, y], i) => {
    vars[`--x${i}`] = x;
    vars[`--y${i}`] = y;
  });
  return (
    <span
      className={`sk-wander${className ? ` ${className}` : ""}`}
      style={{ ...vars, width: `${size}%`, "--dur": `${dur}s`, "--delay": `${round(-phase * dur)}s` } as CSSProperties}
    >
      <span className="sk-wander-sprite">{children}</span>
    </span>
  );
}

/** A small four-point glint, for sparkles and starlight. */
export const GLINT = "M0 -1C.16 -.28 .28 -.16 1 0C.28 .16 .16 .28 0 1C-.16 .28 -.28 .16 -1 0C-.28 -.16 -.16 -.28 0 -1Z";

export type P = [number, number];
const f = (n: number) => Math.round(n * 100) / 100;

/** Points along a Catmull-Rom curve through `pts`. */
export function spline(pts: P[], per = 10): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A smooth open path through `pts`. */
export function curve(pts: P[]): string {
  return "M" + spline(pts, 8).map(([x, y]) => `${f(x)} ${f(y)}`).join("L");
}

/**
 * A tapering limb (a branch, a frond, a tentacle) as one closed shape: the
 * curve through `pts`, `w0` wide at the start and `w1` at the tip. `lit` is a
 * thin sliver along one edge for rim light (side 1 = left of travel).
 */
export function limb(pts: P[], w0: number, w1: number, side: 1 | -1 = 1, ease = 0.85) {
  const c = spline(pts);
  const seg = c.slice(1).map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  let run = 0;
  const left: P[] = [];
  const right: P[] = [];
  const rim: P[] = [];
  c.forEach((p, i) => {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const t = run / total;
    if (i < seg.length) run += seg[i];
    const w = (w0 + (w1 - w0) * Math.pow(t, ease)) / 2;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
    rim.push([p[0] + side * nx * w * 0.5, p[1] + side * ny * w * 0.5]);
  });
  const line = (ps: P[]) => ps.map(([x, y]) => `${f(x)} ${f(y)}`).join("L");
  const tip = Math.max(0.2, (w1 / 2));
  const edge = side === 1 ? left : right;
  return {
    body: `M${line(left)}A${f(tip)} ${f(tip)} 0 0 1 ${line([...right].reverse())}Z`,
    /** The lit edge: the outline on that side and back along the inset line. */
    lit: `M${line(edge)}L${line([...rim].reverse())}Z`,
    /** Where along the limb (0–1) lands, with its direction, for hanging things off it. */
    at: (t: number) => {
      const i = Math.min(c.length - 1, Math.max(0, Math.round(t * (c.length - 1))));
      const a = c[Math.max(0, i - 1)];
      const b = c[Math.min(c.length - 1, i + 1)];
      return { x: c[i][0], y: c[i][1], angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
    },
  };
}

/**
 * A piece of artwork pinned to the card. `style` places it (left/right/top/
 * bottom) and sizes it (width, as a share of the card's width); its height
 * follows the viewBox.
 */
export function Piece({ vb, className, style, children }: { vb: string; className?: string; style: CSSProperties; children: ReactNode }) {
  return (
    <svg className={`sk-piece${className ? ` ${className}` : ""}`} viewBox={vb} style={style}>
      {children}
    </svg>
  );
}

/** Gradients shared by every sprite on the card, defined once. */
export function Defs({ children }: { children: ReactNode }) {
  return (
    <svg className="sk-defs" width="0" height="0" focusable="false">
      <defs>{children}</defs>
    </svg>
  );
}

/** A group of particles or wanderers that fades in as one. */
export function Layer({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={`sk-layer${className ? ` ${className}` : ""}`}>{children}</span>;
}
