import type { CSSProperties } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 On Repeat: big mint over-ear headphones. The band arcs over the top of the
 picture with a stitched cream cushion resting on the head, silver sliders
 drop to the cups, and a coiled cable hangs from the left one. A little
 equaliser on the right cup bounces at rest.

 On hover the track drops: four beats where both cups pump and the band
 bobs, sound rings pulse off the cups and notes float up out of them. It
 loops for as long as the pointer stays.
*/

const f = (n: number) => Math.round(n * 100) / 100;
const BAND_C = { x: 100, y: 108 };

function arc(r: number, from: number, to: number) {
  const p = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${f(BAND_C.x + r * Math.cos(a))} ${f(BAND_C.y + r * Math.sin(a))}`;
  };
  return `M${p(from)}A${r} ${r} 0 0 1 ${p(to)}`;
}

/** Closed ring segment between two radii, for the cushion. */
function ringSegment(r1: number, r2: number, from: number, to: number) {
  const p = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${f(BAND_C.x + r * Math.cos(a))} ${f(BAND_C.y + r * Math.sin(a))}`;
  };
  return `M${p(r2, from)}A${r2} ${r2} 0 0 1 ${p(r2, to)}A${(r2 - r1) / 2} ${(r2 - r1) / 2} 0 0 1 ${p(r1, to)}A${r1} ${r1} 0 0 0 ${p(r1, from)}A${(r2 - r1) / 2} ${(r2 - r1) / 2} 0 0 1 ${p(r2, from)}Z`;
}

/** A coiled cord from (x0,y0) to (x1,y1): loops around a straight run. */
function coil(x0: number, y0: number, x1: number, y1: number, turns: number, radius: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  const pts: string[] = [];
  const n = turns * 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ph = t * turns * Math.PI * 2;
    // Taper the loops in at both ends so the coil meets the plain cable.
    const env = Math.min(1, t * 6, (1 - t) * 6);
    const along = Math.cos(ph) * radius * 0.55 * env;
    const across = Math.sin(ph) * radius * env;
    pts.push(`${f(x0 + dx * t + tx * along + nx * across)} ${f(y0 + dy * t + ty * along + ny * across)}`);
  }
  return `M${pts.join("L")}`;
}

const CORD = coil(31, 140, 20, 176, 9, 3.6);

// Note glyphs, drawn about their head centre.
const EIGHTH = "M0 0m-3.4 0a3.4 2.5 -22 1 0 6.8 0a3.4 2.5 -22 1 0 -6.8 0ZM2.6 -1V-15.5C5.5 -14 8.6 -12.2 8.4 -8.4C8.2 -10.8 5.6 -11.8 4.4 -12V-1Z";
const BEAMED = "M0 0m-3.2 0a3.2 2.4 -22 1 0 6.4 0a3.2 2.4 -22 1 0 -6.4 0ZM11 -3m-3.2 0a3.2 2.4 -22 1 0 6.4 0a3.2 2.4 -22 1 0 -6.4 0ZM2.3 -1V-15L13.6 -18V-4H12.1V-14.8L3.9 -12.6V-1Z";

const NOTES = [
  { x: 26, y: 100, glyph: EIGHTH, s: 1, dx: -12, dy: -40, r: -16, d: 0, fill: "#fff4dc" },
  { x: 168, y: 98, glyph: BEAMED, s: 0.9, dx: 10, dy: -44, r: 14, d: 320, fill: "#9ff3e2" },
  { x: 22, y: 122, glyph: BEAMED, s: 0.82, dx: -14, dy: -32, r: -10, d: 640, fill: "#9ff3e2" },
  { x: 174, y: 120, glyph: EIGHTH, s: 0.95, dx: 14, dy: -38, r: 18, d: 900, fill: "#fff4dc" },
];

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-shell`} cx="35%" cy="28%" r="80%">
        <stop offset="0" stopColor="#a8fbe9" />
        <stop offset=".35" stopColor="#3fd8bd" />
        <stop offset=".8" stopColor="#139a8a" />
        <stop offset="1" stopColor="#0b6a60" />
      </radialGradient>
      <linearGradient id={`${uid}-cushion`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d9c3a4" />
        <stop offset=".45" stopColor="#fff5e4" />
        <stop offset="1" stopColor="#c9ad88" />
      </linearGradient>
      <linearGradient id={`${uid}-pad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff7ea" />
        <stop offset="1" stopColor="#d6bc97" />
      </linearGradient>
      <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7e8794" />
        <stop offset=".35" stopColor="#f2f5f8" />
        <stop offset=".6" stopColor="#aeb6c1" />
        <stop offset="1" stopColor="#5d6672" />
      </linearGradient>
      <radialGradient id={`${uid}-cap`} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#f4fffc" />
        <stop offset=".5" stopColor="#bfe9e0" />
        <stop offset="1" stopColor="#5fa69a" />
      </radialGradient>
    </defs>
  );
}

function Cup({ uid, side }: { uid: string; side: "l" | "r" }) {
  // Drawn as the left cup; the right one is mirrored about x = 100.
  return (
    <g transform={side === "r" ? "translate(200 0) scale(-1 1)" : undefined}>
      {/* Slider and fork. */}
      <rect x="33.5" y="80" width="7" height="17" rx="2.4" fill={`url(#${uid}-steel)`} stroke="#2f343c" strokeWidth=".9" />
      <path d="M37 83.5V93.5" stroke="#3a4049" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M24.5 104C24.5 95 30 91 37 91C44 91 49.5 95 49.5 104" fill="none" stroke="#2f343c" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M24.5 104C24.5 95 30 91 37 91C44 91 49.5 95 49.5 104" fill="none" stroke={`url(#${uid}-steel)`} strokeWidth="2.8" strokeLinecap="round" />
      {/* Shell: the outer face of the cup, then its rim. */}
      <ellipse cx="35.5" cy="116" rx="14.5" ry="23" fill="#0a4f48" transform="translate(1.2 2)" />
      <ellipse cx="35.5" cy="116" rx="14.5" ry="23" fill={`url(#${uid}-shell)`} stroke="#073f39" strokeWidth="1.3" />
      <path d="M26.5 101C29 96.5 33 94.4 37 94.6" fill="none" stroke="#eafffa" strokeWidth="1.8" strokeLinecap="round" opacity=".75" />
      <path d="M24 127C26 134 30 137.6 35 138.4" fill="none" stroke="#063a35" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
      {/* Cap on the outer face. */}
      <ellipse cx="33" cy="116" rx="7.2" ry="12.5" fill={`url(#${uid}-cap)`} stroke="#0b5a52" strokeWidth=".9" />
      <ellipse cx="33" cy="116" rx="4.4" ry="8.2" fill="none" stroke="#0b5a52" strokeWidth=".7" opacity=".55" />
      <path d="M30.5 108.5C31.2 106.6 32.4 105.6 33.8 105.6" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".9" />
      {/* Cushion pressed against the side of the head. */}
      <ellipse cx="48.6" cy="116" rx="8" ry="21.6" fill="#8d7556" transform="translate(.6 1.4)" />
      <ellipse cx="48.6" cy="116" rx="8" ry="21.6" fill={`url(#${uid}-cushion)`} stroke="#6e5638" strokeWidth="1" />
      <ellipse cx="49.4" cy="116" rx="4.4" ry="17" fill="none" stroke="#b39674" strokeWidth=".8" opacity=".7" />
      <path d="M46 99.5C47.6 97.6 49.6 97 51.2 97.6" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".8" />
    </g>
  );
}

function Equaliser() {
  return (
    <g transform="translate(163.2 117.5)">
      {[-3, 0, 3].map((x, i) => (
        <rect key={i} className={`hp-eq hp-eq-${i} di`} x={x - 0.9} y="-5" width="1.8" height="10" rx=".9" fill="#0b5a52" />
      ))}
    </g>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "hp-play" : undefined}>
        {/* Coiled cable from the left cup, under everything else. */}
        <g className="hp-cord">
          <path d="M33 137C32.4 138.4 31.6 139.4 31 140" fill="none" stroke="#1f2228" strokeWidth="1.8" strokeLinecap="round" />
          <path d={CORD} fill="none" stroke="#1f2228" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={CORD} fill="none" stroke="#5b616c" strokeWidth=".7" strokeLinejoin="round" strokeLinecap="round" opacity=".8" transform="translate(-.3 -.4)" />
          <path d="M20 176C19 180 18 182.5 17.4 184.5" fill="none" stroke="#1f2228" strokeWidth="1.8" strokeLinecap="round" />
          <g transform="translate(17 186) rotate(14)">
            <rect x="-2.6" y="-2" width="5.2" height="8" rx="1.4" fill="#2a2e35" stroke="#111" strokeWidth=".6" />
            <rect x="-1" y="6" width="2" height="6" rx=".8" fill={`url(#${uid}-steel)`} />
            <path d="M-1 8.2H1M-1 10H1" stroke="#3a4049" strokeWidth=".5" />
          </g>
        </g>
        {/* Sound rings, out past each cup. */}
        {[0, 1].map((side) => (
          <g key={side} transform={side ? "translate(200 0) scale(-1 1)" : undefined}>
            {[0, 1].map((i) => (
              <path key={i} className={`hp-wave hp-wave-${i}`} d="M17 98C9 106 9 126 17 134" fill="none" stroke="#7ff0d9" strokeWidth="2" strokeLinecap="round" />
            ))}
          </g>
        ))}
        <g className="hp-band">
          {/* The band, then the stitched cushion under its crown. */}
          <path d={arc(64, 199, 341)} fill="none" stroke="#17191e" strokeWidth="7.6" strokeLinecap="round" />
          <path d={arc(64, 199, 341)} fill="none" stroke="#2c3038" strokeWidth="5.6" strokeLinecap="round" />
          <path d={arc(65.6, 214, 326)} fill="none" stroke="#6b7380" strokeWidth="1.1" strokeLinecap="round" opacity=".8" />
          <path d={ringSegment(53.6, 61.4, 231, 309)} fill="#7c6446" transform="translate(0 1.2)" />
          <path d={ringSegment(53.6, 61.4, 231, 309)} fill={`url(#${uid}-pad)`} stroke="#6e5638" strokeWidth="1" strokeLinejoin="round" />
          <path d={arc(57.5, 236, 304)} fill="none" stroke="#a88b66" strokeWidth=".7" strokeDasharray="1.6 1.4" />
          <path d={arc(60.2, 242, 292)} fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".7" />
        </g>
        <g className="hp-cup hp-cup-l">
          <Cup uid={uid} side="l" />
        </g>
        <g className="hp-cup hp-cup-r">
          <Cup uid={uid} side="r" />
          <Equaliser />
        </g>
        {NOTES.map((n, i) => (
          <g key={i} transform={`translate(${n.x} ${n.y})`}>
            <g
              className="hp-note"
              style={{
                "--dx": `${n.dx}px`, "--dy": `${n.dy}px`, "--r": `${n.r}deg`,
                animationDelay: `calc(${n.d}ms * var(--deco-slow, 1))`,
              } as CSSProperties}
            >
              <path d={n.glyph} transform={`scale(${n.s})`} fill={n.fill} stroke="#0d2b28" strokeWidth={1.1 / n.s} strokeLinejoin="round" paintOrder="stroke" />
            </g>
          </g>
        ))}
      </g>
    </>
  );
}

export const onRepeat: DesignSpec = { cycleMs: 1600, gapMs: 0, front: (p) => <Front {...p} /> };
