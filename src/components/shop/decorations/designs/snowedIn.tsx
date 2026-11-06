import type { CSSProperties } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Snowed In: the picture sealed inside a snow globe. A glass sphere (r 57)
 rings the photo, with a little snowdrift and two pines at the bottom of the
 scene, on a red lacquered base with brass trim. At rest a few flakes drift
 down inside the glass.

 On hover someone picks it up and shakes it: the globe rocks about the
 photo's centre (so the glass always stays round the face) and the snow
 bursts up off the drift, swirls, and settles again.
*/

const C = 100;
const R = 57;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};
const f = (n: number) => Math.round(n * 100) / 100;

/** A crescent hugging the inside of the glass, tapered at both ends. */
function crescent(from: number, to: number, outer: number, thickness: number) {
  const steps = 18;
  const outside: string[] = [];
  const inside: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = from + (to - from) * t;
    const w = thickness * Math.sin(Math.PI * t) ** 0.8;
    const [ox, oy] = polar(deg, outer);
    const [ix, iy] = polar(deg, outer - w);
    outside.push(`${f(ox)} ${f(oy)}`);
    inside.unshift(`${f(ix)} ${f(iy)}`);
  }
  return `M${outside.join("L")}L${inside.join("L")}Z`;
}

const HIGHLIGHT = crescent(198, 272, 55, 7.5);
const HIGHLIGHT_SOFT = crescent(186, 292, 55.5, 12);
const LOWLIGHT = crescent(22, 74, 55.5, 4.2);

// Resting flakes inside the glass: x, y, radius.
const FLAKES: [number, number, number][] = [
  [62, 70, 1.5], [78, 52, 1.1], [118, 56, 1.4], [138, 74, 1.2], [143, 104, 1.6],
  [56, 104, 1.2], [66, 88, 0.9], [134, 90, 1], [100, 50.5, 0.8],
  [57, 122, 1.1], [146, 122, 1.3],
];

// Snow kicked up by the shake: start x on the drift, then where it is at
// the top of the burst, mid-swirl, and where it lands.
const BURST: { x: number; p1: [number, number]; p2: [number, number]; p3: [number, number]; r: number; d: number }[] = [
  { x: 70, p1: [-8, -62], p2: [14, -50], p3: [6, -4], r: 1.6, d: 0 },
  { x: 78, p1: [10, -78], p2: [30, -58], p3: [22, -6], r: 1.2, d: 40 },
  { x: 86, p1: [-18, -70], p2: [-30, -40], p3: [-14, -2], r: 1.4, d: 20 },
  { x: 92, p1: [6, -86], p2: [-12, -62], p3: [-2, -6], r: 1.1, d: 60 },
  { x: 100, p1: [22, -80], p2: [36, -44], p3: [18, -4], r: 1.7, d: 10 },
  { x: 106, p1: [-26, -74], p2: [-10, -52], p3: [-20, -6], r: 1.2, d: 50 },
  { x: 112, p1: [14, -66], p2: [-6, -36], p3: [10, -2], r: 1.4, d: 30 },
  { x: 120, p1: [-4, -84], p2: [18, -62], p3: [6, -8], r: 1, d: 70 },
  { x: 128, p1: [-20, -60], p2: [-34, -34], p3: [-22, -4], r: 1.5, d: 0 },
  { x: 74, p1: [30, -54], p2: [44, -30], p3: [34, -2], r: 1, d: 90 },
  { x: 96, p1: [-34, -50], p2: [-44, -22], p3: [-30, -2], r: 1.3, d: 80 },
  { x: 116, p1: [26, -46], p2: [12, -20], p3: [20, 0], r: 1.1, d: 100 },
  { x: 84, p1: [40, -90], p2: [52, -70], p3: [40, -10], r: 0.9, d: 120 },
  { x: 110, p1: [-48, -82], p2: [-56, -56], p3: [-44, -8], r: 1, d: 110 },
];

/** Six-armed crystal for the larger flakes, unit radius. */
const CRYSTAL = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  const x = Math.cos(a);
  const y = Math.sin(a);
  const bx = Math.cos(a) * 0.55;
  const by = Math.sin(a) * 0.55;
  const s = (d: number) => [Math.cos(a + d) * 0.32, Math.sin(a + d) * 0.32];
  const [l1, l2] = s(0.55);
  const [r1, r2] = s(-0.55);
  return `M0 0L${f(x)} ${f(y)}M${f(bx)} ${f(by)}L${f(bx + l1)} ${f(by + l2)}M${f(bx)} ${f(by)}L${f(bx + r1)} ${f(by + r2)}`;
}).join("");

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <clipPath id={`${uid}-glass`}>
        <circle cx={C} cy={C} r={R - 0.6} />
      </clipPath>
      <radialGradient id={`${uid}-tint`} cx="38%" cy="30%" r="75%">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
        <stop offset=".72" stopColor="#bfe2ff" stopOpacity=".05" />
        <stop offset="1" stopColor="#7fb4e6" stopOpacity=".42" />
      </radialGradient>
      <linearGradient id={`${uid}-hl`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
        <stop offset="1" stopColor="#ffffff" stopOpacity=".35" />
      </linearGradient>
      <linearGradient id={`${uid}-snow`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".55" stopColor="#e3f0fb" />
        <stop offset="1" stopColor="#a9c6e3" />
      </linearGradient>
      <linearGradient id={`${uid}-lacquer`} x1="0" y1="0" x2="1" y2=".35">
        <stop offset="0" stopColor="#c8202d" />
        <stop offset=".22" stopColor="#ee4b4b" />
        <stop offset=".4" stopColor="#c11e2b" />
        <stop offset="1" stopColor="#6d0d18" />
      </linearGradient>
      <linearGradient id={`${uid}-brass`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8a5a17" />
        <stop offset=".2" stopColor="#f6d27a" />
        <stop offset=".45" stopColor="#c99631" />
        <stop offset=".75" stopColor="#ffe6a3" />
        <stop offset="1" stopColor="#8a5a17" />
      </linearGradient>
      <linearGradient id={`${uid}-plaque`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe9ad" />
        <stop offset=".5" stopColor="#d9a845" />
        <stop offset="1" stopColor="#9d6c1e" />
      </linearGradient>
      <linearGradient id={`${uid}-pine`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2e7a58" />
        <stop offset="1" stopColor="#174a37" />
      </linearGradient>
      <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#000" stopOpacity=".5" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** A little snowy pine, base centre at the origin, `h` tall. */
function Pine({ uid, h }: { uid: string; h: number }) {
  const s = h / 30;
  return (
    <g transform={`scale(${s})`}>
      <rect x="-1.4" y="-3" width="2.8" height="4" rx=".6" fill="#5b3420" />
      <path d="M0 -30L-6 -19.5H-3.6L-9 -10.5H-5.6L-11.5 -2H11.5L5.6 -10.5H9L3.6 -19.5H6Z" fill={`url(#${uid}-pine)`} stroke="#0f3325" strokeWidth=".8" strokeLinejoin="round" />
      {/* Snow resting on each tier. */}
      <path d="M0 -30L-3.4 -24C-1.8 -23 -.8 -24.4 0 -23.2C.9 -24.4 2 -23 3.4 -24Z" fill="#fff" />
      <path d="M-5.9 -19.6C-4.2 -18 -2.6 -19.8 -1 -18.4C.6 -19.9 2.6 -18 4.4 -19.4L2.8 -21.4H-3.4Z" fill="#f4faff" />
      <path d="M-8.9 -10.6C-6.6 -8.8 -4.6 -10.8 -2.4 -9.2C-.2 -10.9 2.4 -8.8 4.8 -10.4C6 -9.6 7.4 -9.8 8.9 -10.6L6.6 -12.4H-6.8Z" fill="#f4faff" />
      <path d="M-11.4 -2.1C-8.6 -.4 -5.8 -2.6 -3 -1C-.2 -2.7 3 -.6 6 -2.2C8 -1 9.8 -1.4 11.4 -2.1L9 -3.8H-9Z" fill="#fff" />
      <path d="M-2 -26.4L-5.4 -20.5M-4 -16.4L-7.6 -11M-6 -7.6L-9.8 -2.6" stroke="#5fb08a" strokeWidth=".7" strokeLinecap="round" opacity=".55" />
    </g>
  );
}

function Scene({ uid }: { uid: string }) {
  return (
    <g clipPath={`url(#${uid}-glass)`}>
      {/* Glass tint, strongest at the rim, then the scene inside. */}
      <circle cx={C} cy={C} r={R} fill={`url(#${uid}-tint)`} />
      <g transform="translate(63 140.5)"><Pine uid={uid} h={27} /></g>
      <g transform="translate(139.5 139.5)"><Pine uid={uid} h={19} /></g>
      <path
        d="M38 141C48 137.5 56 139.6 64 138.6C74 137.2 82 135.4 92 137.8C102 140 110 136.4 120 136.6C130 136.8 136 139.4 146 137.4C152 136.2 158 137 162 138V162H38Z"
        fill={`url(#${uid}-snow)`}
      />
      <path d="M44 140C54 137.6 62 139.6 70 138.4M94 138.6C102 140.4 110 137.4 118 137.6M128 138.2C136 139.6 142 138.4 150 137.6" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".9" />
      <path d="M52 146C66 143.6 80 145.8 94 144.4M108 145.6C122 143.8 136 146 150 144" fill="none" stroke="#9dbbd9" strokeWidth=".8" strokeLinecap="round" opacity=".55" />
      <ellipse cx="66" cy="140.6" rx="9" ry="1.6" fill="#8fb1d4" opacity=".55" />
      <ellipse cx="142" cy="139.6" rx="6.5" ry="1.3" fill="#8fb1d4" opacity=".55" />
      {[[80, 140.2], [104, 141.4], [122, 139.8], [90, 143.6]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 1.6}L${x + 0.4} ${y - 0.4}L${x + 1.6} ${y}L${x + 0.4} ${y + 0.4}L${x} ${y + 1.6}L${x - 0.4} ${y + 0.4}L${x - 1.6} ${y}L${x - 0.4} ${y - 0.4}Z`} fill="#fff" className="sg-sparkle di" style={{ "--i": i } as CSSProperties} />
      ))}
      {/* Resting flakes, drifting. */}
      {FLAKES.map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="sg-fall di" style={{ "--i": i } as CSSProperties}>
            {r >= 1.4 ? (
              <path d={CRYSTAL} transform={`scale(${r * 1.5})`} stroke="#fff" strokeWidth={0.42 / r} strokeLinecap="round" fill="none" />
            ) : (
              <circle r={r} fill="#fff" opacity=".92" />
            )}
          </g>
        </g>
      ))}
    </g>
  );
}

function Burst({ uid }: { uid: string }) {
  return (
    <g clipPath={`url(#${uid}-glass)`}>
      {BURST.map((b, i) => (
        <g key={i} transform={`translate(${b.x} 139)`}>
          <circle
            className="sg-burst"
            r={b.r}
            fill="#fff"
            style={{
              "--x1": `${b.p1[0]}px`, "--y1": `${b.p1[1]}px`,
              "--x2": `${b.p2[0]}px`, "--y2": `${b.p2[1]}px`,
              "--x3": `${b.p3[0]}px`, "--y3": `${b.p3[1]}px`,
              animationDelay: `calc(${b.d}ms * var(--deco-slow, 1))`,
            } as CSSProperties}
          />
        </g>
      ))}
    </g>
  );
}

function Glass({ uid }: { uid: string }) {
  return (
    <g>
      <circle cx={C} cy={C} r={R - 0.2} fill="none" stroke="#4d7fae" strokeWidth="1.2" opacity=".45" />
      <circle cx={C} cy={C} r={R} fill="none" stroke="#eaf7ff" strokeWidth="1.5" opacity=".9" />
      <circle cx={C} cy={C} r={50.4} fill="none" stroke="#dff1ff" strokeWidth=".7" opacity=".35" />
      <path d={HIGHLIGHT_SOFT} fill="#fff" opacity=".18" />
      <path className="sg-gleam" d={HIGHLIGHT} fill={`url(#${uid}-hl)`} opacity=".85" />
      <path d={LOWLIGHT} fill="#fff" opacity=".35" />
      {/* The window-shaped glint glass always has. */}
      <rect x="61.5" y="66" width="7" height="4.2" rx="1.6" transform="rotate(-38 65 68)" fill="#fff" opacity=".9" />
      <circle cx="72.5" cy="58.5" r="1.4" fill="#fff" opacity=".85" />
    </g>
  );
}

function Base({ uid }: { uid: string }) {
  return (
    <g>
      <ellipse cx={C} cy="185" rx="58" ry="6" fill={`url(#${uid}-shadow)`} />
      {/* Wind-up key: it turns while the globe is being shaken. */}
      <g transform="translate(149 166)">
        <rect x="0" y="-1.6" width="11" height="3.2" rx="1" fill={`url(#${uid}-brass)`} stroke="#5a3a0c" strokeWidth=".8" />
        <g transform="translate(11.5 0)">
          <g className="sg-key">
            <path d="M0 0C1 -6.5 4 -9 7.2 -8.2C10.6 -7.3 10.4 -2.6 6.4 -1.2C4.4 -.5 2 -.4 0 0C2 .4 4.4 .5 6.4 1.2C10.4 2.6 10.6 7.3 7.2 8.2C4 9 1 6.5 0 0Z" fill={`url(#${uid}-plaque)`} stroke="#5a3a0c" strokeWidth=".9" strokeLinejoin="round" />
            <path d="M3 -3.4C3.6 -5.2 5 -6 6.6 -5.6M3 3.4C3.6 5.2 5 6 6.6 5.6" fill="none" stroke="#fff3c4" strokeWidth=".8" strokeLinecap="round" opacity=".8" />
            <circle r="1.6" fill="#c99631" stroke="#5a3a0c" strokeWidth=".7" />
          </g>
        </g>
      </g>
      {/* Plinth: concave sides flaring to a rounded foot. */}
      <path d="M59.5 151C58.5 162 53.5 170 46.5 176C60 184.5 140 184.5 153.5 176C146.5 170 141.5 162 140.5 151Z" fill={`url(#${uid}-lacquer)`} stroke="#3e0710" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M64 156C63 164 59 171 54 176" fill="none" stroke="#ffb2a8" strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
      <path d="M135 157C136.5 164 140 170 145 175" fill="none" stroke="#3e0710" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
      {/* Brass foot band. */}
      <path d="M45.5 174.5C59.5 183 140.5 183 154.5 174.5L155.5 177.6C141.5 186.6 58.5 186.6 44.5 177.6Z" fill={`url(#${uid}-brass)`} stroke="#5a3a0c" strokeWidth=".9" strokeLinejoin="round" />
      {/* Brass collar the glass sits in. */}
      <path d="M61.5 144.6C61.5 151.4 138.5 151.4 138.5 144.6L140.8 151.4C140.8 158.6 59.2 158.6 59.2 151.4Z" fill={`url(#${uid}-brass)`} stroke="#5a3a0c" strokeWidth="1" strokeLinejoin="round" />
      <path d="M62 146.2C70 150.6 130 150.6 138 146.2" fill="none" stroke="#fff4cf" strokeWidth=".9" opacity=".7" />
      <path d="M60.5 154.2C72 158.4 128 158.4 139.5 154.2" fill="none" stroke="#5a3a0c" strokeWidth=".8" opacity=".55" />
      {/* Plaque with a tiny engraved flake. */}
      <rect x="85" y="162.5" width="30" height="10" rx="2.6" fill={`url(#${uid}-plaque)`} stroke="#5a3a0c" strokeWidth=".9" />
      <path d="M87 164.2H113" stroke="#fff6d4" strokeWidth=".7" strokeLinecap="round" opacity=".8" />
      <path d={CRYSTAL} transform="translate(100 167.6) scale(3.1)" stroke="#7a4f12" strokeWidth=".26" strokeLinecap="round" fill="none" />
    </g>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "sg-play" : undefined}>
        <g className="sg-rock">
          <Scene uid={uid} />
          <Burst uid={uid} />
          <Glass uid={uid} />
          <Base uid={uid} />
        </g>
      </g>
    </>
  );
}

export const snowedIn: DesignSpec = { cycleMs: 2600, gapMs: 1500, front: (p) => <Front {...p} /> };
