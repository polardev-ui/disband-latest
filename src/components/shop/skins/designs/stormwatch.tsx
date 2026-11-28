import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, Piece, rand } from "./parts";
import { Strip, ridge } from "./scene";
import "./scene.css";
import "./stormwatch.css";

/*
 Stormwatch: a heavy night sky over open water, watched from a headland.

 Three banks of cloud cross the top of the card on the wind, the nearer the
 faster. Under them the sky is dark and still, which is where the profile
 sits. At the bottom the sea runs to the horizon: a far band of fine
 swell, a middle band, and big near swells that lift and fall as they roll
 through, all moving one way at their own speeds, with the light from the
 sky shimmering on the water in short broken lines. A dark headland rises
 on the right with a small lighthouse on it, whose lamp comes round every
 few seconds; surf breaks white at its foot.

 Once every 14 seconds, far off in the top corner, lightning: a soft glow
 behind the clouds and on them, and a faint answer on the water. One flash, a flicker, and dark again for the rest of
 the loop, never a strobe.

 Layout: clouds in the top 30cqw, sea and headland are the floor.
*/

const f = (n: number) => Math.round(n * 100) / 100;
const T = 300;

/**
 * A cloud bank hanging from the top of its tile, its underside in billows,
 * repeating exactly every tile (whole cycles only). `body` is the same bank
 * cut `lift` units shorter: drawn lighter over the dark fill, it leaves a
 * shadowed band along every billow's underside.
 */
function bank(h: number, base: number, swell: [number, number, number], billows: [number, number, number], lift = 5) {
  // A slow swell in the cloud base, and billows on it: a half-sine softened
  // to a fat, rounded hang with tight creases between.
  const [sa, sk, sp] = swell;
  const [ba, bk, bp] = billows;
  const y = (x: number) => base + sa * Math.sin((2 * Math.PI * sk * x) / T + sp) + ba * Math.pow(Math.abs(Math.sin((Math.PI * bk * x) / T + bp)), 0.55);
  const pts = (dy: number) => {
    const out: string[] = [];
    for (let x = 0; x <= T; x += 1.5) out.push(`${f(x)} ${f(y(x) - dy)}`);
    return out;
  };
  const under = pts(0);
  const top = pts(lift);
  return {
    fill: `M0 0H${T}V${f(y(T))}L${[...under].reverse().join("L")}Z`,
    body: `M0 0H${T}V${f(y(T) - lift)}L${[...top].reverse().join("L")}Z`,
    edge: `M${top.join("L")}`,
    h,
  };
}

const BACK = bank(92, 58, [9, 2, 0.4], [16, 7, 0.3], 6);
const MIDC = bank(76, 42, [8, 1, 2.1], [13, 9, 1.4], 5);
const FRONT = bank(56, 24, [7, 3, 1.2], [11, 11, 0.8], 4.5);
/** A long low streak of stratus across the middle of the sky: barely there. */
const STRATUS = (() => {
  const pts: string[] = [];
  const bot: string[] = [];
  for (let x = 0; x <= T; x += 3) {
    const k = Math.sin((2 * Math.PI * x) / T + 0.8);
    const th = 2.6 + 2 * Math.abs(Math.sin((2 * Math.PI * 2 * x) / T + 0.3));
    pts.push(`${x} ${f(8 + k * 2 - th)}`);
    bot.unshift(`${x} ${f(8 + k * 2 + th * 0.6)}`);
  }
  return `M${pts.join("L")}L${bot.join("L")}Z`;
})();

/** A wave band: crest lines and foam flecks repeating across the tile. */
function waves(h: number, rows: number, amp: number, k: number, seed: number) {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const y0 = 2 + (r / rows) * (h - 4);
    const ph = rand(r, seed) * Math.PI * 2;
    const pts: string[] = [];
    for (let x = 0; x <= T; x += 3) pts.push(`${x} ${f(y0 + amp * (0.6 + r / rows) * Math.sin((2 * Math.PI * (k + r) * x) / T + ph))}`);
    lines.push(`M${pts.join("L")}`);
  }
  return lines;
}
const FAR_WAVES = waves(10, 4, 0.5, 9, 11);
const MID_WAVES = waves(16, 4, 1.1, 6, 12);

/** The near swell: a filled crest with a lit lip and a little foam. */
const SWELL: [number, number, number][] = [[3.2, 3, 0.2], [1.6, 5, 1.4], [0.8, 9, 2.6]];
// Every fleck ends inside the tile, so none is cut at the join.
const FOAM = Array.from({ length: 9 }, (_, i) => ({ x: 10 + i * 32 + rand(i, 21) * 10, w: 5 + rand(i, 22) * 8 }));

/** Shimmer on the water: short lines that brighten and fade on their own clocks. */
const GLINTS = Array.from({ length: 11 }, (_, i) => ({
  x: 20 + rand(i, 31) * 240,
  y: 22 + rand(i, 32) * 26,
  w: 4 + rand(i, 33) * 10,
  dur: 2.4 + rand(i, 34) * 2.4,
  delay: -rand(i, 35) * 4,
}));

function Sky() {
  return (
    <>
      <span className="sw-sky" />
      <span className="sw-flash sw-flash-back" />
      <Strip w={T} h={16} dur={200} phase={0.4} className="sw-stratus">
        <path d={STRATUS} fill="#1b2738" opacity=".55" />
      </Strip>
      <Strip w={T} h={BACK.h} dur={150} phase={0.2} className="sw-cloud sw-cloud-back">
        <path d={BACK.fill} fill="#141c29" />
        <path d={BACK.body} fill="#243044" />
        <path d={BACK.edge} fill="none" stroke="#3a4b62" strokeWidth="1" opacity=".55" />
      </Strip>
      <Strip w={T} h={MIDC.h} dur={95} phase={0.55} className="sw-cloud sw-cloud-mid">
        <path d={MIDC.fill} fill="#121925" />
        <path d={MIDC.body} fill="#1e2939" />
        <path d={MIDC.edge} fill="none" stroke="#33445a" strokeWidth=".9" opacity=".55" />
      </Strip>
      <Strip w={T} h={FRONT.h} dur={62} phase={0.1} className="sw-cloud sw-cloud-front">
        <path d={FRONT.fill} fill="#0d131c" />
        <path d={FRONT.body} fill="#171f2c" />
        <path d={FRONT.edge} fill="none" stroke="#2c3a4e" strokeWidth=".8" opacity=".6" />
      </Strip>
      <span className="sw-flash sw-flash-front" />
    </>
  );
}

function Sea({ uid }: { uid: string }) {
  return (
    <>
      <Piece vb="0 0 300 84" className="sw-sea" style={{ left: 0, bottom: 0, width: "100%" }}>
        <rect x="0" y="16" width="300" height="68" fill={`url(#${uid}-sea)`} />
        <rect x="0" y="15.6" width="300" height=".7" fill="#7d9bb2" opacity=".4" />
        <rect className="sw-flash-sea" x="0" y="16" width="300" height="44" fill={`url(#${uid}-seaflash)`} />
        {GLINTS.map((g, i) => (
          <rect key={i} className="sw-glint" x={f(g.x)} y={f(g.y)} width={f(g.w)} height=".55" rx=".27" fill="#bcd3e6" style={{ "--gd": `${f(g.dur)}s`, "--gl": `${f(g.delay)}s` } as CSSProperties} />
        ))}
      </Piece>
      <Strip w={T} h={10} dur={40} className="sw-waves-far">
        {FAR_WAVES.map((d, i) => <path key={i} d={d} fill="none" stroke="#3c6478" strokeWidth=".5" opacity={0.35 + i * 0.08} />)}
      </Strip>
      <Strip w={T} h={16} dur={26} phase={0.4} className="sw-waves-mid">
        {MID_WAVES.map((d, i) => <path key={i} d={d} fill="none" stroke="#4f8a91" strokeWidth=".7" opacity={0.3 + i * 0.1} />)}
      </Strip>
      <span className="sw-heave">
        <Strip w={T} h={22} dur={15} phase={0.7} className="sw-swell">
          <path d={ridge(T, 22, 7, SWELL)} fill="#0b1a24" />
          <path d={ridge(T, 22, 7, SWELL).replace(/L300 22Z$/, "").replace(/^M0 22L/, "M")} fill="none" stroke="#5f9aa3" strokeWidth=".8" opacity=".7" />
          {FOAM.map((fm, i) => {
            const y = 7 + SWELL.reduce((s, [a, k, p]) => s + a * Math.sin((2 * Math.PI * k * fm.x) / T + p), 0);
            return <path key={i} d={`M${f(fm.x)} ${f(y + 0.4)}q${f(fm.w / 2)} -1.4 ${f(fm.w)} 0`} fill="none" stroke="#d6e6f2" strokeWidth=".7" strokeLinecap="round" opacity=".55" />;
          })}
        </Strip>
      </span>
    </>
  );
}

function Headland({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 110 96" className="sw-head" style={{ right: 0, bottom: 0, width: "36.7%" }}>
      <path d="M0 96L6 84L14 80L20 70L26 66L30 54L36 48L40 34L56 30L74 31L86 36L96 34L110 30V96Z" fill="#0a1017" />
      <path d="M20 70L26 66L30 54L36 48L40 34L56 30L74 31L86 36L96 34L110 30" fill="none" stroke="#2f3f52" strokeWidth=".8" opacity=".8" />
      <path d="M30 54L38 58M36 48L46 52M40 34L44 44M58 30L60 40M78 32L74 44" fill="none" stroke="#1a2531" strokeWidth=".6" />
      {/* Surf at the foot of the cliff. */}
      <path className="sw-surf" d="M2 88C6 84 10 86 14 82C17 80 20 83 22 79" fill="none" stroke="#dbe8f3" strokeWidth="1" strokeLinecap="round" />
      <path className="sw-surf sw-surf-b" d="M8 92C12 89 15 91 19 88" fill="none" stroke="#dbe8f3" strokeWidth=".8" strokeLinecap="round" />
      {/* The lighthouse. */}
      <g transform="translate(64 30)">
        <path d="M-3.6 0L-2.6 -17H2.6L3.6 0Z" fill="#b9c6d2" />
        <path d="M-3.3 -5.4H3.3L3.1 -8.6H-3.1ZM-2.9 -12.4H2.9L2.8 -15H-2.8Z" fill="#2b3a4a" />
        <rect x="-3.2" y="-18.2" width="6.4" height="1.4" fill="#2b3a4a" />
        <rect x="-2" y="-21.6" width="4" height="3.4" fill="#cfe2f2" opacity=".35" />
        <path d="M-2.6 -21.6L0 -24.4L2.6 -21.6Z" fill="#2b3a4a" />
        <circle className="sw-lamp-halo" cx="0" cy="-19.9" r="9" fill={`url(#${uid}-lamp)`} />
        <circle className="sw-lamp" cx="0" cy="-19.9" r="1.4" fill="#eef6ff" />
      </g>
    </Piece>
  );
}

export function Stormwatch({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13283a" />
          <stop offset=".4" stopColor="#0d1f2c" />
          <stop offset="1" stopColor="#08131b" />
        </linearGradient>
        <radialGradient id={`${uid}-seaflash`} cx=".8" cy="0" r=".42">
          <stop offset="0" stopColor="#a9c4dd" stopOpacity=".35" />
          <stop offset="1" stopColor="#a9c4dd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-lamp`}>
          <stop offset="0" stopColor="#eef6ff" stopOpacity=".7" />
          <stop offset=".4" stopColor="#bcd3e6" stopOpacity=".18" />
          <stop offset="1" stopColor="#bcd3e6" stopOpacity="0" />
        </radialGradient>
      </Defs>
      <Sky />
      <Sea uid={uid} />
      <Headland uid={uid} />
    </>
  );
}
