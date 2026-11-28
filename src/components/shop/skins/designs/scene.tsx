import type { CSSProperties, ReactNode } from "react";
import { rand } from "./parts";

/*
 Building blocks for the scene skins (December 2026): whole environments
 composed round the card rather than pieces at its edges. See ../Skin.tsx
 for the layout rules; keyframes live in ./scene.css.
*/

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * A layer that pans sideways for ever. Its tile (`w` × `h` in viewBox units)
 * is drawn twice, side by side, in a strip twice the width of its container;
 * the strip slides left by half its own width per `dur` seconds and starts
 * again where it began, which is the same picture, so the loop is seamless.
 * It moves as a whole on the compositor: nothing inside it repaints.
 *
 * The strip's height follows the tile's proportions and the container's
 * width; place it with `style` (usually `bottom`).
 */
export function Strip({
  w,
  h,
  dur,
  phase = 0,
  reverse = false,
  className,
  style,
  children,
}: {
  w: number;
  h: number;
  dur: number;
  /** How far into its loop it starts, 0–1, so layers don't all line up. */
  phase?: number;
  reverse?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      className={`scn-strip${reverse ? " scn-strip-rev" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...style, "--dur": `${dur}s`, "--delay": `${f(-phase * dur)}s` } as CSSProperties}
    >
      <svg viewBox={`0 0 ${w * 2} ${h}`} preserveAspectRatio="xMinYMax meet" focusable="false">
        <g>{children}</g>
        <g transform={`translate(${w} 0)`}>{children}</g>
      </svg>
    </span>
  );
}

/**
 * A ridge line that repeats exactly every `w` units: a sum of sines whose
 * periods divide the tile, so its two ends meet. Closed down to `h`.
 * Each wave is [amplitude, whole cycles per tile, phase in radians].
 */
export function ridge(w: number, h: number, base: number, waves: [number, number, number][], step = 2): string {
  const y = (x: number) => base + waves.reduce((s, [a, k, p]) => s + a * Math.sin((2 * Math.PI * k * x) / w + p), 0);
  const pts: string[] = [];
  for (let x = 0; x <= w + 0.001; x += step) pts.push(`${f(x)} ${f(y(x))}`);
  return `M0 ${h}L${pts.join("L")}L${w} ${h}Z`;
}

/** The same ridge as an open line along its top, for rim light. */
export function ridgeLine(w: number, base: number, waves: [number, number, number][], step = 2): string {
  const y = (x: number) => base + waves.reduce((s, [a, k, p]) => s + a * Math.sin((2 * Math.PI * k * x) / w + p), 0);
  const pts: string[] = [];
  for (let x = 0; x <= w + 0.001; x += step) pts.push(`${f(x)} ${f(y(x))}`);
  return `M${pts.join("L")}`;
}

/** Height of a ridge at x, for standing things on it. */
export function ridgeAt(w: number, base: number, waves: [number, number, number][], x: number): number {
  return base + waves.reduce((s, [a, k, p]) => s + a * Math.sin((2 * Math.PI * k * x) / w + p), 0);
}

export interface Star {
  x: number;
  y: number;
  r: number;
  /** Twinkle period (s) and offset; 0 for a steady star. */
  tw: number;
  td: number;
  o: number;
}

/** A seeded field of stars in a w × h box, a few of which twinkle. */
export function starField(n: number, w: number, h: number, seed: number, twinkleEvery = 4): Star[] {
  return Array.from({ length: n }, (_, i) => ({
    x: rand(i, seed) * w,
    y: rand(i, seed + 1) * h,
    r: 0.35 + rand(i, seed + 2) * 0.55 + (i % 9 === 0 ? 0.35 : 0),
    tw: i % twinkleEvery === 0 ? 2.4 + rand(i, seed + 3) * 3.2 : 0,
    td: -rand(i, seed + 4) * 5,
    o: 0.35 + rand(i, seed + 5) * 0.6,
  }));
}

/** Stars as one small SVG; the twinkling ones breathe on their own periods. */
export function Stars({ stars, fill = "#eef2ff" }: { stars: Star[]; fill?: string }) {
  return (
    <>
      {stars.map((s, i) => (
        <circle
          key={i}
          className={s.tw ? "scn-twinkle" : undefined}
          cx={f(s.x)}
          cy={f(s.y)}
          r={f(s.r)}
          fill={fill}
          opacity={f(s.o)}
          style={s.tw ? ({ "--tw": `${f(s.tw)}s`, "--td": `${f(s.td)}s`, "--o": f(s.o) } as CSSProperties) : undefined}
        />
      ))}
    </>
  );
}
