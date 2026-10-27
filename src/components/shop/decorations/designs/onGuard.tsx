import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 On Guard!: two cutlasses crossed under the chin, one tipped up and one
 down. On hover they rise to either side of the face and fight for two
 seconds: wind-ups that ease in, strikes that accelerate into the clash,
 recoils that ease out, a quick flurry and a bind, then they drop back
 into place with a little overshoot.

 Each sword is drawn with the hand (middle of the grip) at the origin and
 the blade along +x, so a pose is just translate(hand) rotate(angle). The
 right-hand sword is the same drawing mirrored. The poses and the clash
 points are solved so both blades pass through each clash point at the
 moment of impact; see `og-sword-a` / `og-sword-b` in decorations.css.
*/

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-steel`} x1="0" y1="-7" x2="0" y2="3" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#f6f9fc" />
        <stop offset=".5" stopColor="#cfd8e2" />
        <stop offset="1" stopColor="#8c99a8" />
      </linearGradient>
      <linearGradient id={`${uid}-brass`} x1="0" y1="-7" x2="0" y2="9" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ffe9a3" />
        <stop offset=".45" stopColor="#d9a432" />
        <stop offset="1" stopColor="#8a5a12" />
      </linearGradient>
      <linearGradient id={`${uid}-grip`} x1="0" y1="-2.6" x2="0" y2="2.6" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#8a5a33" />
        <stop offset="1" stopColor="#3d2414" />
      </linearGradient>
      <radialGradient id={`${uid}-spark`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fffbe0" />
        <stop offset=".4" stopColor="#ffd45a" stopOpacity=".9" />
        <stop offset="1" stopColor="#ff8a1f" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

const BLADE = "M10 -2.4C34 -3.2 60 -5.8 79 -11.2C75 -6 64 -1.5 44 1.4C30 3 18 3.2 10 2.6Z";

function Cutlass({ uid }: { uid: string }) {
  return (
    <>
      {/* Blade, with its shadow, fuller and a bright cutting edge. */}
      <path d={BLADE} fill="#000" opacity=".28" transform="translate(1 2)" />
      <path d={BLADE} fill={`url(#${uid}-steel)`} stroke="#3a414b" strokeWidth=".7" strokeLinejoin="round" />
      <path d="M14 -.5C34 -1.3 54 -3.4 70 -7.6" fill="none" stroke="#7d8a99" strokeWidth=".8" strokeLinecap="round" opacity=".75" />
      <path d="M44 1C60 -1 70 -4.5 77.5 -9.6" fill="none" stroke="#fff" strokeWidth=".55" strokeLinecap="round" opacity=".9" />
      {/* Grip, wrapped. */}
      <rect x="-9" y="-2.5" width="15.5" height="5" rx="2" fill={`url(#${uid}-grip)`} stroke="#22140a" strokeWidth=".5" />
      <path d="M-7 -2.4L-5 2.4M-4 -2.4L-2 2.4M-1 -2.4L1 2.4M2 -2.4L4 2.4" stroke="#24150b" strokeWidth=".55" opacity=".8" />
      {/* Knuckle bow sweeping from the guard round to the pommel. */}
      <path d="M8.5 3C8 13 -9 14 -11 2.5" fill="none" stroke="#6d4610" strokeWidth="3.1" strokeLinecap="round" />
      <path d="M8.5 3C8 13 -9 14 -11 2.5" fill="none" stroke={`url(#${uid}-brass)`} strokeWidth="2.1" strokeLinecap="round" />
      <ellipse cx="8.4" cy=".3" rx="2.5" ry="6.6" fill={`url(#${uid}-brass)`} stroke="#5e3c0c" strokeWidth=".6" />
      <ellipse cx="7.8" cy="-2.2" rx=".8" ry="2.2" fill="#fff4cf" opacity=".7" />
      <circle cx="-11.4" cy=".4" r="2.7" fill={`url(#${uid}-brass)`} stroke="#5e3c0c" strokeWidth=".6" />
      <circle cx="-12.2" cy="-.5" r=".8" fill="#fff4cf" opacity=".8" />
    </>
  );
}

// Clash points, matching og-spark-0…5 in decorations.css.
const CLASHES = [
  { x: 100, y: 30, big: false }, { x: 80, y: 28, big: false }, { x: 110, y: 36, big: false },
  { x: 94, y: 30, big: false }, { x: 100, y: 26, big: true }, { x: 98, y: 30, big: true },
];

function Spark({ uid, big }: { uid: string; big: boolean }) {
  const rays = big ? 12 : 9;
  const reach = big ? 21 : 16;
  return (
    <>
      <circle r={big ? 13 : 10} fill={`url(#${uid}-spark)`} />
      <circle r={big ? 11 : 8} fill="none" stroke="#fff6cf" strokeWidth=".8" opacity=".7" />
      {Array.from({ length: rays }, (_, i) => (
        <path key={i} d={`M0 -3L1.15 ${-reach + (i % 2) * 6}L-1.15 ${-reach + (i % 2) * 6}Z`} fill={i % 3 ? "#ffe9a0" : "#fff"} transform={`rotate(${(360 / rays) * i + 9})`} />
      ))}
      <circle r="2.4" fill="#fff" />
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "og-play" : undefined}>
        <g className="og-sword og-sword-b">
          <g transform="scale(-1 1)">
            <Cutlass uid={uid} />
          </g>
        </g>
        <g className="og-sword og-sword-a">
          <Cutlass uid={uid} />
        </g>
        {CLASHES.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <g className={`og-spark og-spark-${i}`}>
              <Spark uid={uid} big={c.big} />
            </g>
          </g>
        ))}
      </g>
      {/* A glint that runs along the resting blades now and then. */}
      <g transform="translate(114 155.5)">
        <path className="og-glint di" d="M0 -3.6C.4 -.8 .8 -.4 3.6 0C.8 .4 .4 .8 0 3.6C-.4 .8 -.8 .4 -3.6 0C-.8 -.4 -.4 -.8 0 -3.6Z" fill="#fff" />
      </g>
    </>
  );
}

export const onGuard: DesignSpec = { cycleMs: 3200, gapMs: 1800, front: (p) => <Front {...p} /> };
