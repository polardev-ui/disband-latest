import type { CSSProperties } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Slurp!: your picture sat in a bowl of ramen. The broth's far half and the
 nori sheet standing at the back are drawn behind the photo, so the
 waterline crosses the picture at the bowl's centre line; the near broth,
 the toppings (a soft egg, naruto, chashu, spring onion), the chopsticks
 and the bowl itself are in front. Steam curls up both sides at rest.

 On hover the chopsticks dip, lift a tangle of noodles out of the broth,
 give them a wiggle, and drop them back with a splash.
*/

const BROTH = { cx: 100, cy: 146, rx: 61, ry: 10 };
const RIM = { rx: 66.5, ry: 12.8 };

const SPIRAL = "M0 0C.9 -.4 1.2 .7 .5 1.2C-.6 1.9 -1.9 .9 -1.6 -.4C-1.2 -2 1 -2.5 2.2 -1.3C3.4 -.1 3.2 2 2 3";

// Spring onion rings floating on the near broth: x, y, size.
const ONION: [number, number, number][] = [
  [84, 150, 2.1], [97, 153.5, 1.7], [104, 149.5, 2.2], [42, 148.4, 1.6], [156, 148.8, 1.8], [90, 155.5, 1.5], [124, 154.5, 1.4],
];

const SPLASH = [
  { dx: -10, dy: -12, r: 1.6, d: 0 },
  { dx: -4, dy: -17, r: 1.3, d: 30 },
  { dx: 4, dy: -15, r: 1.5, d: 10 },
  { dx: 11, dy: -10, r: 1.2, d: 40 },
  { dx: 15, dy: -5, r: 1, d: 60 },
];

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-broth`} cx="45%" cy="40%" r="70%">
        <stop offset="0" stopColor="#ffd38a" />
        <stop offset=".55" stopColor="#f0a94f" />
        <stop offset="1" stopColor="#c7742a" />
      </radialGradient>
      <linearGradient id={`${uid}-glaze`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#cdbda6" />
        <stop offset=".25" stopColor="#fffaf1" />
        <stop offset=".6" stopColor="#efe4d2" />
        <stop offset="1" stopColor="#b9a78e" />
      </linearGradient>
      <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8f1b20" />
        <stop offset=".3" stopColor="#e2463d" />
        <stop offset=".65" stopColor="#c62f2e" />
        <stop offset="1" stopColor="#7d151b" />
      </linearGradient>
      <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#f6d9a6" />
        <stop offset=".5" stopColor="#d9a463" />
        <stop offset="1" stopColor="#9c6a33" />
      </linearGradient>
      <linearGradient id={`${uid}-nori`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2f4a33" />
        <stop offset="1" stopColor="#101c13" />
      </linearGradient>
      <radialGradient id={`${uid}-yolk`} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#ffd36b" />
        <stop offset=".6" stopColor="#f59a1c" />
        <stop offset="1" stopColor="#c76a0e" />
      </radialGradient>
      <radialGradient id={`${uid}-chashu`} cx="45%" cy="40%" r="65%">
        <stop offset="0" stopColor="#f7c6a6" />
        <stop offset=".7" stopColor="#d98c6a" />
        <stop offset="1" stopColor="#8a4628" />
      </radialGradient>
      <linearGradient id={`${uid}-noodle`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff0b8" />
        <stop offset="1" stopColor="#e8bb5c" />
      </linearGradient>
      <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#000" stopOpacity=".5" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <clipPath id={`${uid}-near`}>
        <rect x="20" y={BROTH.cy} width="160" height="30" />
      </clipPath>
      <clipPath id={`${uid}-bowl`}>
        <path d="M33.5 146C35 168 60 184 100 184C140 184 165 168 166.5 146A66.5 12.8 0 0 1 33.5 146Z" />
      </clipPath>
    </defs>
  );
}

/** Broth with noodle loops and oil showing through, and the cream lip. */
function Broth({ uid, near }: { uid: string; near?: boolean }) {
  const { cx, cy, rx, ry } = BROTH;
  return (
    <g clipPath={near ? `url(#${uid}-near)` : undefined}>
      <ellipse cx={cx} cy={cy + 2.6} rx={RIM.rx} ry={RIM.ry} fill="#a89377" />
      <ellipse cx={cx} cy={cy} rx={RIM.rx} ry={RIM.ry} fill={`url(#${uid}-glaze)`} stroke="#6d5a43" strokeWidth="1" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#b86a24" />
      <ellipse cx={cx} cy={cy + 0.6} rx={rx - 0.8} ry={ry - 0.9} fill={`url(#${uid}-broth)`} />
      {/* Noodle loops just under the surface. */}
      <path
        d={near
          ? "M48 150C54 155 60 147 66 152C72 157 78 149 84 154M114 155C120 150 126 157 132 152C138 147 144 154 150 150"
          : "M46 143C52 139 58 146 64 141C70 137 76 143 82 139M118 139C124 143 130 137 136 142C142 146 148 140 154 144"}
        fill="none" stroke="#ffe39a" strokeWidth="2.2" strokeLinecap="round" opacity=".9"
      />
      <path
        d={near ? "M58 156C64 152 70 158 76 154M126 157C132 153 138 158 144 155" : "M56 140C62 136 68 141 74 137M128 136C134 139 140 135 146 138"}
        fill="none" stroke="#f3c66a" strokeWidth="1.8" strokeLinecap="round" opacity=".75"
      />
      {[[70, 147.5, 1.4], [110, 143, 1.1], [130, 148.5, 1.6], [58, 143, 1], [142, 145, 1.2], [92, 141.5, 1.3]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff1c4" opacity=".65" />
      ))}
      <path d={near ? "M36 147C48 157 152 157 164 147" : "M38 142C52 135 148 135 162 142"} fill="none" stroke="#fffaf0" strokeWidth="1" opacity=".8" />
    </g>
  );
}

function Nori({ uid }: { uid: string }) {
  return (
    <g transform="translate(40 146) rotate(-13)">
      <rect x="-10" y="-44" width="21" height="46" rx="1.2" fill={`url(#${uid}-nori)`} stroke="#0b130d" strokeWidth=".9" />
      <path d="M-7 -40V-2M-1 -41V-2M5 -40V-2" stroke="#4d6b4f" strokeWidth=".5" opacity=".55" />
      <path d="M-8.5 -42.5H9.5" stroke="#6b8f6c" strokeWidth=".8" opacity=".6" />
    </g>
  );
}

function Egg({ uid }: { uid: string }) {
  return (
    <g transform="translate(60 149.5) rotate(-8)">
      <ellipse cx=".6" cy="1.4" rx="11.6" ry="7.6" fill="#7a4a1c" opacity=".35" />
      <ellipse rx="11.4" ry="7.4" fill="#fffaf2" stroke="#8a7458" strokeWidth=".9" />
      <ellipse cx=".6" cy="-.2" rx="6.4" ry="4.4" fill={`url(#${uid}-yolk)`} stroke="#b05c0c" strokeWidth=".6" />
      <ellipse cx="-1.2" cy="-1.6" rx="2" ry="1.1" fill="#fff4cf" opacity=".85" />
      <path d="M-9 -3.4C-6 -6.2 -1 -7.2 3 -6.8" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".9" />
    </g>
  );
}

function Naruto() {
  return (
    <g transform="translate(117 150.8) rotate(10)">
      <ellipse cx=".5" cy="1.2" rx="8.2" ry="5.6" fill="#7a4a1c" opacity=".3" />
      <path d="M-8 0L-7.2 -2.2L-8 -3.4L-6.2 -4.2L-5.4 -6L-3.2 -5.6L-1.4 -6.6L.6 -5.8L2.6 -6.6L4.2 -5.4L6.2 -5.6L6.8 -3.8L8.4 -2.6L7.6 -.8L8.4 1L7 2.4L7.2 4.4L5 4.6L3.8 6.2L1.6 5.6L-.4 6.6L-2.2 5.4L-4.4 5.8L-5.2 4L-7.4 3.4L-7 1.6Z" fill="#fffdf8" stroke="#8a7458" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M0 0C1.2 -.5 1.6 1 .6 1.6C-.8 2.4 -2.4 1 -2 -.6C-1.5 -2.6 1.4 -3.2 2.9 -1.6C4.4 0 4 2.8 2.2 4" fill="none" stroke="#ef5f93" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

function Chashu({ uid }: { uid: string }) {
  return (
    <g transform="translate(140 149.2) rotate(6)">
      <ellipse cx=".6" cy="1.4" rx="11" ry="7.4" fill="#5a2a12" opacity=".35" />
      <ellipse rx="10.8" ry="7.2" fill="#7a3c1f" stroke="#4a210e" strokeWidth=".9" />
      <ellipse cy="-.3" rx="9" ry="5.6" fill={`url(#${uid}-chashu)`} />
      <path d="M-6 -1C-3 -3.6 2 -3.4 4 -.6C5.4 1.6 3 3.4 .2 2.6" fill="none" stroke="#fff1e6" strokeWidth="1.3" strokeLinecap="round" opacity=".85" />
      <path d="M-4.6 2.6C-2.6 3.8 -.4 4 1.6 3.6" fill="none" stroke="#a55a35" strokeWidth=".8" strokeLinecap="round" opacity=".7" />
    </g>
  );
}

function Onions() {
  return (
    <g>
      {ONION.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse rx={s} ry={s * 0.7} fill="#74c25a" stroke="#2f6d2a" strokeWidth=".55" />
          <ellipse rx={s * 0.45} ry={s * 0.3} fill="#d9f2b8" />
        </g>
      ))}
    </g>
  );
}

function Chopsticks({ uid }: { uid: string }) {
  return (
    <g className="rm-sticks">
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(${i * 4.2} ${i * 2.2})`}>
          <path d="M147.4 151.4L188.6 102.6L191.6 105L150 153.2Z" fill="#6b4320" opacity=".35" transform="translate(.8 1)" />
          <path d="M147.4 151.4L188.6 102.6L191.6 105L150 153.2Z" fill={`url(#${uid}-wood)`} stroke="#6b4320" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M178 115L187.4 103.8L190.4 106.2L181 117.4Z" fill="#b53b2f" />
        </g>
      ))}
    </g>
  );
}

function Noodles({ uid }: { uid: string }) {
  return (
    <g className="rm-noodles">
      <g className="rm-wiggle">
        {[-4.2, -1.4, 1.6, 4.6, 0.2].map((o, i) => {
          const d = `M${150 + o} 151C${146 + o} 144 ${156 + o} 139 ${151 + o * 0.8} 132C${147 + o * 0.6} 126 ${157 + o * 0.4} 123 ${156 + o * 0.25} 118`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#a8711f" strokeWidth="3.3" strokeLinecap="round" />
              <path d={d} fill="none" stroke={`url(#${uid}-noodle)`} strokeWidth="2.1" strokeLinecap="round" />
            </g>
          );
        })}
      </g>
    </g>
  );
}

function Bowl({ uid }: { uid: string }) {
  return (
    <g>
      <ellipse cx="100" cy="187" rx="44" ry="5" fill={`url(#${uid}-shadow)`} />
      <path d="M80 179H120L118.5 187.5C112 189.4 88 189.4 81.5 187.5Z" fill="#cbb89c" stroke="#6d5a43" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M33.5 146C35 168 60 184 100 184C140 184 165 168 166.5 146A66.5 12.8 0 0 1 33.5 146Z" fill={`url(#${uid}-glaze)`} stroke="#6d5a43" strokeWidth="1.1" strokeLinejoin="round" />
      <g clipPath={`url(#${uid}-bowl)`}>
        {/* The red band and its row of white spirals. */}
        <path d="M30 160C52 170 148 170 170 160L170 171C148 181 52 181 30 171Z" fill={`url(#${uid}-band)`} />
        {Array.from({ length: 11 }, (_, i) => {
          const x = 46 + i * 10.8;
          const t = (x - 100) / 66;
          const y = 166.4 + 4.6 * (1 - t * t);
          return <path key={i} d={SPIRAL} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.15)`} fill="none" stroke="#fff5e6" strokeWidth=".75" strokeLinecap="round" />;
        })}
        <path d="M36 153C58 162.5 142 162.5 164 153" fill="none" stroke="#c62f2e" strokeWidth="1.2" />
        <path d="M44 163C46 170 52 176 60 179" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".45" />
      </g>
    </g>
  );
}

function Steam() {
  return (
    <g>
      {[
        { x: 42, y: 132, s: 1, i: 0 },
        { x: 160, y: 130, s: 1.1, i: 1 },
        { x: 30, y: 136, s: 0.7, i: 2 },
        { x: 172, y: 134, s: 0.75, i: 3 },
      ].map((w) => (
        <g key={w.i} transform={`translate(${w.x} ${w.y}) scale(${w.s})`}>
          <path
            className="rm-steam di"
            style={{ "--i": w.i } as CSSProperties}
            d="M0 0C-5 -6 5 -10 0 -16C-5 -22 4 -27 1 -32"
            fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"
          />
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
      <g key={cycle} className={play ? "rm-play" : undefined}>
        <Broth uid={uid} />
        <Nori uid={uid} />
      </g>
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "rm-play" : undefined}>
        <Broth uid={uid} near />
        <Onions />
        <Egg uid={uid} />
        <Naruto />
        <Noodles uid={uid} />
        <Chashu uid={uid} />
        <Chopsticks uid={uid} />
        {SPLASH.map((s, i) => (
          <g key={i} transform="translate(150 150)">
            <circle
              className="rm-drop"
              r={s.r}
              fill="#f7b75a"
              stroke="#fff3cf"
              strokeWidth=".5"
              style={{ "--dx": `${s.dx}px`, "--dy": `${s.dy}px`, animationDelay: `calc(${1830 + s.d}ms * var(--deco-slow, 1))` } as CSSProperties}
            />
          </g>
        ))}
        <Bowl uid={uid} />
        <Steam />
      </g>
    </>
  );
}

export const slurp: DesignSpec = {
  cycleMs: 2400,
  gapMs: 1400,
  back: (p) => <Back {...p} />,
  front: (p) => <Front {...p} />,
};
