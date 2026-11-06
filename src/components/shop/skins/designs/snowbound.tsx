import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, GLINT, Layer, Particles, Piece, rand, spline, type P, type Particle } from "./parts";

/*
 Snowbound: snowed in for the night. Snow lies thick along the top of the
 card with icicles hanging from it and a string of fairy lights draped
 underneath. At the bottom a drift banks up into both corners: two small
 pines on the left, a snowman in a bobble hat and scarf on the right. Snow
 falls, from soft specks to big six-armed crystals.

 Intro: the drift rises, the snow slides down over the top, the icicles
 grow, the pines spring up, the snowman pops out of the drift and waves, and
 the lights come on one after another.

 Every piece is drawn at the same scale (one unit is 1/300 of the card's
 width), so the drift buries the trees and the snowman by the same amount
 on any card.
*/

const f = (n: number) => Math.round(n * 100) / 100;
const line = (ps: P[]) => ps.map(([x, y]) => `${f(x)} ${f(y)}`).join("L");

/* -------------------------------------------------------------- the ledge */

/** The underside of the snow along the top edge. */
const LEDGE: P[] = Array.from({ length: 21 }, (_, i) => [i * 15 - 0, 10.5 + rand(i, 3) * 4.5 + (i % 2) * 1.5]);
const LEDGE_CURVE = spline(LEDGE, 6);
const ledgeY = (x: number) => {
  const k = LEDGE_CURVE.findIndex(([px]) => px >= x);
  if (k <= 0) return LEDGE_CURVE[0][1];
  const [x0, y0] = LEDGE_CURVE[k - 1];
  const [x1, y1] = LEDGE_CURVE[k];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
};
const SNOW = `M-4 -4H304V${f(ledgeY(300))}L${line([...LEDGE_CURVE].reverse())}L-4 ${f(LEDGE_CURVE[0][1])}Z`;
const SNOW_TOP = `M-4 -4H304V${f(ledgeY(300) - 3.6)}L${line([...LEDGE_CURVE].reverse().map(([x, y]) => [x, y - 3.6] as P))}L-4 ${f(LEDGE_CURVE[0][1] - 3.6)}Z`;

const ICICLES = [
  [9, 15], [27, 27], [41, 10], [58, 21], [76, 33], [93, 12], [112, 24], [128, 15], [147, 30], [164, 11],
  [181, 25], [199, 17], [218, 29], [235, 12], [252, 22], [270, 34], [287, 14],
].map(([x, len], i) => ({ x, len, w: 2.2 + rand(i, 40) * 1.5, y: ledgeY(x) - 2.5, i }));
/** Icicles that drip, with when. */
const DRIPS = [{ k: 4, delay: 2.2 }, { k: 8, delay: 3.8 }, { k: 15, delay: 5.1 }, { k: 12, delay: 6.6 }];

function icicle(x: number, y: number, len: number, w: number) {
  const tip = y + len;
  return `M${f(x - w)} ${f(y)}C${f(x - w * 0.9)} ${f(y + len * 0.3)} ${f(x - w * 0.45)} ${f(y + len * 0.62)} ${f(x - 0.25)} ${f(tip - 0.6)}Q${f(x)} ${f(tip + 0.4)} ${f(x + 0.25)} ${f(tip - 0.6)}C${f(x + w * 0.4)} ${f(y + len * 0.58)} ${f(x + w * 0.85)} ${f(y + len * 0.26)} ${f(x + w)} ${f(y)}Z`;
}

/** Fairy lights hang in swags between hooks under the snow. */
const COLOURS = ["r", "y", "g", "b"] as const;
const HOOKS = [-20, 40, 100, 160, 220, 280, 340];
const BULBS = HOOKS.slice(0, -1).flatMap((x0, s) => {
  const x2 = HOOKS[s + 1];
  const y0 = ledgeY(Math.max(0, Math.min(300, x0))) + 1;
  const y2 = ledgeY(Math.max(0, Math.min(300, x2))) + 1;
  const cx = (x0 + x2) / 2;
  const cy = (y0 + y2) / 2 + 22;
  return [0.22, 0.5, 0.78].map((t, k) => {
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x2;
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y2;
    const n = s * 3 + k;
    return { x, y, tilt: (t - 0.5) * -40 + (rand(n, 50) - 0.5) * 16, colour: COLOURS[n % 4], n };
  });
});
const WIRE = HOOKS.slice(0, -1).map((x0, s) => {
  const x2 = HOOKS[s + 1];
  const y0 = ledgeY(Math.max(0, Math.min(300, x0))) + 1;
  const y2 = ledgeY(Math.max(0, Math.min(300, x2))) + 1;
  return `M${x0} ${f(y0)}Q${(x0 + x2) / 2} ${f((y0 + y2) / 2 + 22)} ${x2} ${f(y2)}`;
}).join("");

function Ledge({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 64" className="snb-ledge" style={{ left: 0, top: 0, width: "100%" }}>
      <g className="snb-ledge-in">
        {ICICLES.map(({ x, y, len, w, i }) => (
          <g key={x} className="snb-icicle" style={{ "--d": `${700 + rand(i, 41) * 600}ms`, transformOrigin: `${x}px ${f(y)}px` } as CSSProperties}>
            <path d={icicle(x, y, len, w)} fill={`url(#${uid}-ice)`} />
            <path d={`M${f(x - w * 0.55)} ${f(y + 2)}Q${f(x - w * 0.4)} ${f(y + len * 0.45)} ${f(x - 0.2)} ${f(y + len * 0.82)}`} stroke="#ffffff" strokeWidth={0.6} strokeLinecap="round" opacity={0.75} fill="none" />
          </g>
        ))}
        {DRIPS.map(({ k, delay }) => {
          const { x, y, len } = ICICLES[k];
          return (
            <g key={k} transform={`translate(${x} ${f(y + len)})`}>
              <path className="snb-drip" style={{ "--dd": `${delay}s` } as CSSProperties} d="M0 -1.2C-.9 .2 -1.3 1.2 -1.3 1.9C-1.3 2.7 -.7 3.3 0 3.3C.7 3.3 1.3 2.7 1.3 1.9C1.3 1.2 .9 .2 0 -1.2Z" fill="#dff3ff" />
            </g>
          );
        })}
        <path d={SNOW} fill="#bccfe9" />
        <path d={SNOW_TOP} fill={`url(#${uid}-snow)`} />
        <path d={`M-4 ${f(LEDGE_CURVE[0][1] - 3.6)}L${line(LEDGE_CURVE.map(([x, y]) => [x, y - 3.6] as P))}`} stroke="#ffffff" strokeWidth={0.8} opacity={0.6} fill="none" />
      </g>
      <g className="snb-lights">
        <path d={WIRE} stroke="#1d2626" strokeWidth={0.9} fill="none" />
        {BULBS.map(({ x, y, tilt, colour, n }) => (
          <g key={n} transform={`translate(${f(x)} ${f(y)}) rotate(${f(tilt)})`}>
            <g className="snb-bulb" style={{ "--n": n } as CSSProperties}>
              <circle className="snb-glow" cx={0} cy={6} r={9} fill={`url(#${uid}-glow-${colour})`} />
              <rect x={-1.5} y={-0.6} width={3} height={2.6} rx={0.5} fill="#2d3a38" />
              <path d="M0 1.6C-2.3 2.6 -2.8 6 -1.5 8.4C-.8 9.6 .8 9.6 1.5 8.4C2.8 6 2.3 2.6 0 1.6Z" fill={`url(#${uid}-bulb-${colour})`} />
              <ellipse className="snb-filament" cx={-0.5} cy={5.2} rx={0.7} ry={1.6} fill="#ffffff" opacity={0.7} />
            </g>
          </g>
        ))}
      </g>
    </Piece>
  );
}

/* ------------------------------------------------------------ the drift */

const DRIFT_EDGE: P[] = [[-4, 7], [16, 5], [38, 10], [62, 19], [92, 27], [124, 31], [156, 32], [186, 29], [212, 22], [238, 18], [262, 16], [284, 10], [304, 8]];
const DRIFT_CURVE = spline(DRIFT_EDGE, 8);
const DRIFT = `M${line(DRIFT_CURVE)}V48H-4Z`;
const DRIFT_GLINTS: P[] = [[22, 7.5], [70, 21.5], [140, 30.5], [196, 26], [250, 16], [292, 9]];

function Drift({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 44" className="snb-drift" style={{ left: 0, bottom: 0, width: "100%" }}>
      <g className="snb-drift-in">
        <path d={DRIFT} fill={`url(#${uid}-drift)`} />
        <path d={`M${line(DRIFT_CURVE)}`} stroke="#ffffff" strokeWidth={1.1} fill="none" opacity={0.8} />
        <path d="M30 18C44 16 54 20 60 26M150 38C170 36 186 37 198 34M226 30C240 26 256 26 266 22" stroke="#a9bfdf" strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.55} />
        {DRIFT_GLINTS.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(2.2)`}>
            <path className="snb-glint" style={{ "--g": `${-i * 1.37}s` } as CSSProperties} d={GLINT} fill="#ffffff" />
          </g>
        ))}
      </g>
    </Piece>
  );
}

/* -------------------------------------------------------------- the pines */

function tier(x: number, top: number, w: number, h: number) {
  const b = top + h;
  return `M${x} ${top}C${f(x - w * 0.16)} ${f(top + h * 0.42)} ${f(x - w * 0.32)} ${f(top + h * 0.8)} ${f(x - w / 2)} ${f(b)}Q${f(x - w * 0.36)} ${f(b - 2.6)} ${f(x - w * 0.22)} ${f(b - 0.6)}Q${f(x - w * 0.1)} ${f(b - 2.8)} ${x} ${f(b - 0.4)}Q${f(x + w * 0.1)} ${f(b - 2.8)} ${f(x + w * 0.22)} ${f(b - 0.6)}Q${f(x + w * 0.36)} ${f(b - 2.6)} ${f(x + w / 2)} ${f(b)}C${f(x + w * 0.32)} ${f(top + h * 0.8)} ${f(x + w * 0.16)} ${f(top + h * 0.42)} ${x} ${top}Z`;
}
/** Snow lying on the step where a tier sticks out below the one above it. */
function shelf(hw: number, y: number) {
  const s = (n: number) => f(n);
  return `M${s(-hw * 0.96)} ${s(y - 3)}H${s(hw * 0.96)}L${s(hw * 1.04)} ${s(y + 0.8)}Q${s(hw * 0.78)} ${s(y + 4)} ${s(hw * 0.52)} ${s(y + 1.9)}Q${s(hw * 0.26)} ${s(y + 4.5)} 0 ${s(y + 2.3)}Q${s(-hw * 0.26)} ${s(y + 4.5)} ${s(-hw * 0.52)} ${s(y + 1.9)}Q${s(-hw * 0.78)} ${s(y + 4)} ${s(-hw * 1.04)} ${s(y + 0.8)}Z`;
}

/**
 * A pine drawn about its base (0, 0), 100 tall: four tiers from the bottom
 * up, each overlapping the one below, with snow on every step and a cap.
 */
const TIERS = [
  { top: -54, h: 46, w: 66 },
  { top: -72, h: 41, w: 52 },
  { top: -87, h: 36, w: 38 },
  { top: -100, h: 31, w: 25 },
];
function Pine({ uid, x, base, height, delay }: { uid: string; x: number; base: number; height: number; delay: number }) {
  const k = height / 100;
  return (
    <g transform={`translate(${x} ${base}) scale(${f(k)})`}>
      <g className="snb-pine" style={{ "--d": `${delay}ms` } as CSSProperties}>
        <rect x={-3.6} y={-14} width={7.2} height={16} fill="#4a3428" />
        {TIERS.map(({ top, h, w }, i) => {
          const above = TIERS[i + 1];
          const y = above ? above.top + above.h - 1 : 0;
          const hw = (w / 2) * Math.min(1, (y - top) / h) * 1.04;
          return (
            <g key={i}>
              <path d={tier(0, top, w, h)} fill={`url(#${uid}-pine)`} />
              {above && <path d={shelf(hw, y)} fill={`url(#${uid}-shelf)`} />}
            </g>
          );
        })}
        <path d="M0 -101.5C-2.6 -97 -5.4 -92 -8.4 -88.6Q-5.6 -86.4 -3 -88.4Q-.6 -85.8 1.8 -88Q4.6 -86 7.6 -88.8C5 -92 2.4 -97 0 -101.5Z" fill="#ffffff" />
      </g>
    </g>
  );
}

function Pines({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 80 90" className="snb-pines" style={{ left: 0, bottom: 0, width: "29%" }}>
      <Pine uid={uid} x={25} base={79} height={73} delay={650} />
      <Pine uid={uid} x={58} base={78} height={47} delay={820} />
    </Piece>
  );
}

/* ----------------------------------------------------------- the snowman */

function Snowman({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 90 100" className="snb-snowman" style={{ right: 0, bottom: 0, width: "27%" }}>
      <g className="snb-pop">
        <g className="snb-arm-l">
          <path d="M31 52L14 42.5M20.5 46L16.5 39.5M17.5 44.2L10.8 43.8" stroke="#5e4130" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </g>
        <g className="snb-wave">
          <path d="M61 51L76 38.5M71.4 42.4L76.6 44.2M74 40.2L74.6 33.6" stroke="#5e4130" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </g>
        <circle cx={46} cy={72} r={20} fill={`url(#${uid}-ball)`} />
        <circle cx={46} cy={50} r={14.5} fill={`url(#${uid}-ball)`} />
        <g fill="#2b2f38">
          <circle cx={46} cy={44} r={1.4} />
          <circle cx={46} cy={50.5} r={1.4} />
          <circle cx={46} cy={57} r={1.4} />
        </g>
        <circle cx={46} cy={28} r={11.5} fill={`url(#${uid}-ball)`} />
        {/* Scarf: the wrap, then the tail that flutters. */}
        <g className="snb-tail">
          <path d="M49.6 39.5C51.5 44 52.5 49 52 55L57.5 54.2C57.4 48.5 55.6 43 52.8 38.6Z" fill="#cf3b37" />
          <path d="M50.6 43.4L54.6 42.6M51.4 47.6L55.8 46.8M51.8 51.6L56.6 50.8" stroke="#f5efe4" strokeWidth={1.3} />
          <path d="M52.2 55L51.8 58M53.8 54.8L53.6 58.2M55.4 54.6L55.6 57.8M57 54.3L57.6 57.4" stroke="#cf3b37" strokeWidth={0.9} strokeLinecap="round" />
        </g>
        <path d="M34.4 36.4C40 40 52 40 57.6 36.4L58.4 41C52.4 44.8 39.6 44.8 33.6 41Z" fill="#cf3b37" />
        <path d="M38.6 38.8L39 43.2M44 39.9L44.1 44.3M49.6 39.8L49.4 44.2M54.6 38.4L54.2 42.8" stroke="#f5efe4" strokeWidth={1.4} />
        <path d="M34.4 36.4C40 40 52 40 57.6 36.4" stroke="#e8625a" strokeWidth={0.7} fill="none" />
        {/* Face. */}
        <g className="snb-eyes">
          <ellipse cx={41.8} cy={26.2} rx={1.5} ry={1.7} fill="#2b2f38" />
          <ellipse cx={50.2} cy={26.2} rx={1.5} ry={1.7} fill="#2b2f38" />
          <circle cx={41.3} cy={25.6} r={0.45} fill="#ffffff" />
          <circle cx={49.7} cy={25.6} r={0.45} fill="#ffffff" />
        </g>
        <path d="M46 29C49 29.3 54 30.6 58.6 32.3C54.2 32.6 49.2 32.4 46 31.6Z" fill="#f4893c" />
        <path d="M49.5 29.6L49.9 31.8M52.8 30.4L53.1 32.2" stroke="#c75f1d" strokeWidth={0.5} />
        <g fill="#2b2f38">
          <circle cx={40.6} cy={32.4} r={0.75} />
          <circle cx={42.9} cy={33.9} r={0.75} />
          <circle cx={45.6} cy={34.5} r={0.75} />
        </g>
        <ellipse cx={38.6} cy={30.4} rx={2.1} ry={1.3} fill="#ff9aa6" opacity={0.45} />
        <ellipse cx={53.6} cy={30.6} rx={1.8} ry={1.2} fill="#ff9aa6" opacity={0.4} />
        {/* Bobble hat. */}
        <path d="M35 21.5C34.6 12.6 39.8 7.8 46 7.8C52.2 7.8 57.4 12.6 57 21.5Z" fill="#2f6fcf" />
        <path d="M39.4 20.6C39.2 15 41.6 11 44.2 9.2M46 20.6V8.6M52.6 20.6C52.8 15 50.4 11 47.8 9.2" stroke="#2559ad" strokeWidth={0.9} fill="none" />
        <path d="M33.8 19.6C40 17.6 52 17.6 58.2 19.6L58.4 24.2C52 22.4 40 22.4 33.6 24.2Z" fill="#f5efe4" />
        <path d="M37.4 18.8V23.2M41 18.2V22.6M44.6 18V22.4M48.2 18V22.4M51.8 18.2V22.6M55.4 18.8V23.2" stroke="#ddd3c3" strokeWidth={0.8} />
        <circle cx={46} cy={7.2} r={4} fill="#f5efe4" />
        <circle cx={44.8} cy={6} r={1.4} fill="#ffffff" opacity={0.8} />
      </g>
    </Piece>
  );
}

/* --------------------------------------------------------------- the snow */

const N_SPECKS = 24;
const SPECKS: Particle[] = Array.from({ length: N_SPECKS }, (_, i) => ({
  x: (((i * 7) % N_SPECKS) + rand(i, 61)) * (98 / N_SPECKS),
  size: 0.9 + rand(i, 62) * 1,
  dur: 8 + rand(i, 63) * 8,
  phase: rand(i, 64),
  sway: 1.5 + rand(i, 65) * 2.5,
  swayDur: 2 + rand(i, 66) * 2,
  opacity: 0.45 + rand(i, 67) * 0.45,
}));
const N_FLAKES = 9;
const FLAKES: Particle[] = Array.from({ length: N_FLAKES }, (_, i) => ({
  x: (((i * 4) % N_FLAKES) + rand(i, 71) * 0.8) * (96 / N_FLAKES),
  size: 2.6 + rand(i, 72) * 1.8,
  dur: 13 + rand(i, 73) * 7,
  phase: rand(i, 74),
  sway: 0.5 + rand(i, 75) * 0.6,
  swayDur: 3 + rand(i, 76) * 2,
  spin: (rand(i, 77) > 0.5 ? 1 : -1) * (9 + rand(i, 78) * 8),
  opacity: 0.8 + rand(i, 79) * 0.2,
}));

/** A six-armed crystal: one arm with its side branches, turned six ways. */
const ARM = "M0 0L0 -10M0 -4.2L-2.6 -6.6M0 -4.2L2.6 -6.6M0 -7.2L-1.8 -8.9M0 -7.2L1.8 -8.9";
const CRYSTAL = [0, 60, 120, 180, 240, 300].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return ARM.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => `${f(x * Math.cos(a) - y * Math.sin(a))} ${f(x * Math.sin(a) + y * Math.cos(a))}`);
}).join("");

export function Snowbound({ uid }: SkinProps) {
  const bulb = (id: string, light: string, mid: string, dark: string) => (
    <radialGradient id={`${uid}-bulb-${id}`} cx=".4" cy=".55" r=".7">
      <stop offset="0" stopColor={light} />
      <stop offset=".5" stopColor={mid} />
      <stop offset="1" stopColor={dark} />
    </radialGradient>
  );
  const glow = (id: string, colour: string) => (
    <radialGradient id={`${uid}-glow-${id}`}>
      <stop offset="0" stopColor={colour} stopOpacity=".7" />
      <stop offset=".4" stopColor={colour} stopOpacity=".22" />
      <stop offset="1" stopColor={colour} stopOpacity="0" />
    </radialGradient>
  );
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-ice`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a9d8f6" stopOpacity=".9" />
          <stop offset=".45" stopColor="#eaf8ff" stopOpacity=".96" />
          <stop offset="1" stopColor="#7fbde6" stopOpacity=".88" />
        </linearGradient>
        <linearGradient id={`${uid}-snow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".4" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6eefa" />
        </linearGradient>
        <linearGradient id={`${uid}-drift`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset=".55" stopColor="#dde8f6" />
          <stop offset="1" stopColor="#bacde6" />
        </linearGradient>
        <linearGradient id={`${uid}-pine`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b8f68" />
          <stop offset=".55" stopColor="#25694f" />
          <stop offset="1" stopColor="#174536" />
        </linearGradient>
        <linearGradient id={`${uid}-shelf`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#eef4fc" />
          <stop offset="1" stopColor="#c3d4ec" />
        </linearGradient>
        <radialGradient id={`${uid}-ball`} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#eef4fc" />
          <stop offset="1" stopColor="#b9cce6" />
        </radialGradient>
        {bulb("r", "#ffd0c8", "#ff5b52", "#c22a2a")}
        {bulb("y", "#fff6cf", "#ffd04d", "#d79a12")}
        {bulb("g", "#d8ffe2", "#4fd884", "#1f9a52")}
        {bulb("b", "#d6efff", "#56b4ff", "#2a6fd0")}
        {glow("r", "#ff6b5e")}
        {glow("y", "#ffd45e")}
        {glow("g", "#5ee08e")}
        {glow("b", "#64bcff")}
      </Defs>
      <Pines uid={uid} />
      <Snowman uid={uid} />
      <Drift uid={uid} />
      <Ledge uid={uid} />
      <Layer className="snb-air">
        <Particles
          items={SPECKS}
          render={() => (
            <svg viewBox="-5 -5 10 10">
              <circle r={4} fill="#ffffff" opacity={0.95} />
            </svg>
          )}
        />
        <Particles
          items={FLAKES}
          render={() => (
            <svg viewBox="-11 -11 22 22">
              <path d={CRYSTAL} stroke="#ffffff" strokeWidth={1.1} strokeLinecap="round" fill="none" />
              <circle r={1.3} fill="#ffffff" />
            </svg>
          )}
        />
      </Layer>
    </>
  );
}
