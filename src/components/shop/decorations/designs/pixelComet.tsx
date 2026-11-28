import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { arcTail, f, seeded } from "./kit";
import "./pixelComet.css";

/*
 Pixel Comet: a sharp four-point comet circling the photo clockwise, with a
 white-hot core, a crisp tapered tail and a wake of square pixel fragments.

 Everything rides one turning group. The tail is three tapered blades of
 decreasing length laid over each other, so it brightens towards the head
 without a gradient. Each fragment is shed just behind the head and slides
 back along the orbit at nearly the comet's own speed, so in the world it
 hangs where it was dropped, drifting a little in or out, and fades in hard
 steps (and shrinks) the way a sprite would. Fragments are evenly phased
 round their own short lives, so the wake is always full; when one fades
 out it is already back at the head, ready to drop again.

 Hover lays a longer, fainter blade along the tail.
*/

const R = 66;
const STAR = "M0 -5.8L1.05 -1.05L5.8 0L1.05 1.05L0 5.8L-1.05 1.05L-5.8 0L-1.05 -1.05Z";
const COLORS = ["#fff4c9", "#ffd25e", "#ff9d52", "#f2647a", "#b65ad8"];

const FRAGMENTS = Array.from({ length: 13 }, (_, i) => {
  const life = 1 + seeded(i, 1) * 0.55;
  return {
    /** Spawn angle, just behind the head. */
    at: -3 - seeded(i, 6) * 5,
    /** How far back it slides (relative) over its life. */
    back: 32 + seeded(i, 2) * 26,
    /** Radial offset and drift. */
    dr: (seeded(i, 3) - 0.5) * 7.5,
    drift: (seeded(i, 4) - 0.5) * 5,
    size: [3.2, 2.5, 2.1][i % 3],
    color: COLORS[i % COLORS.length],
    life,
    delay: -seeded(i, 5) * life,
  };
});

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-glow`}>
          <stop offset=".15" stopColor="#fff6d8" stopOpacity=".75" />
          <stop offset=".45" stopColor="#ffbe6b" stopOpacity=".22" />
          <stop offset="1" stopColor="#ff8a5c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="translate(100 100)">
        <g className="pc-orbit di">
          <path className="pc-tail-hover" d={arcTail(R, -1, -64, 2.4)} fill="#ffb36b" />
          <path d={arcTail(R, -1, -42, 3.6)} fill="#ff8a5c" opacity=".36" />
          <path d={arcTail(R, -1, -25, 2.7)} fill="#ffc46b" opacity=".58" />
          <path d={arcTail(R, -1, -11, 1.8)} fill="#fff2c4" opacity=".95" />
          {FRAGMENTS.map((p, i) => {
            const vars = { "--fl": `${f(p.life)}s`, "--fd": `${f(p.delay)}s`, "--fa": `${f(-p.back)}deg`, "--fx": `${f(p.drift)}px` } as CSSProperties;
            return (
              <g key={i} transform={`rotate(${f(p.at)})`}>
                <g className="pc-frag di" style={vars}>
                  <g transform={`translate(${f(R + p.dr)} 0)`}>
                    <g className="pc-pix di" style={vars}>
                      <rect x={-p.size / 2} y={-p.size / 2} width={p.size} height={p.size} fill={p.color} />
                    </g>
                  </g>
                </g>
              </g>
            );
          })}
          <g transform={`translate(${R} 0)`}>
            <circle className="pc-glow di" r="10" fill={`url(#${uid}-glow)`} />
            <g className="pc-spin di">
              <path d={STAR} fill="#fff6d6" />
              <path d={STAR} fill="#ffcf73" transform="rotate(45) scale(.58)" />
            </g>
            <circle r="1.7" fill="#ffffff" />
          </g>
        </g>
      </g>
    </>
  );
}

export const pixelComet: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
