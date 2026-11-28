import type { CSSProperties, ReactNode } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { behindClip, f } from "./kit";
import "./moonlitOrbit.css";

/*
 Moonlit Orbit: a small cratered moon on a tilted elliptical orbit round the
 photo, with two pinpoint stars on wider and narrower orbits of the same
 plane, each at its own speed. The orbit is seen from just above, so the
 far side passes behind the head (hidden by a clip, not a second copy) and
 the near side comes across the bottom of the photo, a touch larger.

 Each orbiter is a pure translation built from one turning group inside a
 squashed frame (rotate θ, out by r, rotate back), so the path is a true
 ellipse with no keyframe sampling, and the loop is a full turn. A second,
 half-length alternate animation swells it on the near side and shrinks it
 on the far side, phased from the same start angle so the two stay locked.

 Hover lights the orbit line and lifts the moon's glow.
*/

const O = { x: 100, y: 104 };
const TILT = -14;
/** ry / rx of every orbit: how far the plane leans away. */
const K = 0.31;
const CLIP = behindClip(O.x, O.y, TILT);

interface OrbitSpec {
  /** Major radius. */
  r: number;
  /** Seconds per lap at 1x. */
  t: number;
  /** Where it starts (and rests when motion is off), degrees from the +x end; 90 is nearest. */
  a0: number;
  /** Scale at the far and near points. */
  far: number;
  near: number;
}

const MOON: OrbitSpec = { r: 68, t: 16, a0: 24, far: 0.8, near: 1.08 };
const STARS: (OrbitSpec & { size: number; tw: number; td: number })[] = [
  { r: 57, t: 9.6, a0: 204, far: 0.7, near: 1.15, size: 2.5, tw: 2.3, td: -0.7 },
  { r: 78, t: 24, a0: 318, far: 0.75, near: 1.1, size: 3.1, tw: 3.1, td: -1.9 },
];

function Orbiter({ spec, children }: { spec: OrbitSpec; children: ReactNode }) {
  const vars = {
    "--r": `${spec.r}px`,
    "--t": `${spec.t}s`,
    "--a0": `${spec.a0}deg`,
    "--p": spec.a0 / 360,
    "--far": spec.far,
    "--near": spec.near,
  } as CSSProperties;
  return (
    <g className="mo-orbit di" style={vars}>
      <g transform={`scale(1 ${f(1 / K)})`}>
        <g transform={`rotate(${-TILT})`}>
          <g className="mo-depth di" style={vars}>{children}</g>
        </g>
      </g>
    </g>
  );
}

const GLINT = "M0 -1C.14 -.26 .26 -.14 1 0C.26 .14 .14 .26 0 1C-.14 .26 -.26 .14 -1 0C-.26 -.14 -.14 -.26 0 -1Z";

/** Craters lit from the upper left: a shaded bowl with its lower-right wall catching the light. */
const CRATERS = [
  { x: -2.7, y: -1.5, r: 1.75 },
  { x: 2.5, y: 2.2, r: 1.3 },
  { x: -0.6, y: 3.9, r: 0.9 },
  { x: 3.2, y: -2.9, r: 0.8 },
  { x: -4.4, y: 2.1, r: 0.72 },
  { x: 0.9, y: -4.6, r: 0.6 },
];

function Moon({ uid }: { uid: string }) {
  return (
    <g>
      <circle className="mo-glow di" r={19} fill={`url(#${uid}-glow)`} />
      <circle className="mo-glow-hover" r={13} fill={`url(#${uid}-glow)`} />
      <circle r={8} fill={`url(#${uid}-moon)`} />
      {/* Maria: the darker seas. */}
      <path d="M-5.6 -3.4C-4.2 -5.6 -1.2 -5.8 .4 -4.2C1.6 -3 .2 -1.6 -1.6 -1.2C-3.4 -.8 -3.6 .8 -5.2 .6C-6.6 .4 -6.6 -1.8 -5.6 -3.4Z" fill="#a69f90" opacity=".42" />
      <path d="M1.4 .6C2.8 -.6 5.2 -.2 5.8 1.6C6.4 3.4 4.6 5.2 2.8 4.8C1 4.4 .2 1.6 1.4 .6Z" fill="#a69f90" opacity=".32" />
      {CRATERS.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`}>
          <circle r={c.r} fill="#948c7c" opacity=".75" />
          <circle cx={c.r * 0.22} cy={c.r * 0.22} r={c.r * 0.74} fill="#ddd6c6" opacity=".85" />
          <circle cx={c.r * 0.08} cy={c.r * 0.08} r={c.r * 0.5} fill="#c3bba9" opacity=".9" />
        </g>
      ))}
      {/* The night side, then a thin rim of light on the day side. */}
      <circle r={8} fill={`url(#${uid}-shade)`} />
      <circle r={7.7} fill="none" stroke="#fffdf6" strokeWidth=".5" strokeDasharray="15 33.4" strokeDashoffset="25" strokeLinecap="round" opacity=".7" />
    </g>
  );
}

function Star({ size }: { size: number }) {
  return (
    <g transform={`scale(${size})`}>
      <circle r=".9" fill="#c9d6ff" opacity=".28" />
      <path d={GLINT} fill="#f6f8ff" />
    </g>
  );
}

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-moon`} cx=".36" cy=".3" r=".78">
          <stop offset="0" stopColor="#fdfbf4" />
          <stop offset=".5" stopColor="#e7e1d3" />
          <stop offset="1" stopColor="#b8b0a0" />
        </radialGradient>
        <radialGradient id={`${uid}-shade`} cx=".3" cy=".26" r=".92">
          <stop offset=".52" stopColor="#2c2a40" stopOpacity="0" />
          <stop offset=".86" stopColor="#2c2a40" stopOpacity=".42" />
          <stop offset="1" stopColor="#1d1b2e" stopOpacity=".62" />
        </radialGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset=".28" stopColor="#dfe6ff" stopOpacity=".42" />
          <stop offset=".55" stopColor="#9fb3f2" stopOpacity=".16" />
          <stop offset="1" stopColor="#7d91d8" stopOpacity="0" />
        </radialGradient>
        {/* The orbit line fades out where it would cross the photo. */}
        <linearGradient id={`${uid}-trace`} gradientUnits="userSpaceOnUse" x1={O.x - 70} y1="0" x2={O.x + 70} y2="0">
          <stop offset="0" stopColor="#c9d6ff" stopOpacity=".55" />
          <stop offset=".24" stopColor="#c9d6ff" stopOpacity="0" />
          <stop offset=".76" stopColor="#c9d6ff" stopOpacity="0" />
          <stop offset="1" stopColor="#c9d6ff" stopOpacity=".55" />
        </linearGradient>
        <clipPath id={`${uid}-behind`}>
          <path d={CLIP} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-behind)`}>
        <ellipse className="mo-trace" cx={O.x} cy={O.y} rx={MOON.r} ry={f(MOON.r * K)} transform={`rotate(${TILT} ${O.x} ${O.y})`} fill="none" stroke={`url(#${uid}-trace)`} strokeWidth=".7" />
        <g transform={`translate(${O.x} ${O.y}) rotate(${TILT}) scale(1 ${K})`}>
          {STARS.map((s, i) => (
            <Orbiter key={i} spec={s}>
              <g className="mo-twinkle di" style={{ "--tw": `${s.tw}s`, "--td": `${s.td}s` } as CSSProperties}>
                <Star size={s.size} />
              </g>
            </Orbiter>
          ))}
          <Orbiter spec={MOON}>
            <Moon uid={uid} />
          </Orbiter>
        </g>
      </g>
    </>
  );
}

export const moonlitOrbit: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
