import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Love You Forever: three hearts up the right-hand rim, small at the bottom
 right and growing to the largest just above the middle, each tipped a
 little to follow the curve. They bob out of step at rest. On hover they beat
 in turn, smallest first, each a lub-dub with a soft overshoot, and the big
 one lets two little hearts float off.
*/

// Unit heart: x −1…1, y −0.8…1, centred near the origin.
const HEART =
  "M0 -.38C-.18 -.8 -.98 -.82 -1 -.18C-1.02 .32 -.5 .62 0 1C.5 .62 1.02 .32 1 -.18C.98 -.82 .18 -.8 0 -.38Z";

// Placed on the rim at 58°, 28° and −4° (clockwise from three o'clock).
const HEARTS = [
  { x: 128.6, y: 145.8, s: 6.6, r: 24 },
  { x: 149.4, y: 126.3, s: 9.2, r: 12 },
  { x: 156.9, y: 95.6, s: 12.8, r: -6 },
];

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-heart`} cx="38%" cy="30%" r="80%">
        <stop offset="0" stopColor="#ff9dbd" />
        <stop offset=".45" stopColor="#ff3b78" />
        <stop offset="1" stopColor="#b10a43" />
      </radialGradient>
    </defs>
  );
}

function Heart({ uid }: { uid: string }) {
  return (
    <>
      <path d={HEART} fill="#5c0322" opacity=".35" transform="translate(.12 .14)" />
      <path d={HEART} fill={`url(#${uid}-heart)`} stroke="#7d0730" strokeWidth=".07" strokeLinejoin="round" />
      <path d="M-.62 -.42C-.46 -.6 -.24 -.6 -.12 -.44" fill="none" stroke="#fff" strokeWidth=".13" strokeLinecap="round" opacity=".75" />
      <circle cx="-.62" cy="-.12" r=".07" fill="#fff" opacity=".7" />
      <path d="M.18 .7C.42 .5 .68 .3 .78 .08" fill="none" stroke="#6f0429" strokeWidth=".1" strokeLinecap="round" opacity=".35" />
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "lyf-play" : undefined}>
        {HEARTS.map((h, i) => (
          <g key={i} transform={`translate(${h.x} ${h.y}) rotate(${h.r})`}>
            <g className={`lyf-bob lyf-bob-${i} di`}>
              <g className={`lyf-beat lyf-beat-${i}`}>
                <g transform={`scale(${h.s})`}>
                  <Heart uid={uid} />
                </g>
              </g>
            </g>
          </g>
        ))}
        {/* Two small hearts released by the big one's beat. */}
        {[0, 1].map((i) => (
          <g key={i} transform={`translate(${HEARTS[2].x + (i ? 4 : -3)} ${HEARTS[2].y - 8})`}>
            <g className={`lyf-float lyf-float-${i}`}>
              <g transform="scale(3.2)">
                <path d={HEART} fill="#ff6f9c" />
              </g>
            </g>
          </g>
        ))}
      </g>
      <g transform="translate(166 78)">
        <path className="lyf-glint di" d="M0 -3.4C.4 -.8 .8 -.4 3.4 0C.8 .4 .4 .8 0 3.4C-.4 .8 -.8 .4 -3.4 0C-.8 -.4 -.4 -.8 0 -3.4Z" fill="#ffe3ec" />
      </g>
    </>
  );
}

export const loveYouForever: DesignSpec = { cycleMs: 1500, gapMs: 1100, front: (p) => <Front {...p} /> };
