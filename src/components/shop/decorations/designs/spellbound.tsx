import type { CSSProperties } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Spellbound: a floppy indigo wizard hat worn at a jaunty angle. The far half
 of the brim sits behind the head and the near half in front, so the hat is
 really on. Gold stars and a moon are stitched on, there's a patch where it
 has been mended, a little moon charm hangs from the band and a star from
 the tip.

 On hover it crouches, hops, and at the top of the hop the tip flicks and
 lets go a trail of stars that spirals once round the picture before the hat
 lands with a squash.

 The hat is drawn in its own frame (origin at the brim's centre) and placed
 by HAT; both layers share it so the brim halves stay together mid-hop.
*/

const HAT = "translate(99 59) rotate(13)";

const BRIM = { rx: 54, ry: 12.5 };
const CONE =
  "M-24 -3C-22.5 -20 -15.5 -37 -4.5 -49C1.5 -55.5 9.5 -59.5 16.5 -59C21.5 -58.5 24 -53 22.5 -46.5C20 -36 20.5 -16 24.5 -3Z";
const FLOP =
  "M7 -57.5C13.5 -62.5 24.5 -62 31 -55C35 -50.5 37.5 -44 39.5 -36.5C34 -39.5 28 -43.5 22.5 -46C18.5 -48 14 -50 9.5 -52Z";

const star = (r: number, inner = 0.45) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    return `${i ? "L" : "M"}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`;
  }).join("") + "Z";
const SPARK = "M0 -1C.18 -.3 .3 -.18 1 0C.3 .18 .18 .3 0 1C-.18 .3 -.3 .18 -1 0C-.3 -.18 -.18 -.3 0 -1Z";

// Stars stitched on the cone: x, y, size, rotation.
const STITCHED: [number, number, number, number][] = [
  [-10, -22, 4.2, -8],
  [9, -36, 3.2, 14],
  [-1, -12, 2.4, 20],
];

// The trail: each star starts at the tip and spirals in to orbit the photo.
const TRAIL = Array.from({ length: 8 }, (_, i) => ({
  d: 560 + i * 42,
  s: 5.4 - i * 0.48,
  c: i % 3 === 1 ? "#bfe9ff" : i % 3 === 2 ? "#ffd1f0" : "#fff1a8",
}));

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-felt`} x1="0" y1="0" x2="1" y2=".25">
        <stop offset="0" stopColor="#6f58e0" />
        <stop offset=".35" stopColor="#4a35b4" />
        <stop offset="1" stopColor="#21135e" />
      </linearGradient>
      <linearGradient id={`${uid}-flop`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5d47cf" />
        <stop offset="1" stopColor="#24166a" />
      </linearGradient>
      <radialGradient id={`${uid}-brim`} cx="42%" cy="30%" r="75%">
        <stop offset="0" stopColor="#5c45cc" />
        <stop offset=".6" stopColor="#3a2995" />
        <stop offset="1" stopColor="#1d1157" />
      </radialGradient>
      <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff0a8" />
        <stop offset=".45" stopColor="#f2bf3e" />
        <stop offset="1" stopColor="#a86b12" />
      </linearGradient>
      <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#a86b12" />
        <stop offset=".3" stopColor="#ffe08a" />
        <stop offset=".55" stopColor="#e3a630" />
        <stop offset="1" stopColor="#8f5a0e" />
      </linearGradient>
      <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff6c9" stopOpacity=".95" />
        <stop offset="1" stopColor="#ffe27a" stopOpacity="0" />
      </radialGradient>
      <clipPath id={`${uid}-near`}>
        <rect x="-60" y="0" width="120" height="20" />
      </clipPath>
    </defs>
  );
}

function Brim({ uid, near }: { uid: string; near?: boolean }) {
  return (
    <g clipPath={near ? `url(#${uid}-near)` : undefined}>
      <ellipse cx="0" cy="2.8" rx={BRIM.rx} ry={BRIM.ry} fill="#140a3d" />
      <ellipse cx="0" cy="0" rx={BRIM.rx} ry={BRIM.ry} fill={`url(#${uid}-brim)`} stroke="#120838" strokeWidth="1.2" />
      {near ? (
        <>
          <path d="M-49 4.8C-30 11.6 30 11.6 49 4.8" fill="none" stroke="#8d7af0" strokeWidth="1.3" strokeLinecap="round" opacity=".55" />
          <path d="M-34 9.2C-20 12 -6 12.6 6 12.4" fill="none" stroke="#c8bcff" strokeWidth=".8" strokeLinecap="round" opacity=".4" />
        </>
      ) : (
        <path d="M-46 -5.4C-30 -11 -10 -12.4 6 -12.2" fill="none" stroke="#8d7af0" strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
      )}
    </g>
  );
}

function Cone({ uid }: { uid: string }) {
  return (
    <g>
      <path d={CONE} fill="#1a0f4a" transform="translate(1.6 1.4)" />
      <path d={CONE} fill={`url(#${uid}-felt)`} stroke="#120838" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Folds in the felt: lit ridges on the left, creases on the right. */}
      <path d="M-17 -10C-14 -24 -8 -37 1 -47" fill="none" stroke="#9887f5" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M-8 -6C-6 -18 -2 -28 4 -36" fill="none" stroke="#9887f5" strokeWidth=".9" strokeLinecap="round" opacity=".35" />
      <path d="M12 -8C11 -20 13 -32 17 -42" fill="none" stroke="#150b45" strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
      <path d="M3 -4C4 -12 6 -20 9 -26" fill="none" stroke="#150b45" strokeWidth=".9" strokeLinecap="round" opacity=".45" />
      {/* A mended patch with cross-stitches. */}
      <g transform="translate(13 -21) rotate(9)">
        <rect x="-5" y="-5.5" width="10" height="11" rx="1.2" fill="#7b5bd6" stroke="#2a186f" strokeWidth=".8" />
        <path d="M-5 -2.5H5M-5 1.5H5" stroke="#a48bf0" strokeWidth=".6" opacity=".7" />
        <path d="M-6.2 -4.2L-3.8 -3M-6.2 -3L-3.8 -4.2M-6.2 1.6L-3.8 2.8M-6.2 2.8L-3.8 1.6M3.8 -1L6.2 .2M3.8 .2L6.2 -1" stroke="#ffe08a" strokeWidth=".55" strokeLinecap="round" />
      </g>
      {/* Stitched stars and a moon, glinting at rest. */}
      {STITCHED.map(([x, y, r, rot], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <g className={`sb-twinkle sb-twinkle-${i} di`}>
            <path d={star(r)} fill={`url(#${uid}-gold)`} stroke="#7a4a0a" strokeWidth=".5" strokeLinejoin="round" />
          </g>
        </g>
      ))}
      <path d="M-15 -36.5C-17.5 -33 -16.6 -28.2 -12.8 -26.4C-15.4 -29.4 -15.2 -33.4 -12.2 -36C-13.3 -36.6 -14.2 -36.8 -15 -36.5Z" fill={`url(#${uid}-gold)`} stroke="#7a4a0a" strokeWidth=".5" />
    </g>
  );
}

function Flop({ uid }: { uid: string }) {
  return (
    <g className="sb-flop di">
      <g className="sb-flick">
        <path d={FLOP} fill="#1a0f4a" transform="translate(1.2 1.6)" />
        <path d={FLOP} fill={`url(#${uid}-flop)`} stroke="#120838" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M12 -58.5C18 -61 25 -59.5 29.5 -54.5" fill="none" stroke="#a091f7" strokeWidth="1.3" strokeLinecap="round" opacity=".55" />
        <path d="M13 -52.5C18 -50 24 -47 30 -43" fill="none" stroke="#150b45" strokeWidth="1" strokeLinecap="round" opacity=".6" />
        {/* The star dangling from the tip. */}
        <g transform="translate(39 -37)">
          <g className="sb-dangle di">
            <path d="M0 0V6.5" stroke="#d9b45a" strokeWidth=".7" />
            <circle cy="11" r="7" fill={`url(#${uid}-glow)`} className="sb-tipglow di" />
            <path d={star(4.6, 0.48)} transform="translate(0 11)" fill={`url(#${uid}-gold)`} stroke="#7a4a0a" strokeWidth=".6" strokeLinejoin="round" />
            <path d="M-1.2 9.2L-.2 8.2" stroke="#fff" strokeWidth=".8" strokeLinecap="round" opacity=".9" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Band({ uid }: { uid: string }) {
  return (
    <g>
      <path d="M-23.4 -11.5Q0 -4.5 23.4 -11.5L24.6 -3.4Q0 4.4 -24.4 -3.4Z" fill={`url(#${uid}-band)`} stroke="#6b420a" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M-22.6 -9.8Q0 -3.2 22.6 -9.8" fill="none" stroke="#fff2b8" strokeWidth=".7" opacity=".75" />
      {/* Moon charm hanging from the front of the band. */}
      <g transform="translate(-3 -1)">
        <g className="sb-charm di">
          <path d="M0 0V3.4" stroke="#d9b45a" strokeWidth=".7" />
          <path d="M1.6 4.2C-2.6 4.6 -4.2 9.8 -1.2 12.4C1.4 14.6 5.2 13.6 6.4 10.8C4.2 12.6 .6 11.6 -.2 8.8C-.8 6.8 .1 5 1.6 4.2Z" fill={`url(#${uid}-gold)`} stroke="#7a4a0a" strokeWidth=".55" strokeLinejoin="round" />
        </g>
      </g>
    </g>
  );
}

function Trail() {
  return (
    <g className="sb-trail">
      {TRAIL.map((t, i) => (
        <g key={i} className="sb-spark" style={{ animationDelay: `calc(${t.d}ms * var(--deco-slow, 1))` } as CSSProperties}>
          <path d={SPARK} transform={`scale(${t.s})`} fill={t.c} />
          <circle r={t.s * 0.22} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

function Back({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "sb-play" : undefined}>
        <g transform={HAT}>
          <g className="sb-hop">
            <Brim uid={uid} />
          </g>
        </g>
      </g>
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "sb-play" : undefined}>
        <g transform={HAT}>
          <g className="sb-hop">
            <Cone uid={uid} />
            <Flop uid={uid} />
            <Band uid={uid} />
            <Brim uid={uid} near />
          </g>
        </g>
        <g transform="translate(100 100)">
          <Trail />
        </g>
      </g>
    </>
  );
}

export const spellbound: DesignSpec = {
  cycleMs: 2200,
  gapMs: 1300,
  back: (p) => <Back {...p} />,
  front: (p) => <Front {...p} />,
};
