import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import "./liquidChrome.css";

/*
 Liquid Chrome: a ring of liquid metal round the photo.

 The surface reflects a fixed world (bright sky above, a dark horizon with a
 warm glint, dark ground, a little bounce at the bottom), so the reflection
 holds still while the ring moves through it. The ring is two rings poured
 together: each one leans into a slight ellipse whose long axis turns, at
 different speeds and in opposite directions, and their union (outlines
 drawn under both fills) is a soft, ever-changing shape that never repeats
 the same lobe twice in a row. A specular highlight runs round the ring
 and a thinner glint runs the other way along its inner lip; a bead of
 metal swells out of the outer edge, rides along and sinks back in.

 The deformation is ±3% of the radius, so the inner edge never touches the
 photo. Hover brightens the highlight.
*/

const R = 56.4;
/** Circumference, for dashes that are one highlight long. */
const CIRC = 2 * Math.PI * R;
const CIRC_IN = 2 * Math.PI * (R - 2.6);

function Front({ uid }: DecorationLayerProps) {
  const chrome = `url(#${uid}-chrome)`;
  return (
    <>
      <defs>
        {/* The reflected world, in the ring's own (centred) space. */}
        <linearGradient id={`${uid}-chrome`} gradientUnits="userSpaceOnUse" x1="0" y1="-61" x2="0" y2="61">
          <stop offset="0" stopColor="#f5f7fa" />
          <stop offset=".19" stopColor="#d2d8df" />
          <stop offset=".37" stopColor="#8b949e" />
          <stop offset=".455" stopColor="#3a4048" />
          <stop offset=".5" stopColor="#1e2329" />
          <stop offset=".525" stopColor="#e6d6b2" />
          <stop offset=".575" stopColor="#aab1b9" />
          <stop offset=".74" stopColor="#59616b" />
          <stop offset=".9" stopColor="#2b3037" />
          <stop offset="1" stopColor="#bcc3cb" />
        </linearGradient>
        {/* The tube's roundness: shadowed lips, one bright line along the crown. */}
        <radialGradient id={`${uid}-tube`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="60.6">
          <stop offset=".862" stopColor="#0b0d10" stopOpacity=".5" />
          <stop offset=".9" stopColor="#0b0d10" stopOpacity="0" />
          <stop offset=".935" stopColor="#ffffff" stopOpacity=".24" />
          <stop offset=".958" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#0b0d10" stopOpacity=".46" />
        </radialGradient>
        <radialGradient id={`${uid}-bead`} cx=".36" cy=".3" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".32" stopColor="#d8dee5" />
          <stop offset=".7" stopColor="#5d656f" />
          <stop offset="1" stopColor="#22272d" />
        </radialGradient>
      </defs>
      <g transform="translate(100 100)">
        {/* The bead sits under the ring, so its root is hidden in the metal. */}
        <g className="lc-bead-orbit di">
          <g className="lc-bead di">
            <circle r="2.6" fill="#1c2026" />
            <circle r="2.3" fill={`url(#${uid}-bead)`} />
          </g>
        </g>
        {/* Outlines of both rings first, then both fills: only the outline of
            the union shows. */}
        <g className="lc-wob lc-wob-a di"><circle r={R} fill="none" stroke="#1b1f25" strokeWidth="8.7" /></g>
        <g className="lc-wob lc-wob-b di"><g className="lc-breathe di"><circle r={R - 0.5} fill="none" stroke="#1b1f25" strokeWidth="8.3" /></g></g>
        <g className="lc-wob lc-wob-a di"><circle r={R} fill="none" stroke={chrome} strokeWidth="7" /></g>
        <g className="lc-wob lc-wob-b di"><g className="lc-breathe di"><circle r={R - 0.5} fill="none" stroke={chrome} strokeWidth="6.6" /></g></g>
        <g className="lc-wob lc-wob-a di">
          <circle r={R} fill="none" stroke={`url(#${uid}-tube)`} strokeWidth="7.8" />
          <g className="lc-spec di">
            <circle className="lc-spec-soft" r={R} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeDasharray={`26 ${(CIRC - 26).toFixed(2)}`} strokeDashoffset="7.5" />
            <circle r={R + 0.7} fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" strokeDasharray={`11 ${(CIRC - 11).toFixed(2)}`} opacity=".92" />
            <circle r={R + 0.7} fill="none" stroke="#fff4d6" strokeWidth=".6" strokeLinecap="round" strokeDasharray={`3 ${(CIRC - 3).toFixed(2)}`} strokeDashoffset="-30" opacity=".8" />
          </g>
          <g className="lc-glint di">
            <circle r={R - 2.6} fill="none" stroke="#ffffff" strokeWidth=".6" strokeLinecap="round" strokeDasharray={`7 ${(CIRC_IN - 7).toFixed(2)}`} opacity=".65" />
          </g>
        </g>
      </g>
    </>
  );
}

export const liquidChrome: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
