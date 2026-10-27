import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Devil's Demise: two horns rooted on the upper rim of the photo, sweeping out
 and up before hooking back in at the tips. Ridged, glossy, darkest where
 they meet the head. At rest the roots smoulder and the odd ember drifts off
 a tip. On hover the horns flex out and back, fire climbs inside them, the
 tips catch, and embers pour off.

 The left horn is drawn once; the right is its mirror image.
*/

// Roots on the rim at (64,67) and (85,55); the tip hooks in at (69,23),
// a little over a third of the photo's height above its top.
const HORN =
  "M64 67C53 60 48 46 54 34C57 28 62 25 69 23C65 28 63 34 64 40C65 47 73 52 85 55Z";
const RIDGES = [
  "M57 55Q67 50 77 53",
  "M53.5 46Q61 42 67 45",
  "M53 38.5Q58 35.5 63 37.5",
  "M55 31.5Q59 29.5 63 30",
  "M58.5 27Q61.5 25.5 64.5 25.5",
];
const FLAME = "M0 0C-3 -4 -2.5 -8.5 0 -13C.6 -9 3.4 -7.6 3.2 -3.6C3 -1.4 1.6 -.2 0 0Z";
const EMBERS = [
  { x: 66, y: 26, dx: -6, dy: -24, d: 0 },
  { x: 62, y: 31, dx: 4, dy: -28, d: 0.18 },
  { x: 68, y: 24, dx: -2, dy: -30, d: 0.36 },
  { x: 58, y: 37, dx: -10, dy: -20, d: 0.54 },
  { x: 64, y: 28, dx: 8, dy: -22, d: 0.72 },
];

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-horn`} x1="76" y1="62" x2="64" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#3e0407" />
        <stop offset=".3" stopColor="#8e0d15" />
        <stop offset=".7" stopColor="#d81f26" />
        <stop offset="1" stopColor="#ff5b3d" />
      </linearGradient>
      <linearGradient id={`${uid}-fire`} x1="76" y1="62" x2="64" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ff3d00" stopOpacity="0" />
        <stop offset=".4" stopColor="#ff6a00" stopOpacity=".55" />
        <stop offset=".8" stopColor="#ffb02e" stopOpacity=".85" />
        <stop offset="1" stopColor="#fff0a0" stopOpacity="1" />
      </linearGradient>
      <radialGradient id={`${uid}-heat`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#ff4b1f" stopOpacity=".55" />
        <stop offset="1" stopColor="#ff2a00" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-flame`} cx="50%" cy="80%" r="70%">
        <stop offset="0" stopColor="#fff4b0" />
        <stop offset=".45" stopColor="#ffb02e" />
        <stop offset="1" stopColor="#ff3d00" stopOpacity=".1" />
      </radialGradient>
      <clipPath id={`${uid}-clip`}>
        <path d={HORN} />
      </clipPath>
    </defs>
  );
}

function Horn({ uid }: { uid: string }) {
  return (
    <>
      {/* Where the root meets the head: a dark collar and heat on the photo. */}
      <ellipse className="dd-heat di" cx="74" cy="61" rx="15" ry="8" fill={`url(#${uid}-heat)`} />
      <path d={HORN} fill="#26030a" transform="translate(1.6 1.4)" />
      <path d={HORN} fill={`url(#${uid}-horn)`} />
      <g clipPath={`url(#${uid}-clip)`}>
        {RIDGES.map((d) => (
          <g key={d}>
            <path d={d} fill="none" stroke="#3b0408" strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
            <path d={d} fill="none" stroke="#ff8a74" strokeWidth=".6" strokeLinecap="round" opacity=".35" transform="translate(0 -1.2)" />
          </g>
        ))}
        {/* Shade along the inner curve, gloss along the outer. */}
        <path d="M69 24C64 30 62 36 64 43C66 50 74 54 86 56" fill="none" stroke="#2a0306" strokeWidth="5" opacity=".45" />
        <path className="dd-fire" d={HORN} fill={`url(#${uid}-fire)`} />
      </g>
      <path d="M60 60C51 52 49 41 54 32C56 28.5 59.5 26 63.5 24.5" fill="none" stroke="#ffb3a3" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
      <path d={HORN} fill="none" stroke="#1d0205" strokeWidth=".9" strokeLinejoin="round" />
      <g transform="translate(68.5 24) rotate(18)">
        <path className="dd-flame" d={FLAME} fill={`url(#${uid}-flame)`} />
      </g>
      {EMBERS.map((e, i) => (
        <circle key={i} className={`dd-ember dd-ember-${i}`} cx={e.x} cy={e.y} r={i % 2 ? 0.9 : 1.2} fill="#ffcf70"
          style={{ ["--dx" as string]: `${e.dx}px`, ["--dy" as string]: `${e.dy}px`, ["--d" as string]: e.d }} />
      ))}
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "dd-play" : undefined}>
        <g className="dd-horn dd-horn-l">
          <Horn uid={uid} />
        </g>
        <g transform="translate(200 0) scale(-1 1)">
          <g className="dd-horn dd-horn-r">
            <Horn uid={uid} />
          </g>
        </g>
      </g>
      <circle className="dd-idle-ember di" cx="68" cy="25" r="1" fill="#ffb04a" />
      <circle className="dd-idle-ember dd-idle-ember-2 di" cx="132" cy="25" r=".9" fill="#ffb04a" />
    </>
  );
}

export const devilsDemise: DesignSpec = { cycleMs: 1600, gapMs: 400, front: (p) => <Front {...p} /> };
