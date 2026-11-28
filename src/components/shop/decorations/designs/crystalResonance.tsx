import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { f } from "./kit";
import "./crystalResonance.css";

/*
 Crystal Resonance: a cluster of faceted amethyst-and-ice crystals floating
 off the photo's lower left.

 Each crystal is a double-terminated prism cut into six facets, lit from
 the upper left, with a fine refraction line inside and a bright edge.
 Three larger crystals rock slowly, each at its own rate; three small
 shards turn right round, at three different speeds, two of them backwards.
 On one shared six-second breath they all drift out from the cluster's
 centre and back in together, which is the resonance. Every 6.5s a band of
 light sweeps across them left to right, crystal by crystal (it is clipped
 to each crystal and timed by where that crystal sits), and the tip of the
 largest catches it as one small glint. A faint ring leaves the cluster on
 the same beat.

 Hover brings the glow up under the cluster.
*/

const CL = { x: 52, y: 162 };
const GLINT = "M0 -3.4C.3 -.6 .6 -.3 3.4 0C.6 .3 .3 .6 0 3.4C-.3 .6 -.6 .3 -3.4 0C-.6 -.3 -.3 -.6 0 -3.4Z";

interface Crystal {
  x: number;
  y: number;
  /** Lean from upright, degrees. */
  a: number;
  len: number;
  wid: number;
  /** Rocking: ± degrees and seconds per swing; or a full turn in `spin` seconds (negative: backwards). */
  rock?: [number, number];
  spin?: number;
  /** How far it breathes out from the centre. */
  out: number;
  tint?: "rose";
}

const CRYSTALS: Crystal[] = [
  { x: -11, y: 5, a: -30, len: 19, wid: 6.6, rock: [8, 3.7], out: 2.4, tint: "rose" },
  { x: 11, y: 4, a: 26, len: 21, wid: 7.2, rock: [7, 2.6], out: 2.4 },
  { x: 0, y: -2, a: -6, len: 30, wid: 10.5, rock: [4, 3.2], out: 0 },
  { x: -12, y: -14, a: -24, len: 8, wid: 3.4, spin: -22, out: 3 },
  { x: 6, y: -19, a: 14, len: 10, wid: 4, spin: 16, out: 3 },
  { x: 18, y: -9, a: 40, len: 6.6, wid: 2.8, spin: -12, out: 2.6 },
];

function facets(len: number, wid: number) {
  const h = len / 2;
  const w = wid / 2;
  const cap = wid * 0.55;
  const xr = w * 0.2;
  const P = (pts: [number, number][]) => "M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z";
  return {
    outline: P([[0, -h], [w, -h + cap], [w, h - cap], [0, h], [-w, h - cap], [-w, -h + cap]]),
    left: P([[-w, -h + cap], [xr, -h + cap * 0.85], [xr, h - cap * 0.85], [-w, h - cap]]),
    right: P([[xr, -h + cap * 0.85], [w, -h + cap], [w, h - cap], [xr, h - cap * 0.85]]),
    topL: P([[0, -h], [-w, -h + cap], [xr, -h + cap * 0.85]]),
    topR: P([[0, -h], [xr, -h + cap * 0.85], [w, -h + cap]]),
    botL: P([[0, h], [-w, h - cap], [xr, h - cap * 0.85]]),
    botR: P([[0, h], [xr, h - cap * 0.85], [w, h - cap]]),
    inner: `M${f(-w * 0.5)} ${f(-h + cap)}L${f(-w * 0.28)} ${f(h - cap)}`,
    h,
    w,
  };
}

function CrystalShape({ c, i, uid, glint }: { c: Crystal; i: number; uid: string; glint?: boolean }) {
  const fc = facets(c.len, c.wid);
  const rose = c.tint === "rose";
  // The sweep reaches each crystal in turn, by its place across the cluster.
  const sweepDelay = f(((c.x + 20) / 40) * 0.7);
  return (
    <g>
      <defs>
        <clipPath id={`${uid}-c${i}`}><path d={fc.outline} /></clipPath>
      </defs>
      <path d={fc.left} fill="#ddd3fd" fillOpacity=".58" />
      <path d={fc.right} fill={rose ? "#c58ad0" : "#8b76d8"} fillOpacity=".62" />
      <path d={fc.topL} fill="#f6f2ff" fillOpacity=".8" />
      <path d={fc.topR} fill="#b8a6f2" fillOpacity=".7" />
      <path d={fc.botL} fill="#a995ea" fillOpacity=".55" />
      <path d={fc.botR} fill={rose ? "#7f4a92" : "#5c4aa6"} fillOpacity=".66" />
      <path d={fc.inner} stroke="#ffffff" strokeWidth=".35" opacity=".3" />
      <g clipPath={`url(#${uid}-c${i})`}>
        <g transform="skewX(-22)">
          <rect className="cr-sweep di" x="-1.6" y={-fc.h - 4} width="3.2" height={c.len + 8} fill="#ffffff" style={{ "--sw0": `${-fc.w - 8}px`, "--sw1": `${fc.w + 8}px`, "--sd": `${sweepDelay}s` } as CSSProperties} />
        </g>
      </g>
      <path d={fc.outline} fill="none" stroke="#f6f3ff" strokeWidth=".45" strokeLinejoin="round" opacity=".78" />
      {glint && (
        // The tip catches the light once the sweep has crossed it.
        <g transform={`translate(0 ${f(-fc.h)})`}>
          <g className="cr-glint di">
            <path d={GLINT} fill="#ffffff" />
          </g>
        </g>
      )}
    </g>
  );
}

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-glow`}>
          <stop offset=".1" stopColor="#c7b5ff" stopOpacity=".3" />
          <stop offset="1" stopColor="#9b84f2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform={`translate(${CL.x} ${CL.y}) scale(1.1)`}>
        <circle className="cr-glow di" r="30" fill={`url(#${uid}-glow)`} />
        <circle className="cr-glow-hover" r="22" fill={`url(#${uid}-glow)`} />
        <circle className="cr-ring di" r="17" fill="none" stroke="#cdbfff" strokeWidth=".45" />
        {CRYSTALS.map((c, i) => {
          const len = Math.hypot(c.x, c.y) || 1;
          const vars = {
            "--ox": `${f((c.x / len) * c.out)}px`,
            "--oy": `${f((c.y / len) * c.out)}px`,
            "--rk": `${c.rock?.[0] ?? 0}deg`,
            "--rt": `${c.rock?.[1] ?? 1}s`,
            "--rd": `${f(-i * 1.1)}s`,
            "--st": `${Math.abs(c.spin ?? 1)}s`,
            "--bd": `${f(-i * 0.18)}s`,
          } as CSSProperties;
          return (
            <g key={i} className="cr-breathe di" style={vars}>
              <g transform={`translate(${c.x} ${c.y}) rotate(${c.a})`}>
                <g className={`${c.spin ? (c.spin > 0 ? "cr-spin" : "cr-spin cr-spin-back") : "cr-rock"} di`} style={vars}>
                  <CrystalShape c={c} i={i} uid={uid} glint={c.out === 0} />
                </g>
              </g>
            </g>
          );
        })}
      </g>
    </>
  );
}

export const crystalResonance: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
