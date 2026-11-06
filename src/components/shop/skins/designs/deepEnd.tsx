import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, Layer, Particles, Piece, Wander, limb, rand, type P, type Particle } from "./parts";

/*
 Deep End: the card is under water. Light comes down in shafts from a
 rippling surface, kelp sways up both sides, and the seabed banks into the
 corners: coral and a clam on the right (it opens now and then to show its
 pearl), a starfish and sea grass on the left. A jellyfish drifts about,
 a shoal of little fish swims across every so often, and bubbles rise.

 Intro: the light comes on, the kelp grows up out of the sand, the
 starfish spins into place, the clam opens and bubbles burst up.
*/

const f = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------- surface and light */

/** A seamless wave, one 60-unit period repeated, so sliding it 60 loops. */
const WAVE = (() => {
  let d = "M-60 -4V7";
  for (let x = -60; x < 360; x += 60) d += `C${x + 15} 12 ${x + 15} 12 ${x + 30} 7C${x + 45} 2.5 ${x + 45} 2.5 ${x + 60} 7`;
  return d + "V-4Z";
})();
const WAVE_LINE = (() => {
  let d = "M-60 7";
  for (let x = -60; x < 360; x += 60) d += `C${x + 15} 12 ${x + 15} 12 ${x + 30} 7C${x + 45} 2.5 ${x + 45} 2.5 ${x + 60} 7`;
  return d;
})();
const RAYS = [
  { x: 34, w: 16, a: 14, o: 0.55, dur: 6.5 },
  { x: 88, w: 26, a: 12, o: 0.75, dur: 8 },
  { x: 150, w: 14, a: 10, o: 0.5, dur: 5.5 },
  { x: 196, w: 30, a: 9, o: 0.7, dur: 9 },
  { x: 262, w: 18, a: 7, o: 0.55, dur: 7 },
];

/** Shafts of light are HTML, so their slow brightening composites rather than repainting. */
function Light() {
  return (
    <Layer className="dpe-light">
      {RAYS.map((r, i) => (
        <span
          key={i}
          className="dpe-ray"
          style={{ left: `${f((r.x - r.w * 1.1) / 3)}%`, width: `${f((r.w * 2.2) / 3)}%`, "--ra": `${-r.a}deg`, "--ro": r.o, "--rd": `${r.dur}s`, animationDelay: `${-i * 1.7}s` } as CSSProperties}
        />
      ))}
    </Layer>
  );
}

function Surface() {
  return (
    <Piece vb="0 0 300 16" className="dpe-surface" style={{ left: 0, top: 0, width: "100%" }}>
      <g className="dpe-surface-in">
        <g className="dpe-wave">
          <path d={WAVE} fill="#9eeaf5" opacity={0.42} />
          <path d={WAVE_LINE} stroke="#e6fdff" strokeWidth={1.2} fill="none" opacity={0.8} />
        </g>
        <g className="dpe-wave dpe-wave-2">
          <path d={WAVE_LINE} stroke="#bff6ff" strokeWidth={0.7} fill="none" opacity={0.5} transform="translate(0 4)" />
        </g>
      </g>
    </Piece>
  );
}

/* ------------------------------------------------------------------ kelp */

interface Frond {
  low: P[];
  high: P[];
  joint: P;
  blades: { t: number; side: 1 | -1; len: number; upper: boolean }[];
}

function blade(x: number, y: number, side: 1 | -1, len: number, angle: number) {
  const tip: P = [x + side * Math.cos(angle) * len, y - Math.sin(angle) * len];
  const nx = -Math.sin(angle) * side;
  const ny = -Math.cos(angle);
  const w = len * 0.36;
  const m1: P = [x + (tip[0] - x) * 0.45 + nx * w, y + (tip[1] - y) * 0.45 + ny * w];
  const m2: P = [x + (tip[0] - x) * 0.55 - nx * w * 0.7, y + (tip[1] - y) * 0.55 - ny * w * 0.7];
  return {
    d: `M${f(x)} ${f(y)}Q${f(m1[0])} ${f(m1[1])} ${f(tip[0])} ${f(tip[1])}Q${f(m2[0])} ${f(m2[1])} ${f(x)} ${f(y)}Z`,
    vein: `M${f(x)} ${f(y)}L${f(x + (tip[0] - x) * 0.85)} ${f(y + (tip[1] - y) * 0.85)}`,
  };
}

function Kelp({ uid, frond, delay, sway }: { uid: string; frond: Frond; delay: number; sway: number }) {
  const low = limb(frond.low, 5.4, 3.6, 1, 1);
  const high = limb(frond.high, 3.8, 1.2, 1, 1);
  const parts = (upper: boolean) => frond.blades.filter((b) => b.upper === upper).map((b, i) => {
    const s = upper ? high : low;
    const at = s.at(b.t);
    const angle = (55 + (i % 3) * 12) * (Math.PI / 180);
    const bl = blade(at.x, at.y, b.side, b.len, angle);
    return (
      <g key={i}>
        <path d={bl.d} fill={`url(#${uid}-kelp-leaf)`} />
        <path d={bl.vein} stroke="#7fd6a2" strokeWidth={0.5} opacity={0.6} />
        <circle cx={at.x + b.side * 1.6} cy={at.y + 0.5} r={1.9} fill="#c9b04a" />
        <circle cx={at.x + b.side * 1.6 - 0.5} cy={at.y} r={0.6} fill="#fff3b0" opacity={0.7} />
      </g>
    );
  });
  const base = frond.low[0];
  return (
    <g className="dpe-grow" style={{ "--d": `${delay}ms`, transformOrigin: `${base[0]}px ${base[1]}px` } as CSSProperties}>
      <g className="dpe-sway" style={{ "--sw": `${sway}s`, transformOrigin: `${base[0]}px ${base[1]}px` } as CSSProperties}>
        <path d={low.body} fill={`url(#${uid}-kelp)`} />
        {parts(false)}
        <g className="dpe-bend" style={{ "--sw": `${sway}s`, transformOrigin: `${frond.joint[0]}px ${frond.joint[1]}px` } as CSSProperties}>
          <path d={high.body} fill={`url(#${uid}-kelp)`} />
          {parts(true)}
        </g>
      </g>
    </g>
  );
}

const FROND_A: Frond = {
  low: [[22, 204], [20, 170], [24, 140], [22, 112]],
  high: [[22, 112], [19, 84], [24, 56], [20, 30], [24, 6]],
  joint: [22, 112],
  blades: [
    { t: 0.18, side: 1, len: 22, upper: false }, { t: 0.42, side: -1, len: 23, upper: false },
    { t: 0.66, side: 1, len: 22, upper: false }, { t: 0.9, side: -1, len: 21, upper: false },
    { t: 0.1, side: 1, len: 21, upper: true }, { t: 0.3, side: -1, len: 20, upper: true }, { t: 0.5, side: 1, len: 19, upper: true },
    { t: 0.68, side: -1, len: 17, upper: true }, { t: 0.84, side: 1, len: 14, upper: true }, { t: 0.97, side: -1, len: 10, upper: true },
  ],
};
const FROND_B: Frond = {
  low: [[44, 206], [46, 180], [42, 158], [45, 136]],
  high: [[45, 136], [48, 112], [43, 92], [47, 70]],
  joint: [45, 136],
  blades: [
    { t: 0.3, side: 1, len: 19, upper: false }, { t: 0.62, side: -1, len: 18, upper: false }, { t: 0.92, side: 1, len: 18, upper: false },
    { t: 0.2, side: -1, len: 17, upper: true }, { t: 0.45, side: 1, len: 16, upper: true }, { t: 0.7, side: -1, len: 14, upper: true }, { t: 0.95, side: 1, len: 10, upper: true },
  ],
};
const FROND_C: Frond = {
  low: [[8, 206], [6, 186], [9, 166]],
  high: [[9, 166], [7, 148], [10, 128], [8, 112]],
  joint: [9, 166],
  blades: [
    { t: 0.5, side: 1, len: 15, upper: false },
    { t: 0.25, side: -1, len: 14, upper: true }, { t: 0.6, side: 1, len: 13, upper: true }, { t: 0.95, side: -1, len: 9, upper: true },
  ],
};

function KelpBed({ uid, side }: { uid: string; side: "left" | "right" }) {
  const style: CSSProperties = side === "left" ? { left: "-2%", bottom: "3%", width: "17%" } : { right: "-3%", bottom: "4%", width: "16%" };
  return (
    <Piece vb="0 0 64 200" className={`dpe-kelp dpe-kelp-${side}`} style={style}>
      <g transform={side === "right" ? "translate(64 0) scale(-1 1)" : undefined}>
        <Kelp uid={uid} frond={FROND_C} delay={side === "left" ? 820 : 900} sway={side === "left" ? 4.4 : 4.9} />
        <Kelp uid={uid} frond={FROND_B} delay={side === "left" ? 650 : 750} sway={side === "left" ? 5.2 : 4.6} />
        <Kelp uid={uid} frond={FROND_A} delay={side === "left" ? 400 : 520} sway={side === "left" ? 6.4 : 5.8} />
      </g>
    </Piece>
  );
}

/* ---------------------------------------------------------------- seabed */

const SAND: P[] = [[-4, 50], [18, 46], [44, 56], [76, 66], [110, 72], [150, 74], [190, 71], [222, 64], [252, 55], [280, 50], [304, 47]];

function sandPath() {
  let d = `M${SAND[0][0]} ${SAND[0][1]}`;
  for (let i = 1; i < SAND.length; i++) {
    const [px, py] = SAND[i - 1];
    const [x, y] = SAND[i];
    d += `Q${f((px + x) / 2)} ${f((py + y) / 2 - 2.5)} ${x} ${y}`;
  }
  return d + "V96H-4Z";
}

const CORAL = [
  { pts: [[246, 64], [245, 52], [242, 43]], w: 8.5 },
  { pts: [[242, 44], [234, 35], [229, 25], [226, 15]], w: 5.8 },
  { pts: [[233, 34], [224, 31], [218, 23]], w: 3.8 },
  { pts: [[229, 24], [235, 16], [236, 9]], w: 3 },
  { pts: [[243, 45], [247, 33], [246, 21], [249, 11]], w: 5.2 },
  { pts: [[246, 28], [254, 22], [258, 14]], w: 3.6 },
  { pts: [[244, 51], [254, 45], [262, 37], [268, 27]], w: 5.4 },
  { pts: [[260, 39], [270, 39], [277, 33]], w: 3.4 },
  { pts: [[264, 32], [262, 23], [266, 15]], w: 3.2 },
] as { pts: P[]; w: number }[];

/** Squiggly grooves for the brain coral, inside its dome. */
const BRAIN = "M-10 1C-8 -3 -5 -1 -3 -4C-1 -7 2 -3 4 -6C6 -8 9 -4 10 -1M-11 4C-7 1 -4 4 -1 1C2 -2 5 2 8 -1C9 -2 11 0 11.6 2M-8 -4C-6 -7 -3 -6 -1 -8C1 -9 3 -8 5 -9";

const STAR = (() => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 13 : 5.6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    d += `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`;
  }
  return d + "Z";
})();

function Seabed({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 92" className="dpe-bed" style={{ left: 0, bottom: 0, width: "100%" }}>
      <g className="dpe-bed-in">
        {/* A sea fan behind the coral. */}
        <g transform="translate(270 56)" opacity={0.85}>
          <path d="M0 0C-10 -6 -18 -20 -16 -34C-8 -42 6 -42 14 -34C16 -20 9 -6 0 0Z" fill="#8a5bd6" opacity={0.55} />
          <path d="M0 0L-12 -30M0 0L-4 -38M0 0L5 -38M0 0L12 -30M-6 -14L6 -14M-9 -24L9 -24M-6 -33L7 -33" stroke="#c9a4ff" strokeWidth={0.8} fill="none" opacity={0.8} />
        </g>
        <g className="dpe-coral">
          {CORAL.map((c, i) => {
            const l = limb(c.pts, c.w, c.w * 0.62, 1, 1);
            const tip = c.pts[c.pts.length - 1];
            return (
              <g key={i}>
                <path d={l.body} fill={`url(#${uid}-coral)`} />
                <path d={l.lit} fill="#ffc2a8" opacity={0.5} />
                <circle cx={tip[0]} cy={tip[1]} r={c.w * 0.36} fill="#ffd1bc" />
              </g>
            );
          })}
        </g>
        {/* Tube sponges at the far right. */}
        <g transform="translate(286 52)">
          <path d="M-7 4V-14C-7 -16.4 -2.4 -16.4 -2.4 -14V4Z" fill="#9b6ad8" />
          <ellipse cx={-4.7} cy={-14.2} rx={2.3} ry={1} fill="#4b2a80" />
          <path d="M-1.6 4V-22C-1.6 -24.6 3.4 -24.6 3.4 -22V4Z" fill="#b384ef" />
          <ellipse cx={0.9} cy={-22.2} rx={2.5} ry={1.1} fill="#4b2a80" />
          <path d="M4.2 4V-9C4.2 -11 8 -11 8 -9V4Z" fill="#8a5bd0" />
          <ellipse cx={6.1} cy={-9.2} rx={1.9} ry={0.8} fill="#4b2a80" />
        </g>
        <path d={sandPath()} fill={`url(#${uid}-sand)`} />
        {/* Brain coral, half in the sand. */}
        <g transform="translate(222 64)">
          <path d="M-14 4C-14 -6 -7 -11 0 -11C7 -11 14 -6 14 4Z" fill={`url(#${uid}-brain)`} />
          <path d={BRAIN} stroke="#b8741f" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.8} />
        </g>
        <path d="M30 60C40 58 52 61 60 65M120 80C136 78 150 79 164 82M206 72C216 69 228 68 236 66" stroke="#b78f55" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.6} />
        <g fill="#8fa3b5">
          <ellipse cx={92} cy={74} rx={4.5} ry={2.6} />
          <ellipse cx={98.5} cy={75.5} rx={2.6} ry={1.7} opacity={0.8} />
          <ellipse cx={206} cy={70} rx={3.4} ry={2} opacity={0.85} />
        </g>
        {/* Sea grass on the left. */}
        <g className="dpe-grass">
          <path d="M60 64C58 54 60 46 56 38M64 65C64 56 68 50 67 42M57 64C54 58 50 54 48 48" stroke="#4fb487" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </g>
        {/* The starfish, spun into place. */}
        <g transform="translate(26 55) rotate(16)">
          <g className="dpe-star">
            <path d={STAR} fill={`url(#${uid}-star)`} stroke="#d9603a" strokeWidth={0.6} strokeLinejoin="round" />
            <g fill="#ffd7a8" opacity={0.9}>
              {[0, 1, 2, 3, 4].map((k) => {
                const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
                return (
                  <g key={k}>
                    <circle cx={f(Math.cos(a) * 4)} cy={f(Math.sin(a) * 4)} r={0.9} />
                    <circle cx={f(Math.cos(a) * 7.6)} cy={f(Math.sin(a) * 7.6)} r={0.75} />
                    <circle cx={f(Math.cos(a) * 10.4)} cy={f(Math.sin(a) * 10.4)} r={0.55} />
                  </g>
                );
              })}
              <circle r={1.2} />
            </g>
          </g>
        </g>
        {/* The clam: the lid lifts on its hinge (the left end) to show a pearl. */}
        <g transform="translate(212 74)">
          <path d="M-12 0C-12 6.4 -4 8.6 2 8.6C8 8.6 13 5.6 13 0Z" fill={`url(#${uid}-shell)`} />
          <path d="M-8 1.4L-8.6 6M-3 1.6L-3.2 7.8M2 1.6L2.2 8.2M7 1.4L7.6 7M11 1L11.6 4.4" stroke="#e48aa0" strokeWidth={0.7} />
          <circle cx={1.5} cy={-1.4} r={4.2} fill={`url(#${uid}-pearl)`} />
          <circle cx={0.2} cy={-2.8} r={1.1} fill="#ffffff" opacity={0.9} />
          <g className="dpe-lid">
            <path d="M-12 0C-12 -8 -4 -11 2 -11C8 -11 13 -7 13 0C6 1.4 -6 1.4 -12 0Z" fill={`url(#${uid}-shell)`} />
            <path d="M-12 0C-8 -6 -6 -9 -4 -10.4M-12 0C-4 -5 0 -9 2 -11M-12 0C0 -5 6 -8 8 -9.6M-12 0C4 -3 10 -4 12.6 -3.4" stroke="#e48aa0" strokeWidth={0.7} fill="none" />
            <path d="M-6 -7C-3 -9 1 -10 4 -9.8" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.6} />
          </g>
        </g>
      </g>
    </Piece>
  );
}

/* ------------------------------------------------- jellyfish and the shoal */

function Jelly({ uid }: { uid: string }) {
  return (
    <svg viewBox="-20 -22 40 74">
      <g className="dpe-trail">
        <path d="M-8 2C-10 12 -6 20 -9 30C-11 38 -7 44 -9 50M-3 2C-4 14 0 22 -3 34C-4 40 -1 45 -2 50M3 2C4 12 0 22 3 32C4 40 1 46 3 50M8 2C10 12 6 22 9 30C11 38 7 44 9 48" stroke="#f3b8ff" strokeWidth={0.8} fill="none" opacity={0.75} />
        <path d="M-4 2C-6 10 -1 16 -4 24C-6 30 -2 34 -3 38L0 38C1 32 -3 28 0 22C2 16 -1 10 1 2ZM2 2C4 10 1 16 4 22C6 28 3 32 5 36L7 35C6 30 8 26 6 20C4 14 6 8 5 2Z" fill="#e79cff" opacity={0.6} />
      </g>
      <g className="dpe-pulse">
        <circle cx={0} cy={-6} r={20} fill={`url(#${uid}-jelly-glow)`} />
        <path d="M-15 2C-16 -10 -9 -19 0 -19C9 -19 16 -10 15 2C12 4.5 9 1 6 3.4C3 5.4 0 2.6 -3 3.6C-6 5.4 -9 2 -11.5 3.8C-13 4.6 -14.4 3.6 -15 2Z" fill={`url(#${uid}-jelly)`} />
        <path d="M-9 -12C-6 -16 -2 -17 2 -16.6" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7} />
        <path d="M-10 -2C-6 -6 6 -6 10 -2" stroke="#ffd6ff" strokeWidth={0.8} fill="none" opacity={0.6} />
      </g>
    </svg>
  );
}

const SHOAL: [number, number, number][] = [[0, 10, 1], [16, 3, 0.85], [18, 17, 0.9], [33, 9, 0.8], [36, 21, 0.75], [50, 14, 0.7]];

function Shoal({ uid }: { uid: string }) {
  return (
    <span className="dpe-shoal">
      <svg viewBox="-8 -4 72 32">
        {SHOAL.map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <g className="dpe-fish" style={{ "--fd": `${-i * 0.13}s` } as CSSProperties}>
              <path className="dpe-tail" d="M7.2 0L12 -3.6L11 0L12 3.6Z" fill="#ffd36b" />
              <path d="M-6 0C-4 -3.4 2 -4 7.6 0C2 4 -4 3.4 -6 0Z" fill={`url(#${uid}-fish)`} />
              <path d="M-4.6 -.8C-1 -2.4 3 -2.4 6 -.6" stroke="#2f6f9e" strokeWidth={0.7} fill="none" opacity={0.7} />
              <circle cx={-3.4} cy={-0.6} r={0.75} fill="#0f2233" />
            </g>
          </g>
        ))}
      </svg>
    </span>
  );
}

/* --------------------------------------------------------------- bubbles */

const N_BUBBLES = 16;
const BUBBLES: Particle[] = Array.from({ length: N_BUBBLES }, (_, i) => ({
  x: (((i * 5) % N_BUBBLES) + rand(i, 131) * 0.8) * (96 / N_BUBBLES),
  size: 1.1 + rand(i, 132) * 1.7,
  dur: 6 + rand(i, 133) * 6,
  phase: rand(i, 134),
  sway: 0.5 + rand(i, 135) * 0.9,
  swayDur: 1.4 + rand(i, 136) * 1.2,
  opacity: 0.55 + rand(i, 137) * 0.4,
}));

export function DeepEnd({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-kelp`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3f9c6e" />
          <stop offset="1" stopColor="#24684d" />
        </linearGradient>
        <linearGradient id={`${uid}-kelp-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5cc58c" />
          <stop offset="1" stopColor="#2a7a57" />
        </linearGradient>
        <linearGradient id={`${uid}-sand`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1d9a6" />
          <stop offset=".5" stopColor="#ddba7c" />
          <stop offset="1" stopColor="#bf9558" />
        </linearGradient>
        <radialGradient id={`${uid}-brain`} cx=".4" cy=".3" r=".8">
          <stop offset="0" stopColor="#ffd38a" />
          <stop offset="1" stopColor="#d98a3a" />
        </radialGradient>
        <linearGradient id={`${uid}-coral`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8f7a" />
          <stop offset="1" stopColor="#e2557a" />
        </linearGradient>
        <radialGradient id={`${uid}-star`} cx=".45" cy=".4" r=".7">
          <stop offset="0" stopColor="#ffb06b" />
          <stop offset="1" stopColor="#f2703f" />
        </radialGradient>
        <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe1e8" />
          <stop offset="1" stopColor="#f6a6bb" />
        </linearGradient>
        <radialGradient id={`${uid}-pearl`} cx=".35" cy=".35" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#efe9ff" />
          <stop offset="1" stopColor="#c7c0e6" />
        </radialGradient>
        <radialGradient id={`${uid}-jelly`} cx=".5" cy=".3" r=".8">
          <stop offset="0" stopColor="#ffe6ff" stopOpacity=".95" />
          <stop offset=".55" stopColor="#f0a2ff" stopOpacity=".75" />
          <stop offset="1" stopColor="#b57af0" stopOpacity=".6" />
        </radialGradient>
        <radialGradient id={`${uid}-jelly-glow`}>
          <stop offset="0" stopColor="#f3b8ff" stopOpacity=".35" />
          <stop offset="1" stopColor="#f3b8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-fish`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fb6e6" />
          <stop offset=".55" stopColor="#bdf0ff" />
          <stop offset="1" stopColor="#e9fbff" />
        </linearGradient>
      </Defs>
      <Light />
      <Surface />
      <KelpBed uid={uid} side="right" />
      <KelpBed uid={uid} side="left" />
      <Seabed uid={uid} />
      <Layer className="dpe-life">
        <Wander points={[[74, 46], [80, 34], [68, 30], [62, 42]]} dur={26} phase={0.1} size={12.5} className="dpe-jelly">
          <Jelly uid={uid} />
        </Wander>
        <Shoal uid={uid} />
        <Particles
          items={BUBBLES}
          rise
          render={() => (
            <svg viewBox="-5 -5 10 10">
              <circle r={4.2} fill="#bdf4ff" fillOpacity={0.1} stroke="#d8fbff" strokeWidth={0.7} />
              <path d="M-2.6 -1.2A3 3 0 0 1 -.8 -2.8" stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" fill="none" />
            </svg>
          )}
        />
      </Layer>
    </>
  );
}
