import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, GLINT, Layer, Piece, type P, limb, rand } from "./parts";

/*
 Afterglow: a retro sunset along the bottom of the card. A striped sun sinks
 into a valley between neon-edged mountains, a glowing grid floor runs
 towards you for ever, palms lean in from both corners, and gulls cross a
 sky that is just starting to show its stars.

 The floor is HTML. Its receding lines are drawn once; each crossing line is
 its own element following the same perspective curve (bunched up at the
 horizon, spreading as it comes near), set off at even intervals, so the
 floor scrolls on the compositor without repainting anything.

 Everything is sized by the card's width (the floor is 11cqw deep, the
 horizon sits on top of it), so the scene keeps its shape on any card.

 Intro: the horizon line draws out, the floor lights up, the mountains rise,
 the sun comes up into its valley, the palms spring up and the stars come
 out. Then the floor runs, the palms sway, the sun glows and gulls go by.
*/

const f = (n: number) => Math.round(n * 100) / 100;
const rad = (deg: number) => (deg * Math.PI) / 180;

/* ------------------------------------------------------------------ floor */

/** The floor's viewBox is 300 wide and FLOOR_H deep: 11cqw at any card size. */
const FLOOR_H = 33;
/** Where the receding lines meet, just above the floor (under the sun). */
const VP = { x: 205, y: -8 };

/** The receding lines, as thin wedges: hairlines far off, wider up close. */
const RAYS = (() => {
  const spread = 34 / (FLOOR_H - VP.y); // ~34 apart along the bottom edge
  let d = "";
  for (let k = -32; k <= 15; k++) {
    const x0 = VP.x + k * spread * -VP.y;
    const x1 = VP.x + k * spread * (40 - VP.y);
    const len = Math.hypot(x1 - x0, 40);
    const nx = -40 / len;
    const ny = (x1 - x0) / len;
    const w0 = 0.12;
    const w1 = 0.75;
    d += `M${f(x0 + nx * w0)} ${f(ny * w0)}L${f(x1 + nx * w1)} ${f(40 + ny * w1)}L${f(x1 - nx * w1)} ${f(40 - ny * w1)}L${f(x0 - nx * w0)} ${f(-ny * w0)}Z`;
  }
  return d;
})();

/** One trip of a crossing line: [progress, depth into the floor 0–1, thickness, opacity]. */
const TRIP: [number, number, number, number][] = [
  [0, 0, 0.3, 0], [0.2, 0.059, 0.38, 0.4], [0.4, 0.143, 0.48, 0.62], [0.55, 0.234, 0.58, 0.74],
  [0.7, 0.368, 0.74, 0.84], [0.8, 0.5, 0.9, 0.9], [0.9, 0.692, 1.15, 0.95], [1, 1, 1.5, 1],
];
const LINES = 9;
const LINE_DUR = 3.6;

/** Where a line is `u` of the way through its trip (for the still pose). */
function tripAt(u: number) {
  const i = Math.max(0, TRIP.findIndex(([p]) => p > u) - 1);
  const [p0, y0, s0, o0] = TRIP[i];
  const [p1, y1, s1, o1] = TRIP[i + 1];
  const k = (u - p0) / (p1 - p0);
  return { y: y0 + (y1 - y0) * k, s: s0 + (s1 - s0) * k, o: o0 + (o1 - o0) * k };
}

function Floor({ uid }: { uid: string }) {
  return (
    <span className="agl-floor">
      <span className="agl-floor-in">
        <svg className="agl-rays" viewBox={`0 0 300 ${FLOOR_H}`}>
          <path d={RAYS} fill={`url(#${uid}-grid)`} />
        </svg>
        {Array.from({ length: LINES }, (_, k) => {
          const u = k / LINES;
          const at = tripAt(u);
          return (
            <span
              key={k}
              className="agl-line"
              style={{ "--y": f(at.y * 11), "--s": f(at.s), "--o": f(at.o), "--d": `${f(-u * LINE_DUR)}s` } as CSSProperties}
            />
          );
        })}
      </span>
    </span>
  );
}

/* ---------------------------------------------------- sun and mountains */

/** The horizon piece is 300 × 60; the floor starts at its bottom edge. */
const SUN = { x: VP.x, y: 60, r: 32 };
/** Gaps across the lower half of the sun, wider as they go down. */
const STRIPES = [
  { y: 43.6, h: 0.9 }, { y: 47.8, h: 1.35 }, { y: 51.6, h: 1.8 }, { y: 55.1, h: 2.3 }, { y: 58.4, h: 2.8 },
];
const BACK_L = "M-4 60V52L10 50L22 54L40 38L54 47L66 43L84 52L100 49L122 57L140 60Z";
const BACK_R = "M230 60L248 51L262 55L280 40L292 47L304 43V60Z";
const FRONT_L = "M-4 60V48L8 41L18 47L32 29L46 45L56 40L74 55L90 60Z";
const FRONT_R = "M252 60L268 49L277 53L292 35L304 44V60Z";
/** The lit ridgelines along the tops of the front ranges, and their creases. */
const EDGE = "M-4 48L8 41L18 47L32 29L46 45L56 40L74 55L90 60M252 60L268 49L277 53L292 35L304 44";
const BACK_EDGE = "M-4 52L10 50L22 54L40 38L54 47L66 43L84 52L100 49L122 57L140 60M230 60L248 51L262 55L280 40L292 47L304 43";
const CREASES = "M32 29L35 41L30 52L33 60M32 29L25 40M56 40L58 50L54 60M8 41L11 52M292 35L289 47L294 60M292 35L299 45M268 49L270 60";

function Horizon({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 60" className="agl-horizon-piece" style={{ left: 0, bottom: "11cqw", width: "100%" }}>
      <rect x={-4} y={0} width={308} height={60} fill={`url(#${uid}-haze)`} className="agl-haze" />
      <g clipPath={`url(#${uid}-above)`}>
        <g className="agl-sun">
          <g mask={`url(#${uid}-stripes)`}>
            <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill={`url(#${uid}-sun)`} />
          </g>
        </g>
        <g className="agl-back">
          <path d={BACK_L + BACK_R} fill="#45206f" />
          <path d={BACK_EDGE} stroke="#c06cff" strokeWidth={0.6} strokeLinejoin="round" fill="none" opacity={0.75} />
        </g>
        <g className="agl-front">
          <path d={FRONT_L + FRONT_R} fill="#1a0c30" />
          <path d={CREASES} stroke="#ff5fd2" strokeWidth={0.45} strokeLinecap="round" fill="none" opacity={0.45} />
          <path d={EDGE} stroke="#ff6ad5" strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round" fill="none" />
        </g>
      </g>
    </Piece>
  );
}

/* ---------------------------------------------------------------- clouds */

/**
 * A long, low cloud lit from underneath: lumps along the top (`lobes`, as
 * [width, height]) on a flat, slightly sagging underside at y = 8.
 */
function cloud(lobes: [number, number][]) {
  const base = 8;
  let x = 0;
  let d = `M0 ${base}`;
  lobes.forEach(([w, h], i) => {
    const next = lobes[i + 1]?.[1] ?? 0;
    const shoulder = Math.min(h, next) * 0.45;
    x += w;
    d += `A${f(w / 2)} ${f(h)} 0 0 1 ${f(x)} ${f(base - shoulder)}`;
  });
  return `${d}L${f(x)} ${base}C${f(x * 0.7)} ${base + 1.3} ${f(x * 0.3)} ${base + 1.3} 0 ${base}Z`;
}
const CLOUDS = [
  { d: cloud([[7, 0.9], [9, 1.7], [12, 2.8], [16, 4.3], [14, 3.6], [12, 2.5], [11, 1.9], [10, 1.3], [9, 0.8]]), left: 44, bottom: 17.2, width: 26, dur: 23, delay: -4 },
  { d: cloud([[9, 1.1], [14, 2.6], [20, 4.1], [17, 3.1], [14, 2], [12, 1.2], [14, 0.7]]), left: 70, bottom: 13.6, width: 15, dur: 17, delay: -11 },
];

/* ----------------------------------------------------------------- palms */

const g = (n: number) => Math.round(n * 10) / 10;

/**
 * A frond: a stem that arches out and droops at the tip, with narrow
 * leaflets hanging off both sides (longest mid-way, raked towards the tip).
 */
function frond(cx: number, cy: number, angle: number, len: number, droop: number) {
  const dx = Math.cos(rad(angle));
  const dy = Math.sin(rad(angle));
  const stem = limb(
    [[cx, cy], [cx + dx * len * 0.42, cy + dy * len * 0.42 - len * 0.2], [cx + dx * len * 0.8, cy + dy * len * 0.8 + droop * 0.45], [cx + dx * len, cy + dy * len + droop]],
    1.5, 0.25, 1, 1,
  );
  let d = stem.body;
  const K = 11;
  for (let i = 0; i < K; i++) {
    const t = 0.2 + (i / K) * 0.77;
    const p = stem.at(t);
    const q = stem.at(Math.min(1, t + 0.07));
    const tx = Math.cos(rad(p.angle));
    const ty = Math.sin(rad(p.angle));
    const L = len * 0.3 * Math.sin(Math.PI * Math.min(1, (t - 0.12) * 1.2));
    for (const s of [1, -1]) {
      let vx = tx * 0.7 - ty * s * 0.7;
      let vy = ty * 0.7 + tx * s * 0.7 + 0.6;
      const m = Math.hypot(vx, vy);
      vx /= m;
      vy /= m;
      d += `M${g(p.x)} ${g(p.y)}L${g(p.x + vx * L)} ${g(p.y + vy * L)}L${g(q.x)} ${g(q.y)}Z`;
    }
  }
  return d;
}

/** [angle, length, droop] for each frond, as shares of the palm's frond size. */
const CROWN: [number, number, number][] = [
  [-136, 0.85, 0.34], [-46, 0.9, 0.36], [-166, 1, 0.5], [-12, 1, 0.52], [156, 0.8, 0.6], [26, 0.82, 0.58], [112, 0.55, 0.45],
];

interface PalmSpec { x: number; base: number; lean: number; height: number; size: number; delay: number; lit: 1 | -1 }

function Palm({ x, base, lean, height, size, delay, lit }: PalmSpec) {
  const top: P = [x + lean, base - height];
  const trunk = limb([[x, base], [x + lean * 0.2, base - height * 0.4], [x + lean * 0.65, base - height * 0.78], top], 6, 3, lit, 1);
  const rings = Array.from({ length: 12 }, (_, i) => {
    const t = 0.06 + i * 0.075;
    const p = trunk.at(t);
    const w = (6 + (3 - 6) * t) / 2;
    const nx = -Math.sin(rad(p.angle)) * w;
    const ny = Math.cos(rad(p.angle)) * w;
    return `M${g(p.x + nx)} ${g(p.y + ny)}Q${g(p.x)} ${g(p.y + 1.2)} ${g(p.x - nx)} ${g(p.y - ny)}`;
  }).join("");
  const leaves = CROWN.map(([ang, l, dr]) => frond(top[0], top[1], ang, size * l, size * dr)).join("");
  return (
    <g className="agl-palm" style={{ "--d": `${delay}ms`, transformOrigin: `${x}px ${base}px` } as CSSProperties}>
      <path d={trunk.body} fill="#211038" />
      <path d={rings} stroke="#3b1c5c" strokeWidth={0.6} fill="none" />
      <path d={trunk.lit} fill="#ff6fae" opacity={0.6} />
      <path d={leaves} fill="#ff6fae" opacity={0.6} transform={`translate(${f(lit * 0.45)} -0.45)`} />
      <path d={leaves} fill="#211038" />
      <circle cx={top[0] - 1.8} cy={top[1] + 2.4} r={1.9} fill="#2d1550" />
      <circle cx={top[0] + 1.7} cy={top[1] + 2.8} r={1.9} fill="#2d1550" />
      <circle cx={top[0]} cy={top[1] + 4.1} r={1.8} fill="#25113f" />
    </g>
  );
}

/* ------------------------------------------------------------------- sky */

const STARS = Array.from({ length: 22 }, (_, i) => ({
  x: rand(i, 141) * 96 + 2,
  y: rand(i, 142) * 50 + 2,
  s: i % 6 === 0 ? 2.1 + rand(i, 143) * 0.8 : 0.55 + rand(i, 143) * 0.55,
  dur: 1.8 + rand(i, 144) * 2.6,
  delay: -rand(i, 145) * 4,
  glint: i % 6 === 0,
  colour: ["#ffffff", "#9ff4ff", "#ffc2f1"][i % 3],
}));

/** A gull from below: wings raised at the wrist, tips swept down. */
const GULL =
  "M0 -.2C1.2 -1.4 2.4 -2 3.4 -1.9C5 -1.7 6.4 -.6 7.8 .7C6.2 -.1 4.8 -.5 3.6 -.4C2.4 -.3 1.3 .5 .5 1.3Q0 1.8 -.5 1.3C-1.3 .5 -2.4 -.3 -3.6 -.4C-4.8 -.5 -6.2 -.1 -7.8 .7C-6.4 -.6 -5 -1.7 -3.4 -1.9C-2.4 -2 -1.2 -1.4 0 -.2Z";

/** A flock of three: a couple of beats, a glide, out of step with each other. */
const GULLS = [
  { x: 0, y: 30, s: 26, fd: 2.3, fdl: -0.4 },
  { x: 30, y: 0, s: 21, fd: 2.6, fdl: -1.1 },
  { x: 56, y: 46, s: 17, fd: 2.1, fdl: -1.7 },
];

export function Afterglow({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-sun`} gradientUnits="userSpaceOnUse" x1="0" y1={SUN.y - SUN.r} x2="0" y2={SUN.y}>
          <stop offset="0" stopColor="#fff38a" />
          <stop offset=".38" stopColor="#ffb14d" />
          <stop offset=".72" stopColor="#ff608f" />
          <stop offset="1" stopColor="#e047ab" />
        </linearGradient>
        <linearGradient id={`${uid}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".2" stopColor="#ff4fb8" stopOpacity="0" />
          <stop offset="1" stopColor="#ff4fb8" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${uid}-grid`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={FLOOR_H}>
          <stop offset="0" stopColor="#ff4fd8" stopOpacity=".15" />
          <stop offset=".4" stopColor="#ff4fd8" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff4fd8" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id={`${uid}-cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6a2f8e" />
          <stop offset=".55" stopColor="#c24c94" />
          <stop offset="1" stopColor="#ffa27f" />
        </linearGradient>
        <radialGradient id={`${uid}-venus`}>
          <stop offset="0" stopColor="#ffd9f1" stopOpacity=".75" />
          <stop offset=".35" stopColor="#ff9be0" stopOpacity=".22" />
          <stop offset="1" stopColor="#ff9be0" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-above`}>
          <rect x={-10} y={-10} width={320} height={70} />
        </clipPath>
        <mask id={`${uid}-stripes`} maskUnits="userSpaceOnUse" x={150} y={20} width={110} height={50}>
          <rect x={150} y={20} width={110} height={50} fill="#ffffff" />
          {STRIPES.map((s) => <rect key={s.y} x={150} y={s.y} width={110} height={s.h} fill="#000000" />)}
        </mask>
      </Defs>
      <Layer className="agl-sky">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="agl-star"
            style={{ left: `${f(s.x)}%`, top: `${f(s.y)}%`, width: `${f(s.s)}%`, "--tw": `${f(s.dur)}s`, "--td": `${f(s.delay)}s` } as CSSProperties}
          >
            <svg viewBox="-1 -1 2 2">{s.glint ? <path d={GLINT} fill={s.colour} /> : <circle r={0.55} fill={s.colour} />}</svg>
          </span>
        ))}
        <span className="agl-venus">
          <svg viewBox="-10 -10 20 20">
            <circle r={9} fill={`url(#${uid}-venus)`} />
            <path d="M-9.5 0Q0 -.35 9.5 0Q0 .35 -9.5 0Z" fill="#ffe7f6" opacity={0.7} />
            <path d={GLINT} transform="scale(3.6)" fill="#fff6fb" />
          </svg>
        </span>
        <span className="agl-flock">
          {GULLS.map((g, i) => (
            <span key={i} className="agl-gull" style={{ left: `${g.x}%`, top: `${g.y}%`, width: `${g.s}%`, "--fd": `${g.fd}s`, "--fdl": `${g.fdl}s` } as CSSProperties}>
              <svg viewBox="-8 -4 16 8">
                <path d={GULL} fill="#b05fa6" />
              </svg>
            </span>
          ))}
        </span>
      </Layer>
      <span className="agl-glow" />
      <Floor uid={uid} />
      <Horizon uid={uid} />
      <span className="agl-horizon" />
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          className="agl-cloud"
          style={{ left: `${c.left}%`, bottom: `${c.bottom}cqw`, width: `${c.width}%`, "--cd": `${c.dur}s`, "--cdl": `${c.delay}s` } as CSSProperties}
        >
          <svg viewBox="0 2 100 8">
            <path d={c.d} fill={`url(#${uid}-cloud)`} />
            <path d="M4 8.35C30 9.45 70 9.45 96 8.35" stroke="#ffd2ad" strokeWidth={0.5} strokeLinecap="round" fill="none" opacity={0.85} />
          </svg>
        </span>
      ))}
      <Piece vb="0 0 100 100" className="agl-palms agl-palms-left" style={{ left: "-6%", bottom: 0, width: "26%" }}>
        <Palm x={12} base={104} lean={-10} height={50} size={26} delay={1150} lit={1} />
        <Palm x={36} base={104} lean={16} height={80} size={36} delay={950} lit={1} />
      </Piece>
      <Piece vb="0 0 100 100" className="agl-palms agl-palms-right" style={{ right: "-6%", bottom: 0, width: "23%" }}>
        <Palm x={70} base={104} lean={-18} height={74} size={34} delay={1050} lit={-1} />
      </Piece>
    </>
  );
}
