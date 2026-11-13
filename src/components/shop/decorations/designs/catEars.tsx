import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Cat Ears: fluffy black cat ears with pink insides, rooted on the upper rim
 of the photo, matching the Cat Ears profile skin. At rest an ear flicks now
 and then. On hover both ears shake, a blush comes up on the cheeks and
 two little scribble marks wiggle on it.

 The left ear is drawn once; the right is its mirror image.
*/

// Roots on the rim at about (60,74) and (90,52); the tip at (54,22).
const EAR = "M60 75C53 59 51 41 53.5 25C54.5 20.5 58.5 19 62 21.5C72 30 82 41 91 52Z";
const INNER = "M64.5 66C61.5 55 60.5 43 61.5 32C68 38 74.5 45.5 81 54C75.5 59.5 70 63.5 64.5 66Z";
// A soft lighter patch inside the pink.
const FLUFF = "M66.5 61C65 53 64.8 46 65.5 40C69 45 72.5 50 75.5 56C72.5 58.5 69.5 60.2 66.5 61Z";

function Ear({ uid }: { uid: string }) {
  // Wider than drawn but only a little taller, grown out from the root so it
  // stays on the rim, then slid a little further round the rim (turned about
  // the photo's centre) to sit further from the other ear.
  return (
    <g transform="rotate(-9 100 100) translate(75 64) scale(1.3 1.08) translate(-75 -64)">
      <path d={EAR} fill="#0d0b10" transform="translate(1.2 1.2)" opacity=".5" />
      <path d={EAR} fill={`url(#${uid}-fur)`} />
      <path d={INNER} fill={`url(#${uid}-inner)`} />
      <path d={FLUFF} fill="#f6b3ac" opacity=".7" />
      <path d="M57 64C54 52 53.5 39 55.5 27" fill="none" stroke="#3a3540" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
    </g>
  );
}

function Blush({ uid, x, mark }: { uid: string; x: number; mark: string }) {
  return (
    <g transform={`translate(${x} 118)`}>
      <ellipse className="cte-blush" cx="0" cy="0" rx="13" ry="7" fill={`url(#${uid}-blush)`} />
      <path className="cte-mark" d={mark} fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-fur`} x1="70" y1="70" x2="56" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0f0d12" />
          <stop offset="1" stopColor="#2b2730" />
        </linearGradient>
        <linearGradient id={`${uid}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef7f73" />
          <stop offset="1" stopColor="#f29a90" />
        </linearGradient>
        <radialGradient id={`${uid}-blush`}>
          <stop offset="0" stopColor="#ff8fb0" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff8fb0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g key={cycle} className={play ? "cte-play" : undefined}>
        <g className="cte-ear cte-ear-l">
          <g className="cte-twitch di">
            <Ear uid={uid} />
          </g>
        </g>
        <g transform="translate(200 0) scale(-1 1)">
          <g className="cte-ear cte-ear-r">
            <g className="cte-twitch cte-twitch-r di">
              <Ear uid={uid} />
            </g>
          </g>
        </g>
        <g className="cte-cheeks">
          <Blush uid={uid} x={72} mark="M-6 2C-5 -3 -2 -3 -2 1C-1 -4 2 -4 2 1C3 -3 6 -3 6 1" />
          <Blush uid={uid} x={128} mark="M-5 2C-4 -2 -1 -2 -1 1C0 -3 3 -3 3 1C4 -2 6 -2 6 0" />
        </g>
      </g>
    </>
  );
}

export const catEars: DesignSpec = { cycleMs: 1400, gapMs: 500, front: (p) => <Front {...p} /> };
