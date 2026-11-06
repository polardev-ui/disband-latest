import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, GLINT, Layer, Particles, Piece, rand, type Particle } from "./parts";

/*
 Sugar Rush: strawberry icing poured over the top of the card, dripping
 down in thick runs with sprinkles stuck in it. A frosted doughnut rolls in
 at the bottom left, a swirl lollipop and a wrapped sweet lean in at the
 bottom right, sprinkles tumble down and sugar sparkles here and there.

 Intro: the icing pours down and runs, the doughnut rolls in, the lollipop
 springs up and the sweet pops in after it.
*/

const f = (n: number) => Math.round(n * 100) / 100;

const SPRINKLE_COLOURS = ["#ffffff", "#ffd84d", "#5ec8ff", "#7ee0b3", "#b98cff", "#ff9f45", "#ff5c7a"];

/* ---------------------------------------------------------------- icing */

const BAND: [number, number][] = Array.from({ length: 17 }, (_, i) => [304 - i * 19.25, 10.5 + rand(i, 91) * 3.6]);
/** Roughly where the band's lower edge sits at `x` (each curve dips 1.6 below its ends). */
const bandY = (x: number) => {
  const k = BAND.findIndex(([bx]) => bx <= x);
  if (k <= 0) return BAND[0][1];
  const [x0, y0] = BAND[k - 1];
  const [x1, y1] = BAND[k];
  const t = (x0 - x) / (x0 - x1);
  return y0 + (y1 - y0) * t + 1.6 * 4 * t * (1 - t);
};
const DRIPS = [
  [11, 22, 8], [32, 12, 6], [53, 37, 9.5], [79, 17, 7], [101, 46, 10.5], [126, 14, 6.5], [147, 28, 8.5],
  [169, 10, 6], [191, 40, 9.5], [215, 19, 7.5], [237, 31, 8.5], [258, 13, 6.5], [279, 26, 8], [297, 16, 7.5],
].map(([x, len, w], i) => ({ x, len, w, i, top: f(bandY(x) - 2.2) }));
const FALLS = [{ k: 4, delay: 2.6 }, { k: 8, delay: 5.4 }];

/** A run of icing: a fillet out of the band, a neck, and a round bead at the end. */
function drip(x: number, top: number, len: number, w: number) {
  const r = w / 2;
  const b = top + len;
  const neck = b - r * 1.9;
  return [
    `M${f(x - r * 2.1)} ${f(top - 1.2)}`,
    `C${f(x - r * 1.15)} ${f(top - 0.6)} ${f(x - r * 0.98)} ${f(top + 1.4)} ${f(x - r * 0.95)} ${f(top + 4.2)}`,
    `C${f(x - r * 0.9)} ${f(top + len * 0.45)} ${f(x - r * 0.68)} ${f(neck - 2)} ${f(x - r * 0.76)} ${f(neck)}`,
    `C${f(x - r * 1.2)} ${f(b - r * 0.9)} ${f(x - r * 0.92)} ${f(b)} ${x} ${f(b)}`,
    `C${f(x + r * 0.92)} ${f(b)} ${f(x + r * 1.2)} ${f(b - r * 0.9)} ${f(x + r * 0.76)} ${f(neck)}`,
    `C${f(x + r * 0.68)} ${f(neck - 2)} ${f(x + r * 0.9)} ${f(top + len * 0.45)} ${f(x + r * 0.95)} ${f(top + 4.2)}`,
    `C${f(x + r * 0.98)} ${f(top + 1.4)} ${f(x + r * 1.15)} ${f(top - 0.6)} ${f(x + r * 2.1)} ${f(top - 1.2)}Z`,
  ].join("");
}
const BAND_PATH = `M-4 -6H304V${f(BAND[0][1])}${BAND.slice(1).map(([x, y], i) => {
  const [px] = BAND[i];
  return `Q${f((px + x) / 2)} ${f(y + 3.2)} ${f(x)} ${f(y)}`;
}).join("")}L-4 ${f(BAND[BAND.length - 1][1])}Z`;

/** A glossy line just inside the bottom of the poured band. */
const GLOSS = `M${f(BAND[1][0])} ${f(BAND[1][1] - 4)}${BAND.slice(2, -1).map(([x, y], i) => {
  const [px] = BAND[i + 1];
  return `Q${f((px + x) / 2)} ${f(y - 0.8)} ${f(x)} ${f(y - 4)}`;
}).join("")}`;

const ICING_SPRINKLES = Array.from({ length: 30 }, (_, i) => ({
  x: 4 + ((i * 11) % 30) * 9.8 + rand(i, 92) * 4,
  y: 1.5 + rand(i, 93) * 6.5,
  a: rand(i, 94) * 180,
  c: SPRINKLE_COLOURS[i % SPRINKLE_COLOURS.length],
}));

function Sprinkle({ x, y, a, c, s = 1 }: { x: number; y: number; a: number; c: string; s?: number }) {
  return (
    <g transform={`translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${s})`}>
      <rect x={-2.2} y={-0.68} width={4.4} height={1.36} rx={0.68} fill={c} />
      <path d="M-1.4 -.28H1.2" stroke="#ffffff" strokeWidth={0.32} strokeLinecap="round" opacity={c === "#ffffff" ? 0 : 0.55} />
    </g>
  );
}

function Icing({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 64" className="sgr-icing" style={{ left: 0, top: 0, width: "100%" }}>
      <g className="sgr-pour">
        {/* The underside, a shade darker, peeks out below the runs. */}
        <g transform="translate(0 1.6)" fill="#d94d8a">
          <path d={BAND_PATH} />
          {DRIPS.map((d) => (
            <g key={d.x} className="sgr-run" style={{ transformOrigin: `${d.x}px ${d.top}px`, "--d": `${300 + rand(d.i, 95) * 700}ms` } as CSSProperties}>
              <path d={drip(d.x, d.top, d.len, d.w)} />
            </g>
          ))}
        </g>
        <path d={BAND_PATH} fill={`url(#${uid}-icing)`} />
        {DRIPS.map((d) => (
          <g key={d.x} className="sgr-run" style={{ transformOrigin: `${d.x}px ${d.top}px`, "--d": `${300 + rand(d.i, 95) * 700}ms` } as CSSProperties}>
            <path d={drip(d.x, d.top, d.len, d.w)} fill={`url(#${uid}-icing)`} />
            <path d={`M${f(d.x - d.w * 0.24)} ${f(d.top + d.len - d.w * 0.95)}Q${f(d.x - d.w * 0.3)} ${f(d.top + d.len - d.w * 0.35)} ${f(d.x)} ${f(d.top + d.len - d.w * 0.2)}`} stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" fill="none" opacity={0.8} />
          </g>
        ))}
        <path d={GLOSS} stroke="#ffe3ef" strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.75} />
        {ICING_SPRINKLES.map((s, i) => <Sprinkle key={i} {...s} />)}
        {FALLS.map(({ k, delay }) => {
          const d = DRIPS[k];
          return (
            <g key={k} transform={`translate(${d.x} ${f(d.top + d.len - d.w * 0.5)})`}>
              <path className="sgr-drop" style={{ "--dd": `${delay}s` } as CSSProperties} d="M0 -2.4C-1.6 -.2 -2.6 1.6 -2.6 3C-2.6 4.6 -1.4 5.6 0 5.6C1.4 5.6 2.6 4.6 2.6 3C2.6 1.6 1.6 -.2 0 -2.4Z" fill={`url(#${uid}-icing-drop)`} />
            </g>
          );
        })}
      </g>
    </Piece>
  );
}

/* -------------------------------------------------------------- doughnut */

const ell = (cx: number, cy: number, rx: number, ry: number) => `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;

/** A wavy ring of frosting: `n` bulges round an ellipse, drooping on the outside. */
function wavy(rx: number, ry: number, n: number, amp: number, cy = 0) {
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : 1 - amp;
    const droop = Math.max(0, Math.sin(a)) * amp * 0.9 * (i % 2 === 0 ? 1 : 0);
    return [Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k + droop * ry] as [number, number];
  });
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length; i += 2) {
    const c = pts[(i + 1) % pts.length];
    const e = pts[(i + 2) % pts.length];
    d += `Q${f(c[0])} ${f(c[1])} ${f(e[0])} ${f(e[1])}`;
  }
  return d + "Z";
}

const DONUT_SPRINKLES = Array.from({ length: 18 }, (_, i) => {
  const a = rand(i, 101) * Math.PI * 2;
  const d = 0.48 + rand(i, 102) * 0.38;
  return { x: Math.cos(a) * 33 * d, y: Math.sin(a) * 24 * d - 2, a: rand(i, 103) * 180, c: SPRINKLE_COLOURS[(i + 2) % SPRINKLE_COLOURS.length] };
});

function Donut({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 120 100" className="sgr-donut" style={{ left: "-7%", bottom: "-6%", width: "39%" }}>
      <g transform="translate(58 58) rotate(-14)">
        <g className="sgr-roll">
          <g className="sgr-bob">
            <path d={ell(0, 6, 40, 29) + ell(0, 3, 11, 7.5)} fill={`url(#${uid}-dough-side)`} fillRule="evenodd" />
            <path d={ell(0, 0, 40, 29) + ell(0, -3, 11, 7.5)} fill={`url(#${uid}-dough)`} fillRule="evenodd" />
            <path d={wavy(37, 26.5, 9, 0.12) + wavy(15.5, 11, 7, 0.1, -3)} fill={`url(#${uid}-frosting)`} fillRule="evenodd" />
            <path d="M-26 -12C-20 -19 -8 -23 4 -23" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.55} />
            <path d="M16 13C22 11 27 7.5 29 4" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.35} />
            {DONUT_SPRINKLES.map((s, i) => <Sprinkle key={i} {...s} s={1.15} />)}
          </g>
        </g>
      </g>
    </Piece>
  );
}

/* -------------------------------------------------------------- lollipop */

/** An Archimedean spiral from the centre out to radius `r` in `turns` turns. */
function spiral(r: number, turns: number, start = 0) {
  const steps = Math.round(turns * 36);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const rr = t * r;
    d += `${i === 0 ? "M" : "L"}${f(Math.cos(a) * rr)} ${f(Math.sin(a) * rr)}`;
  }
  return d;
}

function Lollipop({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 110 120" className="sgr-lolly" style={{ right: "-4%", bottom: "-3%", width: "35%" }}>
      <g className="sgr-spring">
        <g className="sgr-lean">
          <path d="M86 124L61 66" stroke="#f3eee8" strokeWidth={5} strokeLinecap="round" />
          <path d="M85 124L60.2 66.4" stroke="#d8cfc6" strokeWidth={1.6} strokeLinecap="round" opacity={0.7} transform="translate(1.6 0)" />
          <g transform="translate(55 46)">
            <circle r={27} fill="#ff5fa2" />
            <g clipPath={`url(#${uid}-lolly)`}>
              <g className="sgr-swirl">
                <path d={spiral(30, 3.2)} stroke="#ffffff" strokeWidth={5.6} fill="none" strokeLinecap="round" />
                <path d={spiral(30, 3.2, Math.PI)} stroke="#ffb3d4" strokeWidth={4} fill="none" strokeLinecap="round" />
                <path d={spiral(30, 3.2, Math.PI * 0.5)} stroke="#ffd84d" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.9} />
              </g>
            </g>
            <circle r={27} fill={`url(#${uid}-lolly-shade)`} />
            <path d="M-19 -9A21 21 0 0 1 -7 -20" stroke="#ffffff" strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.85} />
            <circle cx={-20.5} cy={-2.5} r={1.6} fill="#ffffff" opacity={0.85} />
          </g>
        </g>
      </g>
      <g transform="translate(24 98) rotate(-24)">
        <g className="sgr-sweet">
          <path d="M-12 0L-21 -7.5L-19.5 0L-21 7.5Z" fill="#8ff0d4" opacity={0.9} />
          <path d="M12 0L21 -7.5L19.5 0L21 7.5Z" fill="#8ff0d4" opacity={0.9} />
          <path d="M-12 0L-19 -4.4M-12 0L-19.5 3.6M12 0L19 -4.4M12 0L19.5 3.6" stroke="#4fc9a8" strokeWidth={0.6} />
          <ellipse rx={13} ry={9.5} fill={`url(#${uid}-sweet)`} />
          <path d="M-6 -8.6C-8.6 -3 -8.6 3 -6 8.6M0 -9.5C-2.4 -3 -2.4 3 0 9.5M6 -8.6C3.6 -3 3.6 3 6 8.6" stroke="#ffffff" strokeWidth={1.6} fill="none" opacity={0.7} />
          <path d="M-8 -5C-5 -7.4 0 -8 3 -7.6" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.8} />
        </g>
      </g>
    </Piece>
  );
}

/* ---------------------------------------------------------- sprinkles */

const N_FALLING = 20;
const FALLING: Particle[] = Array.from({ length: N_FALLING }, (_, i) => ({
  x: (((i * 9) % N_FALLING) + rand(i, 111) * 0.9) * (97 / N_FALLING),
  size: 1.8 + rand(i, 112) * 1,
  dur: 7 + rand(i, 113) * 6,
  phase: rand(i, 114),
  sway: 0.3 + rand(i, 115) * 0.6,
  swayDur: 2 + rand(i, 116) * 1.5,
  spin: (rand(i, 117) > 0.5 ? 1 : -1) * (1.6 + rand(i, 118) * 2.4),
  opacity: 0.9,
}));
const SPARKLES = Array.from({ length: 9 }, (_, i) => ({
  x: 4 + rand(i, 121) * 90,
  y: 18 + rand(i, 122) * 64,
  s: 1.6 + rand(i, 123) * 1.6,
  dur: 2.6 + rand(i, 124) * 2.4,
  delay: -rand(i, 125) * 5,
}));

export function SugarRush({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        {/* One gradient down the whole pour, so runs and band are seamless. */}
        <linearGradient id={`${uid}-icing`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="58">
          <stop offset="0" stopColor="#ffbfdb" />
          <stop offset=".22" stopColor="#ff93c4" />
          <stop offset="1" stopColor="#ff5d9f" />
        </linearGradient>
        <linearGradient id={`${uid}-icing-drop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8cc0" />
          <stop offset="1" stopColor="#ff5d9f" />
        </linearGradient>
        <linearGradient id={`${uid}-dough`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8cf8e" />
          <stop offset="1" stopColor="#e5a45c" />
        </linearGradient>
        <linearGradient id={`${uid}-dough-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".3" stopColor="#d48e48" />
          <stop offset="1" stopColor="#a8632c" />
        </linearGradient>
        <linearGradient id={`${uid}-frosting`} x1="0" y1="0" x2=".4" y2="1">
          <stop offset="0" stopColor="#ffb0d3" />
          <stop offset=".55" stopColor="#ff7fb8" />
          <stop offset="1" stopColor="#f45d9f" />
        </linearGradient>
        <clipPath id={`${uid}-lolly`}>
          <circle r={26.4} />
        </clipPath>
        <radialGradient id={`${uid}-lolly-shade`} cx=".35" cy=".3" r=".8">
          <stop offset=".55" stopColor="#6d1745" stopOpacity="0" />
          <stop offset="1" stopColor="#6d1745" stopOpacity=".35" />
        </radialGradient>
        <radialGradient id={`${uid}-sweet`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#c8fff0" />
          <stop offset=".6" stopColor="#62dcb9" />
          <stop offset="1" stopColor="#2fae8c" />
        </radialGradient>
      </Defs>
      <Donut uid={uid} />
      <Lollipop uid={uid} />
      <Icing uid={uid} />
      <Layer className="sgr-air">
        <Particles
          items={FALLING}
          render={(i) => {
            const c = SPRINKLE_COLOURS[(i * 3) % SPRINKLE_COLOURS.length];
            return (
              <svg viewBox="-5 -5 10 10">
                <rect x={-4.2} y={-1.25} width={8.4} height={2.5} rx={1.25} fill={c} />
                <path d="M-2.8 -.5H2.4" stroke="#ffffff" strokeWidth={0.6} strokeLinecap="round" opacity={c === "#ffffff" ? 0 : 0.5} />
              </svg>
            );
          }}
        />
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="sgr-sparkle"
            style={{ left: `${f(s.x)}%`, top: `${f(s.y)}%`, width: `${f(s.s)}%`, "--tw": `${f(s.dur)}s`, "--td": `${f(s.delay)}s` } as CSSProperties}
          >
            <svg viewBox="-1 -1 2 2">
              <path d={GLINT} fill="#fff4fa" />
            </svg>
          </span>
        ))}
      </Layer>
    </>
  );
}
