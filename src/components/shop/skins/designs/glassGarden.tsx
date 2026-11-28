import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, Layer, Piece, Wander, rand } from "./parts";
import "./scene.css";
import "./glassGarden.css";

/*
 Glass Garden: inside a greenhouse after dark, where the plants are the
 light.

 Overhead is a domed glass ceiling seen from below: ribs fan out from a
 crown above the card, crossed by curved purlins, with panes in two faint
 tints so the glass reads as layers, and a gutter beam where it meets the
 walls. The walls are glass too, a fine double grid. A band of reflected
 light sweeps across the ceiling every so often, and the room's light
 drifts slowly from side to side.

 Two planters stand in the bottom corners, dark and squared off, edged in
 a thread of light: strap leaves in the left one, broad arrow leaves on
 stems in the right, all emerald with veins that glow pale cyan, each leaf
 swaying on its own period. A vine hangs from the beam at the right edge,
 and a few glowing spores wander near the walls.

 Layout: ceiling in the top 32cqw, the planters are the floor (SKIN_FLOOR);
 the middle of the card is the dark glass wall, left clear for the text.
*/

const f = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------- ceiling */

const CROWN = { x: 150, y: -46 };
const RIBS = Array.from({ length: 15 }, (_, i) => -70 + i * 31);
const ribAt = (x: number, y: number) => {
  // Where the rib from the crown through (x, 100) is at height y.
  const t = (y - CROWN.y) / (100 - CROWN.y);
  return CROWN.x + (x - CROWN.x) * t;
};
const PANES = RIBS.slice(0, -1).map((x, i) => {
  const x2 = RIBS[i + 1];
  return { d: `M${f(CROWN.x)} ${CROWN.y}L${f(ribAt(x, 93))} 93L${f(ribAt(x2, 93))} 93Z`, tint: i % 2 };
});
const PURLINS = [52, 84, 118, 136].map((r) => r);

function Ceiling({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 100" className="gg-ceiling" style={{ left: 0, top: 0, width: "100%" }}>
      {PANES.map((p, i) => <path key={i} d={p.d} fill={p.tint ? "#7fe6cb" : "#bff3f0"} opacity={p.tint ? 0.06 : 0.025} />)}
      {PURLINS.map((r) => (
        <circle key={r} cx={CROWN.x} cy={CROWN.y} r={r} fill="none" stroke="#cfeeea" strokeWidth=".6" opacity=".22" />
      ))}
      {RIBS.map((x, i) => (
        <g key={x}>
          <path d={`M${CROWN.x} ${CROWN.y}L${f(ribAt(x, 93))} 93`} stroke="#0a0f0e" strokeWidth={i % 2 ? 1.4 : 2.4} opacity=".7" />
          <path d={`M${CROWN.x} ${CROWN.y}L${f(ribAt(x, 93))} 93`} stroke="#d6f4ef" strokeWidth={i % 2 ? 0.45 : 0.7} opacity={i % 2 ? 0.28 : 0.42} />
        </g>
      ))}
      {/* The gutter beam along the bottom of the dome. */}
      <rect x="0" y="91.5" width="300" height="4.4" fill="#141b1a" />
      <rect x="0" y="91.5" width="300" height=".6" fill="#bff3f0" opacity=".45" />
      <rect x="0" y="95.9" width="300" height="1.2" fill="#000" opacity=".35" />
      <rect x="0" y="0" width="300" height="100" fill={`url(#${uid}-haze)`} />
    </Piece>
  );
}

/* ---------------------------------------------------------------- vine */

const VINE_LEAVES = [
  { s: 0, t: 0.2, side: 1 }, { s: 0, t: 0.42, side: -1 }, { s: 0, t: 0.64, side: 1 }, { s: 0, t: 0.86, side: -1 },
  { s: 1, t: 0.25, side: -1 }, { s: 1, t: 0.5, side: 1 }, { s: 1, t: 0.78, side: -1 },
];
const STRANDS = [
  { x: 14, len: 46, sway: 7.4, bend: 4 },
  { x: 24, len: 32, sway: 9.2, bend: -3 },
];
const LEAF = "M0 0C2.4 -2.6 6.4 -2.8 8.2 0C6.4 2.8 2.4 2.6 0 0Z";

function Vine({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 34 60" className="gg-vine" style={{ right: 0, top: "31cqw", width: "11.4%" }}>
      {STRANDS.map((st, s) => (
        <g key={s} transform={`translate(${st.x} 0)`}>
          <g className="gg-sway" style={{ "--sw": `${st.sway}s`, "--sa": "2.6deg", "--sd": `${-s * 3.1}s` } as CSSProperties}>
            <path d={`M0 0C${st.bend} ${f(st.len * 0.35)} ${-st.bend} ${f(st.len * 0.7)} ${f(st.bend * 0.4)} ${st.len}`} fill="none" stroke="#2a7f62" strokeWidth=".7" />
            {VINE_LEAVES.filter((l) => l.s === s).map((l, i) => {
              const y = st.len * l.t;
              const x = Math.sin(l.t * Math.PI * 2) * st.bend * 0.5;
              return (
                <g key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${l.side > 0 ? 28 : 152}) scale(${0.8 + rand(i + s * 7, 3) * 0.25})`}>
                  <path d={LEAF} fill={`url(#${uid}-leaf)`} />
                  <path d="M.6 0H7.4" stroke="#c8fff0" strokeWidth=".35" opacity=".85" />
                </g>
              );
            })}
          </g>
        </g>
      ))}
    </Piece>
  );
}

/* ------------------------------------------------------------ planters */

/** A strap leaf from its base at the origin, `len` tall, curving by `bend`. */
function strap(len: number, w: number, bend: number) {
  return `M${-w / 2} 0C${-w / 2} ${f(-len * 0.4)} ${f(bend * 0.6 - w * 0.4)} ${f(-len * 0.8)} ${bend} ${-len}C${f(bend * 0.6 + w * 0.35)} ${f(-len * 0.78)} ${w / 2} ${f(-len * 0.4)} ${w / 2} 0Z`;
}
const STRAPS = [
  { x: 18, len: 44, w: 6.4, bend: -8, rot: -14, sway: 6.2 },
  { x: 26, len: 56, w: 7, bend: -3, rot: -4, sway: 7.8 },
  { x: 34, len: 50, w: 6.6, bend: 4, rot: 6, sway: 5.6 },
  { x: 44, len: 38, w: 6, bend: 7, rot: 16, sway: 6.9 },
  { x: 54, len: 30, w: 5.4, bend: 9, rot: 26, sway: 8.4 },
];
/** Arrow leaves on stems: base, stem tip, leaf angle and size. */
const ARROWS = [
  { bx: 250, tx: 236, ty: 6, a: -30, s: 1.05, sway: 8.6 },
  { bx: 258, tx: 266, ty: 0, a: 6, s: 1.2, sway: 7.2 },
  { bx: 266, tx: 288, ty: 14, a: 38, s: 0.95, sway: 9.4 },
];
const ARROW = "M0 0C-6 -4 -10 -12 -9 -20C-6 -15 -3 -13 0 -13C3 -13 6 -15 9 -20C10 -12 6 -4 0 0Z";

function Planters({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 76" className="gg-floor" style={{ left: 0, bottom: 0, width: "100%" }}>
      {/* Glass floor: a lit seam and a dim reflection of the room. */}
      <rect x="0" y="66" width="300" height="10" fill="#0a100f" />
      <rect x="0" y="66" width="300" height=".6" fill="#bff3f0" opacity=".3" />
      {/* Left: strap leaves. */}
      {STRAPS.map((l, i) => (
        <g key={i} transform={`translate(${l.x} 54) rotate(${l.rot})`}>
          <g className="gg-sway" style={{ "--sw": `${l.sway}s`, "--sa": "2.4deg", "--sd": `${-i * 1.7}s` } as CSSProperties}>
            <path d={strap(l.len, l.w, l.bend)} fill={`url(#${uid}-blade)`} />
            <path d={`M0 -1C${f(l.bend * 0.3)} ${f(-l.len * 0.45)} ${f(l.bend * 0.75)} ${f(-l.len * 0.82)} ${l.bend} ${f(-l.len + 1)}`} fill="none" stroke="#7dffd9" strokeWidth="1.8" opacity=".12" />
            <path className="gg-vein" d={`M0 -1C${f(l.bend * 0.3)} ${f(-l.len * 0.45)} ${f(l.bend * 0.75)} ${f(-l.len * 0.82)} ${l.bend} ${f(-l.len + 1)}`} fill="none" stroke="#c8fff0" strokeWidth=".55" style={{ "--vd": `${-i * 0.9}s` } as CSSProperties} />
          </g>
        </g>
      ))}
      <g transform="translate(6 52)">
        <rect x="0" y="0" width="62" height="14" rx="1.2" fill="#121918" />
        <rect x="0" y="0" width="62" height="2" rx="1" fill="#1d2725" />
        <rect x="0" y="0" width="62" height="14" rx="1.2" fill="none" stroke="#8fe3d6" strokeWidth=".45" opacity=".55" />
        <rect x="3" y="5" width="56" height=".4" fill="#8fe3d6" opacity=".2" />
      </g>
      {/* Right: arrow leaves on long stems. */}
      {ARROWS.map((l, i) => (
        <g key={i} transform={`translate(${l.bx} 54)`}>
          <g className="gg-sway" style={{ "--sw": `${l.sway}s`, "--sa": "2deg", "--sd": `${-i * 2.3}s` } as CSSProperties}>
            <path d={`M0 0Q${f((l.tx - l.bx) * 0.2)} ${f((l.ty - 54) * 0.6)} ${l.tx - l.bx} ${f(l.ty - 54 + 20 * l.s)}`} fill="none" stroke="#2a8a68" strokeWidth="1.1" />
            <g transform={`translate(${l.tx - l.bx} ${f(l.ty - 54 + 20 * l.s)}) rotate(${l.a}) scale(${l.s})`}>
              <path d={ARROW} fill={`url(#${uid}-arrow)`} />
              <path className="gg-vein" d="M0 -.6V-13M0 -4L-5 -9M0 -4L5 -9M0 -8.4L-6.6 -15.6M0 -8.4L6.6 -15.6" fill="none" stroke="#c8fff0" strokeWidth=".45" strokeLinecap="round" style={{ "--vd": `${-1.3 - i}s` } as CSSProperties} />
            </g>
          </g>
        </g>
      ))}
      <g transform="translate(232 50)">
        <path d="M0 0H60L57 16H3Z" fill="#121918" />
        <path d="M0 0H60L57 16H3Z" fill="none" stroke="#8fe3d6" strokeWidth=".45" opacity=".55" />
        <rect x="0" y="0" width="60" height="2" fill="#1d2725" />
      </g>
      {/* Seed pods glowing among the straps. */}
      {[[22, 18], [31, 9], [40, 24]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="3" fill={`url(#${uid}-pod)`} />
          <circle className="gg-pod" r=".9" fill="#e6fff8" style={{ "--pd": `${-i * 1.4}s` } as CSSProperties} />
        </g>
      ))}
    </Piece>
  );
}

function Spore() {
  return (
    <svg viewBox="-3 -3 6 6">
      <circle r="3" fill="#9ff5dc" opacity=".18" />
      <circle r="1.1" fill="#e9fffa" />
    </svg>
  );
}

export function GlassGarden({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-blade`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#0f5a43" />
          <stop offset=".55" stopColor="#1f9e74" />
          <stop offset="1" stopColor="#3fd6a0" />
        </linearGradient>
        <linearGradient id={`${uid}-arrow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fd6a0" />
          <stop offset="1" stopColor="#167556" />
        </linearGradient>
        <linearGradient id={`${uid}-leaf`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1a8a64" />
          <stop offset="1" stopColor="#46dca6" />
        </linearGradient>
        <radialGradient id={`${uid}-pod`}>
          <stop offset="0" stopColor="#c8fff0" stopOpacity=".7" />
          <stop offset="1" stopColor="#5fe3bd" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1412" stopOpacity="0" />
          <stop offset="1" stopColor="#0d1412" stopOpacity=".35" />
        </linearGradient>
      </Defs>
      <span className="gg-room" />
      <span className="gg-light" />
      <Ceiling uid={uid} />
      <span className="gg-sweep-clip"><span className="gg-sweep" /></span>
      <Vine uid={uid} />
      <Layer className="gg-spores">
        <Wander points={[[6, 40], [11, 33], [8, 52], [4, 46]]} dur={24} phase={0.1} size={2.4}><Spore /></Wander>
        <Wander points={[[93, 58], [88, 50], [95, 44], [90, 63]]} dur={28} phase={0.55} size={2}><Spore /></Wander>
        <Wander points={[[16, 74], [22, 66], [12, 62], [9, 70]]} dur={21} phase={0.3} size={1.8}><Spore /></Wander>
        <Wander points={[[84, 76], [90, 70], [80, 66], [86, 82]]} dur={26} phase={0.8} size={2.2}><Spore /></Wander>
        <Wander points={[[70, 28], [78, 24], [74, 34], [66, 31]]} dur={30} phase={0.4} size={1.6}><Spore /></Wander>
      </Layer>
      <Planters uid={uid} />
    </>
  );
}
