import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { behindClip, f } from "./kit";
import "./koiCurrent.css";

/*
 Koi Current: two koi, a Kohaku (white and orange) and a Showa (black,
 orange and white), swimming nose to tail round the photo on a thin
 current of water, as if the photo sat in a pond seen from a low angle.

 The pond is a circle in a frame squashed to half height and tilted a
 touch, so the fish are drawn from above and projected with it: broadside
 across the front and back, foreshortened at the ends where they swim
 towards or away from you. Opposite each other on one turning group, they
 can never drift out of step. The far half of the circle passes behind the
 head (a clip, not a second copy) and the near half comes across the bottom
 of the photo.

 Each fish beats its tail and flexes its body on one short cycle, with its
 pectoral fins on another; the two fish run those cycles out of phase. A
 brighter run of water travels round the current faster than the fish.

 Hover brightens the current.
*/

const O = { x: 100, y: 108 };
const TILT = -6;
const RX = 70;
const K = 0.5;
const CLIP = behindClip(O.x, O.y, TILT);
const CIRC = 2 * Math.PI * RX;

const BODY = "M0 12.6C2.7 12.4 4.7 8.6 4.6 3.6C4.5 -1.4 2.7 -5.6 1.3 -8L-1.3 -8C-2.7 -5.6 -4.5 -1.4 -4.6 3.6C-4.7 8.6 -2.7 12.4 0 12.6Z";
const TAIL = "M0 .8C2 -1.6 5.4 -4.4 6.2 -9.4C3.8 -7.8 1.8 -7.2 0 -5.6C-1.8 -7.2 -3.8 -7.8 -6.2 -9.4C-5.4 -4.4 -2 -1.6 0 .8Z";
const FIN = "M0 0C2.6 .4 4.8 -1.6 5.2 -4.4C3.4 -3.6 1.6 -2.8 0 -1.6Z";

type Kind = "kohaku" | "showa";

const MARKS: Record<Kind, { d: string; fill: string }[]> = {
  kohaku: [
    { d: "M-2.6 10.4C-1.2 12.2 1.4 12 2.6 10.2C2 8.2 -1.6 7.8 -2.6 10.4Z", fill: "#ee5f1c" },
    { d: "M-3.6 4.6C-2 6.6 2.6 6.2 3.8 3.4C4 .4 1.4 -.6 -1.2 .4C-3 1.2 -4.2 2.8 -3.6 4.6Z", fill: "#f06a22" },
    { d: "M-1.6 -3.4C-.2 -2.2 1.8 -2.8 2 -4.6C1.6 -6.4 -.6 -6.2 -1.6 -3.4Z", fill: "#f06a22" },
  ],
  showa: [
    { d: "M-2.4 10.6C-1 12 1.4 11.8 2.4 10.2C1.6 8.4 -1.4 8.4 -2.4 10.6Z", fill: "#ef6420" },
    { d: "M-4.3 2C-3 4 -1 3.4 0 1C.6 -1.4 -1.6 -3 -3.5 -1.6Z", fill: "#1e1b22" },
    { d: "M1.4 6.4C3 7.2 4.3 5.6 4.2 3.6C2.6 3.6 1.2 4.6 1.4 6.4Z", fill: "#1e1b22" },
    { d: "M.6 -.2C2.4 .6 4 -.6 3.7 -2.6C2.2 -2.8 .8 -1.8 .6 -.2Z", fill: "#f17a2c" },
    { d: "M.2 -4.2C1.4 -3.6 1.9 -5.6 1.2 -7.4C.2 -6.8 -.4 -5.4 .2 -4.2Z", fill: "#1e1b22" },
  ],
};

/** One koi, drawn from above with its head along +y (the way it swims). */
function Koi({ kind, phase }: { kind: Kind; phase: number }) {
  const beat = { "--kd": `${f(-phase * 0.76)}s`, "--fd": `${f(-phase * 0.9 - 0.3)}s` } as CSSProperties;
  const tailTint = kind === "showa" ? "#ffd2b4" : "#ffffff";
  return (
    <g style={beat}>
      {[1, -1].map((side) => (
        <g key={side} transform={`translate(${side * 4.1} 6) scale(${side} 1)`}>
          <g className="kc-fin di">
            <path d={FIN} fill="#ffffff" fillOpacity=".55" stroke="#ffffff" strokeOpacity=".7" strokeWidth=".3" />
            <path d="M.4 -.6L3.8 -3.4M.6 -1.2L4.4 -2.4" stroke="#e8ddd0" strokeWidth=".25" opacity=".8" />
          </g>
        </g>
      ))}
      <g transform="translate(0 -7.4)">
        <g className="kc-tail di">
          <path d={TAIL} fill={tailTint} fillOpacity=".6" stroke="#ffffff" strokeOpacity=".75" strokeWidth=".3" />
          <path d="M0 -.6L-3.6 -7.6M0 -.6L-1.4 -6.4M0 -.6L1.4 -6.4M0 -.6L3.6 -7.6" stroke="#e9ddd0" strokeWidth=".25" opacity=".7" />
        </g>
      </g>
      <g transform="translate(0 8)">
        <g className="kc-body di">
          <g transform="translate(0 -8)">
            <path d={BODY} fill="#f8f2e9" stroke="#c9bba9" strokeWidth=".35" />
            {MARKS[kind].map((m, i) => <path key={i} d={m.d} fill={m.fill} />)}
            <path d="M0 8.4C.1 3.4 .1 -1.8 0 -7" fill="none" stroke="#d8c9b5" strokeWidth=".4" opacity=".7" />
            <path d="M-3.1 7.4C-3.7 3.4 -3.4 -.8 -2 -4.6" fill="none" stroke="#ffffff" strokeWidth=".5" strokeLinecap="round" opacity=".65" />
            <circle cx="-2.5" cy="9.6" r=".55" fill="#1b1a1f" />
            <circle cx="2.5" cy="9.6" r=".55" fill="#1b1a1f" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <clipPath id={`${uid}-behind`}>
          <path d={CLIP} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-behind)`}>
        <g transform={`translate(${O.x} ${O.y}) rotate(${TILT}) scale(1 ${K})`}>
          {/* The current: two fine lines and a brighter run travelling round. */}
          <circle r={RX + 3.4} fill="none" stroke="#9fe3de" strokeWidth="1" opacity=".12" />
          <circle className="kc-water" r={RX} fill="none" stroke="#9fe3de" strokeWidth="1.7" />
          <g className="kc-flow di">
            <circle r={RX} fill="none" stroke="#e8fffb" strokeWidth="1.8" strokeLinecap="round" strokeDasharray={`34 ${f(CIRC - 34)}`} opacity=".55" />
            <circle r={RX} fill="none" stroke="#e8fffb" strokeWidth="1.4" strokeLinecap="round" strokeDasharray={`12 ${f(CIRC - 12)}`} strokeDashoffset={f(-CIRC / 2)} opacity=".4" />
            <circle r={RX + 3.4} fill="none" stroke="#c9f5ef" strokeWidth="1" strokeLinecap="round" strokeDasharray={`18 ${f(2 * Math.PI * (RX + 3.4) - 18)}`} strokeDashoffset={f(-CIRC * 0.3)} opacity=".3" />
          </g>
          <g className="kc-swim di">
            <g transform={`translate(${RX} 0) scale(1.2)`}><Koi kind="kohaku" phase={0} /></g>
            <g transform={`rotate(180) translate(${RX} 0) scale(1.2)`}><Koi kind="showa" phase={0.5} /></g>
          </g>
        </g>
      </g>
    </>
  );
}

export const koiCurrent: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
