import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, GLINT, Layer, Piece, rand } from "./parts";

/*
 Event Horizon: deep space. A black hole hangs in the top corner, its disk
 of hot gas spinning round it and passing in front of the dark; a ringed
 planet sits in the opposite corner with a little moon going round it,
 behind and in front. A constellation joins itself up down the side, the
 sky twinkles, and now and then a shooting star goes over.

 Intro: the stars come out, the black hole opens up out of a flash, the
 planet drifts in, and the constellation's stars appear and link up while
 the first shooting star crosses.

 The disk is one ring of streaks, squashed into an ellipse and turned, so
 spinning the ring spins the tilted disk; it is drawn twice, behind the
 hole and (clipped to its near half) in front of it.
*/

const f = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------ black hole */

const BH = { x: 92, y: 66, r: 21 };
const STREAKS = [
  { r: 27, w: 2.6, dash: "18 9 30 14", o: 0.95, c: "#fff2d6" },
  { r: 31, w: 2.2, dash: "8 16 22 10", o: 0.85, c: "#ffd38c" },
  { r: 35, w: 2.4, dash: "26 12 10 20", o: 0.75, c: "#ffb062" },
  { r: 40, w: 2, dash: "12 22 30 8", o: 0.65, c: "#ff8d55" },
  { r: 45, w: 2.2, dash: "30 18 8 24", o: 0.55, c: "#f2648a" },
  { r: 51, w: 1.8, dash: "10 26 18 16", o: 0.45, c: "#d65fb0" },
  { r: 57, w: 1.6, dash: "22 30 12 20", o: 0.32, c: "#a46be0" },
  { r: 63, w: 1.3, dash: "8 34 16 28", o: 0.22, c: "#8f74f0" },
];

function Disk({ uid }: { uid: string }) {
  return (
    <g transform="scale(1 .26)">
      <g className="evh-spin">
        <path d="M-66 0A66 66 0 1 0 66 0A66 66 0 1 0 -66 0ZM-24 0A24 24 0 1 1 24 0A24 24 0 1 1 -24 0Z" fill={`url(#${uid}-disk)`} fillRule="evenodd" />
        {STREAKS.map((s) => (
          <circle key={s.r} r={s.r} fill="none" stroke={s.c} strokeWidth={s.w} strokeDasharray={s.dash} strokeLinecap="round" opacity={s.o} />
        ))}
      </g>
    </g>
  );
}

function BlackHole({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 160 140" className="evh-bh" style={{ right: "-6%", top: "-9%", width: "46%" }}>
      <g className="evh-bh-in">
        <circle className="evh-breathe" cx={BH.x} cy={BH.y} r={70} fill={`url(#${uid}-halo)`} />
        <g transform={`translate(${BH.x} ${BH.y}) rotate(-14)`}>
          <Disk uid={uid} />
          {/* The far side of the disk, bent up over the top by the hole's
              gravity, and the thin bright ring right at its edge. */}
          <ellipse rx={30} ry={28} fill="none" stroke={`url(#${uid}-arch)`} strokeWidth={5.5} opacity={0.9} />
          <circle r={BH.r} fill="#04020a" />
          <circle r={BH.r + 1.4} fill="none" stroke="#fff3dd" strokeWidth={1.3} className="evh-ring" />
          <circle r={BH.r + 1.4} fill="none" stroke="#ffcf8a" strokeWidth={4.5} opacity={0.22} />
          <g clipPath={`url(#${uid}-near)`}>
            <Disk uid={uid} />
          </g>
        </g>
      </g>
    </Piece>
  );
}

/* --------------------------------------------------------------- planet */

const PL = { x: 60, y: 62, r: 29 };
const RINGS = [
  { rx: 41, w: 3.2, c: "#bfa9ff", o: 0.75 },
  { rx: 47, w: 5, c: "#8f7fe6", o: 0.85 },
  { rx: 53.5, w: 2.4, c: "#ddd2ff", o: 0.6 },
  { rx: 57.5, w: 1.1, c: "#ab9cf0", o: 0.45 },
];

function Rings({ near }: { near?: boolean }) {
  return (
    <g>
      {RINGS.map((r) => (
        <ellipse key={r.rx} rx={r.rx} ry={r.rx * 0.24} fill="none" stroke={r.c} strokeWidth={r.w} opacity={near ? r.o : r.o * 0.8} />
      ))}
    </g>
  );
}

/** The moon goes round in two moves a quarter-turn apart; a copy in front of the planet shows for the near half. */
function Moon({ near }: { near?: boolean }) {
  return (
    <g className={near ? "evh-orbit-near" : undefined}>
      <g className="evh-orbit-x">
        <g className="evh-orbit-y">
          <circle r={4.6} fill="#c9c4dc" />
          <path d="M3.4 -3.1A4.6 4.6 0 0 1 -1.2 4.44A4.6 4.6 0 0 0 3.4 -3.1Z" fill="#7d7697" opacity={0.6} />
          <circle cx={-1.4} cy={-1.2} r={1.1} fill="#a9a3c0" />
          <circle cx={1.4} cy={1.5} r={0.7} fill="#a9a3c0" />
        </g>
      </g>
    </g>
  );
}

function Planet({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 130 120" className="evh-planet" style={{ left: "-5%", bottom: "-7%", width: "40%" }}>
      <g className="evh-planet-in">
        <g>
          <g transform={`translate(${PL.x} ${PL.y}) rotate(-17)`}>
            <Rings />
            <Moon />
            <g clipPath={`url(#${uid}-ball)`}>
              <circle r={PL.r} fill={`url(#${uid}-planet)`} />
              <g className="evh-bands">
                <path d="M-130 -16C-95 -19 -65 -13 -30 -16C5 -19 35 -13 60 -16V-10C35 -7 5 -13 -30 -10C-65 -7 -95 -13 -130 -10Z" fill="#7be9d6" opacity={0.35} />
                <path d="M-130 -2C-95 1 -65 -5 -30 -2C5 1 35 -5 60 -2V5C35 8 5 2 -30 5C-65 8 -95 2 -130 5Z" fill="#3f4fb6" opacity={0.35} />
                <path d="M-130 11C-95 9 -65 15 -30 11C5 9 35 15 60 11V14C35 18 5 12 -30 14C-65 18 -95 12 -130 14Z" fill="#c2b5ff" opacity={0.4} />
                <path d="M-130 19C-95 22 -65 17 -30 19C5 22 35 17 60 19V24C35 27 5 22 -30 24C-65 27 -95 22 -130 24Z" fill="#2d2f8a" opacity={0.3} />
                <ellipse cx={14} cy={4} rx={5} ry={2.4} fill="#e7a8ff" opacity={0.5} />
                <ellipse cx={-46} cy={4} rx={5} ry={2.4} fill="#e7a8ff" opacity={0.5} />
                <ellipse cx={-106} cy={4} rx={5} ry={2.4} fill="#e7a8ff" opacity={0.5} />
              </g>
              <circle r={PL.r} fill={`url(#${uid}-shade)`} />
            </g>
            <circle r={PL.r - 0.6} fill="none" stroke="#c9fff4" strokeWidth={0.9} strokeDasharray="34 200" strokeDashoffset={-118} opacity={0.75} />
            <g clipPath={`url(#${uid}-ringnear)`}>
              <Rings near />
            </g>
            <Moon near />
          </g>
        </g>
      </g>
    </Piece>
  );
}

/* --------------------------------------------------------- constellation */

const CON = [[8, 14], [24, 6], [40, 18], [58, 13], [70, 30], [52, 44], [34, 38]] as const;
const CON_LINE = `M${CON.slice(0, 5).map(([x, y]) => `${x} ${y}`).join("L")}L52 44L34 38L40 18`;

function Constellation() {
  return (
    <Piece vb="0 0 80 52" className="evh-con" style={{ right: "4%", top: "44%", width: "24%" }}>
      <path className="evh-con-line" d={CON_LINE} pathLength={100} fill="none" stroke="#bfc9ff" strokeWidth={0.55} strokeLinejoin="round" opacity={0.5} />
      {CON.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${i === 2 || i === 4 ? 3.4 : 2.5})`}>
          <g className="evh-con-star" style={{ "--i": i } as CSSProperties}>
            <g className="evh-con-tw">
              <circle r={0.75} fill="#c9d2ff" opacity={0.35} />
              <path d={GLINT} fill="#ffffff" />
            </g>
          </g>
        </g>
      ))}
    </Piece>
  );
}

/* ---------------------------------------------------------------- the sky */

const STARS = Array.from({ length: 44 }, (_, i) => ({
  x: rand(i, 81) * 97 + 1,
  y: rand(i, 82) * 96 + 2,
  s: 0.45 + rand(i, 83) * 0.6 + (i % 6 === 0 ? 0.9 : 0),
  dur: 2.2 + rand(i, 84) * 3,
  delay: -rand(i, 85) * 5,
  glint: i % 6 === 0,
  warm: i % 5 === 1,
}));

const SHOOTERS = [
  { x: 30, y: 6, a: 158, len: 70, dur: 9, delay: 1.6 },
  { x: 92, y: 30, a: 152, len: 60, dur: 13, delay: 6.5 },
  { x: 70, y: 58, a: 165, len: 50, dur: 17, delay: 11 },
];

export function EventHorizon({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <radialGradient id={`${uid}-disk`}>
          <stop offset=".34" stopColor="#ffe8bd" stopOpacity=".95" />
          <stop offset=".5" stopColor="#ff9a52" stopOpacity=".75" />
          <stop offset=".72" stopColor="#d9508f" stopOpacity=".42" />
          <stop offset="1" stopColor="#7a54e0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset=".2" stopColor="#ff9f6a" stopOpacity=".32" />
          <stop offset=".5" stopColor="#c8509c" stopOpacity=".12" />
          <stop offset="1" stopColor="#6a4bd8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-arch`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0cf" />
          <stop offset=".35" stopColor="#ffab5c" />
          <stop offset=".62" stopColor="#e2558a" stopOpacity=".5" />
          <stop offset="1" stopColor="#e2558a" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}-near`}>
          <rect x={-90} y={0} width={180} height={60} />
        </clipPath>
        <linearGradient id={`${uid}-planet`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#74f0dc" />
          <stop offset=".45" stopColor="#4c9fe6" />
          <stop offset="1" stopColor="#6248c9" />
        </linearGradient>
        <radialGradient id={`${uid}-shade`} cx=".32" cy=".3" r=".85">
          <stop offset=".45" stopColor="#120b30" stopOpacity="0" />
          <stop offset="1" stopColor="#120b30" stopOpacity=".72" />
        </radialGradient>
        <clipPath id={`${uid}-ball`}>
          <circle r={PL.r} />
        </clipPath>
        {/* The near half of the rings, less the planet's own disc where the
            rings pass behind it. */}
        <clipPath id={`${uid}-ringnear`}>
          <path d="M-70 0H70V30H-70Z" />
        </clipPath>
      </Defs>
      <Layer className="evh-sky">
        <span className="evh-nebula evh-nebula-a" />
        <span className="evh-nebula evh-nebula-b" />
        {STARS.map((s, i) => (
          <span
            key={i}
            className="evh-star"
            style={{ left: `${f(s.x)}%`, top: `${f(s.y)}%`, width: `${f(s.s)}%`, "--tw": `${f(s.dur)}s`, "--td": `${f(s.delay)}s`, "--sd": `${f(rand(i, 86) * 900)}ms` } as CSSProperties}
          >
            <svg viewBox="-1 -1 2 2">
              {s.glint ? <path d={GLINT} fill="#ffffff" /> : <circle r={0.5} fill={s.warm ? "#ffe3c2" : "#e4e9ff"} />}
            </svg>
          </span>
        ))}
      </Layer>
      <Planet uid={uid} />
      <BlackHole uid={uid} />
      <Constellation />
      <Layer className="evh-shooters">
        {SHOOTERS.map((s, i) => (
          <span
            key={i}
            className="evh-shoot"
            style={{ left: `${s.x}%`, top: `${s.y}%`, "--a": `${s.a}deg`, "--len": `${s.len}cqw`, "--dur": `${s.dur}s`, "--delay": `${s.delay}s` } as CSSProperties}
          >
            <svg viewBox="0 -3 60 6" preserveAspectRatio="none">
              <path d="M0 0L56 -1.1A1.1 1.1 0 0 1 56 1.1Z" fill={`url(#${uid}-tail)`} />
              <ellipse cx={56.5} cy={0} rx={3} ry={3} fill="#cfd9ff" opacity={0.35} />
              <ellipse cx={56.5} cy={0} rx={1.2} ry={1.4} fill="#ffffff" />
            </svg>
          </span>
        ))}
      </Layer>
      <Defs>
        <linearGradient id={`${uid}-tail`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9fb3ff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".95" />
        </linearGradient>
      </Defs>
    </>
  );
}
