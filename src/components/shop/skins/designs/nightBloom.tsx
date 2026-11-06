import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, Layer, Particles, Piece, Wander, limb, rand, type P, type Particle } from "./parts";

/*
 Night Bloom: yozakura, cherry blossom after dark. A branch in full flower
 reaches in over the top of the card with two paper lanterns hanging from
 it, a full moon sits behind, and a second sprig comes up from the bottom
 corner. Petals fall and tumble; fireflies wander the lower half.

 Intro: the moon rises, the branch reaches in, the blossoms open in a wave
 along it, and the lanterns are lowered on their cords and light.
*/

const scale = (d: string, s: number) => d.replace(/-?\d*\.?\d+/g, (n) => String(Math.round(Number(n) * s * 100) / 100));

/** One cherry petal, notched at the tip, base at the origin, one unit long. */
const PETAL = "M0 0C-.36 -.1 -.6 -.5 -.52 -.82C-.46 -1.02 -.24 -1.07 -.11 -.96L0 -.86L.11 -.96C.24 -1.07 .46 -1.02 .52 -.82C.6 -.5 .36 -.1 0 0Z";
/** A loose petal: longer than it is wide, with the notch off to one side. */
const FALLING = "M0 5C-3.2 3.2 -4.6 -1.4 -3.4 -4.6C-2.6 -6.6 -1 -7.2 -.3 -6.2L.4 -5.4L1.3 -6.4C2.6 -7.2 4.2 -6 4.3 -3.6C4.4 .2 2.6 3.6 0 5Z";
const BUD = "M0 0C-1.2 -1 -2.6 -3.4 -2.2 -5.6C-1.8 -7.4 1.8 -7.4 2.2 -5.6C2.6 -3.4 1.2 -1 0 0Z";
const SEPAL = "M0 .7C-1.5 -.1 -2.1 -1.4 -1.9 -2.3C-1 -1.7 -.4 -1.3 0 -1.3C.4 -1.3 1 -1.7 1.9 -2.3C2.1 -1.4 1.5 -.1 0 .7Z";
const LEAF = "M0 0C2 -2 6 -3.4 11 -2.4C8 1 4 2.2 0 0Z";

type Bloom = [x: number, y: number, r: number, rot: number, tilt: number];
type Bud = [x: number, y: number, rot: number];

/** Five petals as one path, rotated into place, so one radial gradient shades the flower. */
const FLOWER = (() => {
  const pts = PETAL.match(/-?\d*\.?\d+/g)!.map(Number);
  return [0, 72, 144, 216, 288].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let k = 0;
    return PETAL.replace(/-?\d*\.?\d+ -?\d*\.?\d+/g, () => {
      const x = pts[k++];
      const y = pts[k++];
      return `${(x * c - y * s).toFixed(3)} ${(x * s + y * c).toFixed(3)}`;
    });
  }).join("");
})();

function stamens(r: number) {
  let lines = "";
  let dots = "";
  for (let k = 0; k < 7; k++) {
    const a = ((k * 51.4 + 20) * Math.PI) / 180;
    const len = r * (0.4 + (k % 3) * 0.06);
    const ex = (Math.cos(a) * len).toFixed(2);
    const ey = (Math.sin(a) * len).toFixed(2);
    const d = (r * 0.07).toFixed(2);
    lines += `M0 0L${ex} ${ey}`;
    dots += `M${ex} ${ey}m-${d} 0a${d} ${d} 0 1 0 ${Number(d) * 2} 0a${d} ${d} 0 1 0 -${Number(d) * 2} 0`;
  }
  return { lines, dots };
}

function Blossom({ uid, b: [x, y, r, rot, tilt], delay, back }: { uid: string; b: Bloom; delay: number; back?: boolean }) {
  const st = stamens(r);
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(0)}) scale(1 ${tilt})`}>
      <g className="nbl-bloom" style={{ "--d": `${delay.toFixed(0)}ms` } as CSSProperties}>
        <path d={scale(FLOWER, r)} fill={`url(#${uid}-${back ? "flower-back" : "flower"})`} stroke={back ? "#cf6d91" : "#e8879f"} strokeWidth={0.3} strokeOpacity={0.75} />
        <circle r={r * 0.22} fill={back ? "#b83e68" : "#d24f7a"} />
        <path d={st.lines} stroke={back ? "#e7a3ba" : "#f8c8d6"} strokeWidth={0.32} />
        <path d={st.dots} fill={back ? "#e9bf72" : "#ffd77f"} />
      </g>
    </g>
  );
}

/** Blossoms scattered about a point; the smallest (furthest back) come first and are shaded. */
function cluster(cx: number, cy: number, n: number, spread: number, rMin: number, rMax: number, seed: number) {
  const out = Array.from({ length: n }, (_, k) => {
    const a = rand(seed, k * 3) * Math.PI * 2;
    const d = Math.sqrt(rand(seed, k * 3 + 1)) * spread;
    const r = rMin + rand(seed, k * 3 + 2) * (rMax - rMin);
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, r, rand(seed, k + 50) * 72, rand(seed, k + 60) > 0.66 ? 0.72 : 1] as Bloom;
  });
  return out.sort((a, b) => a[2] - b[2]).map((b, k) => ({ b, back: k < Math.floor(n * 0.4) }));
}

function BudShape({ uid, b: [x, y, rot], delay }: { uid: string; b: Bud; delay: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <g className="nbl-bud" style={{ "--d": `${delay}ms` } as CSSProperties}>
        <path d={BUD} fill={`url(#${uid}-bud)`} />
        <path d={SEPAL} fill="#6e3436" />
      </g>
    </g>
  );
}

function Leaf({ x, y, rot, s = 1 }: { x: number; y: number; rot: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d={LEAF} fill="#8a4a37" />
      <path d="M0 0C3 -1.2 7 -1.8 11 -2.4" stroke="#b56a49" strokeWidth={0.5} fill="none" />
    </g>
  );
}

/* --------------------------------------------------------------- the branch */

const MAIN = limb([[-10, 36], [22, 28], [56, 34], [90, 30], [124, 41], [158, 38], [190, 49], [220, 47], [246, 55], [264, 53]], 21, 2.4, 1);
const UP = limb([[54, 34], [68, 22], [86, 14], [106, 8], [124, 4]], 8, 1.5, 1);
const DROOP = limb([[92, 32], [99, 47], [111, 59], [127, 65]], 6.5, 1.4, -1);
const TWIG = limb([[188, 49], [198, 37], [212, 29], [228, 24]], 5.5, 1.2, 1);
const KNOT = limb([[26, 30], [32, 19], [42, 12]], 4.5, 1.1, 1);

const BLOOMS = [
  cluster(36, 20, 6, 13, 6, 10, 1),
  cluster(82, 13, 7, 15, 6, 9.5, 2),
  cluster(120, 34, 4, 9, 6, 8.5, 3),
  cluster(117, 62, 6, 11, 5.5, 8.5, 4),
  cluster(178, 42, 6, 12, 6, 9, 5),
  cluster(214, 28, 5, 10, 5.5, 8, 6),
  cluster(253, 56, 4, 8, 5, 7, 7),
].flat();
const BUDS: Bud[] = [[20, 36, 200], [105, 2, 25], [126, 3, 70], [104, 42, 160], [133, 59, 95], [166, 46, 190], [231, 21, 60], [266, 51, 80]];
const LANTERNS = [
  { x: 151, y: 38.5, cord: 30, s: 1, delay: 1000, cls: "nbl-swing-1" },
  { x: 233, y: 51, cord: 19, s: 0.82, delay: 1250, cls: "nbl-swing-2" },
];

function Lantern({ uid, x, y, cord, s, delay, cls }: { uid: string } & (typeof LANTERNS)[number]) {
  const ribs = [6.2, 10, 14, 18, 22, 25.6].map((ry) => {
    const w = 6 + 6.4 * Math.sin((Math.PI * (ry - 2.4)) / 25.2);
    return `M${(-w).toFixed(2)} ${ry}Q0 ${ry + 2.2} ${w.toFixed(2)} ${ry}`;
  });
  const vars = { "--d": `${delay}ms`, "--l": `${cord}px` } as CSSProperties;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`nbl-swing ${cls}`}>
        <line className="nbl-cord" style={vars} x1={0} y1={0} x2={0} y2={cord} stroke="#1c1218" strokeWidth={0.75} />
        <g className="nbl-lower" style={vars}>
          <g transform={`translate(0 ${cord}) scale(${s})`}>
            <circle className="nbl-glow" style={{ "--d2": `${delay + 700}ms` } as CSSProperties} cy={15} r={36} fill={`url(#${uid}-glow)`} />
            <rect x={-5.5} y={-1} width={11} height={3.6} rx={1.2} fill="#3a221f" />
            <path d="M-6 2.4C-14 4 -14.5 25 -6 27.6H6C14.5 25 14 4 6 2.4Z" fill={`url(#${uid}-lantern)`} />
            {ribs.map((d) => <path key={d} d={d} stroke="#9a3121" strokeOpacity={0.38} strokeWidth={0.55} fill="none" />)}
            <path d="M0 2.6V27.4" stroke="#9a3121" strokeOpacity={0.22} strokeWidth={0.5} />
            <ellipse cx={-5.2} cy={12} rx={2.2} ry={6.4} fill="#fff4d8" opacity={0.32} />
            <rect x={-5.5} y={26.8} width={11} height={3.6} rx={1.2} fill="#3a221f" />
            <path d="M0 30.4V34" stroke="#b8342a" strokeWidth={0.8} />
            <path d="M-1.7 33.6H1.7L2.3 42.4C1 43.4 -1 43.4 -2.3 42.4Z" fill="#c33f2f" />
            <path d="M-.6 34.6L-.8 42.2M.7 34.6L.9 42.2" stroke="#e2715b" strokeWidth={0.35} />
          </g>
        </g>
      </g>
    </g>
  );
}

function Branch({ uid }: { uid: string }) {
  const limbs = [KNOT, UP, DROOP, TWIG, MAIN];
  return (
    <Piece vb="0 0 300 150" className="nbl-branch" style={{ left: 0, top: 0, width: "70%" }}>
      <g className="nbl-reach">
        <g>
          {limbs.map((l, i) => <path key={i} d={l.body} fill={`url(#${uid}-bark)`} />)}
          {limbs.map((l, i) => <path key={i} d={l.lit} fill="#9b86bd" opacity={0.32} />)}
          <Leaf x={60} y={36} rot={150} s={0.8} />
          <Leaf x={150} y={42} rot={30} s={0.7} />
          <Leaf x={214} y={48} rot={160} s={0.75} />
          {LANTERNS.map((l) => <Lantern key={l.x} uid={uid} {...l} />)}
          {BUDS.map((b, i) => <BudShape key={i} uid={uid} b={b} delay={320 + b[0] * 3} />)}
          {BLOOMS.map(({ b, back }, i) => <Blossom key={i} uid={uid} b={b} back={back} delay={300 + b[0] * 3} />)}
        </g>
      </g>
    </Piece>
  );
}

/* ---------------------------------------------------------- the lower sprig */

const SPRIG = limb([[172, 108], [142, 94], [114, 86], [88, 73], [64, 62], [44, 49]], 13, 2, 1);
const SPRIG_UP = limb([[114, 86], [106, 71], [101, 56]], 4.5, 1.1, 1);
const SPRIG_BLOOMS = [cluster(60, 55, 6, 12, 6, 9, 11), cluster(100, 64, 6, 13, 6, 9, 12), cluster(134, 85, 3, 8, 5.5, 7.5, 13)].flat();
const SPRIG_BUDS: Bud[] = [[43, 44, -40], [101, 51, 10], [143, 83, -10]];

function Sprig({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 160 112" className="nbl-sprig-piece" style={{ right: 0, bottom: "-1%", width: "46%" }}>
      <g className="nbl-sprig-in">
        <g>
          {[SPRIG_UP, SPRIG].map((l, i) => <path key={i} d={l.body} fill={`url(#${uid}-bark)`} />)}
          {[SPRIG_UP, SPRIG].map((l, i) => <path key={i} d={l.lit} fill="#9b86bd" opacity={0.3} />)}
          <Leaf x={88} y={75} rot={130} s={0.85} />
          <Leaf x={136} y={94} rot={165} s={0.9} />
          <Leaf x={54} y={58} rot={205} s={0.7} />
          {SPRIG_BUDS.map((b, i) => <BudShape key={i} uid={uid} b={b} delay={900 + (160 - b[0]) * 3} />)}
          {SPRIG_BLOOMS.map(({ b, back }, i) => <Blossom key={i} uid={uid} b={b} back={back} delay={900 + (160 - b[0]) * 3} />)}
        </g>
      </g>
    </Piece>
  );
}

/* ----------------------------------------------------------------- the moon */

function Moon({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 120 120" className="nbl-moon" style={{ right: "-3%", top: "-7%", width: "31%" }}>
      <g className="nbl-moon-in">
        <circle className="nbl-halo" cx={66} cy={54} r={58} fill={`url(#${uid}-halo)`} />
        <circle cx={66} cy={54} r={27} fill={`url(#${uid}-moon)`} />
        <g fill="#dcc7a2">
          <ellipse cx={57} cy={46} rx={5.2} ry={4.2} opacity={0.5} />
          <ellipse cx={75} cy={61} rx={3.6} ry={3} opacity={0.42} />
          <ellipse cx={62} cy={66} rx={2.5} ry={2} opacity={0.38} />
          <ellipse cx={79} cy={44} rx={2.1} ry={1.8} opacity={0.36} />
          <ellipse cx={51} cy={58} rx={1.8} ry={1.5} opacity={0.32} />
          <ellipse cx={69} cy={38} rx={1.4} ry={1.2} opacity={0.3} />
        </g>
        <g className="nbl-cloud">
          <path d="M22 74C25 68.5 33 67.5 38 70C41 64.5 51 62.5 57 67C61 63 71 63.5 74 68.5C80 66.5 89 68.5 92 73.5C95 75 95 78 91 78.5C70 80 44 80.5 25 78.5C20.5 78 19.5 76 22 74Z" fill="#20223b" />
          <path d="M22 74C25 68.5 33 67.5 38 70C41 64.5 51 62.5 57 67C61 63 71 63.5 74 68.5C80 66.5 89 68.5 92 73.5" fill="none" stroke="#77739f" strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
        </g>
        <g className="nbl-cloud nbl-cloud-2">
          <path d="M84 38C86.5 35 91 34.5 93.5 36C96 33 101.5 32.5 104 35.5C107.5 34.5 111 36.5 111 39.5C111 41.2 109.5 42 107.5 42H86C83 42 82 40 84 38Z" fill="#20223b" />
          <path d="M84 38C86.5 35 91 34.5 93.5 36C96 33 101.5 32.5 104 35.5C107.5 34.5 111 36.5 111 39.5" fill="none" stroke="#77739f" strokeWidth={0.9} strokeLinecap="round" opacity={0.8} />
        </g>
      </g>
    </Piece>
  );
}

/* --------------------------------------------------------- petals and flies */

const N_PETALS = 18;
const PETALS: Particle[] = Array.from({ length: N_PETALS }, (_, i) => ({
  x: (((i * 5) % N_PETALS) + rand(i, 1) * 0.8) * (97 / N_PETALS),
  size: 2.6 + rand(i, 2) * 2,
  dur: 11 + rand(i, 3) * 8,
  phase: rand(i, 4),
  sway: 0.9 + rand(i, 5) * 1.4,
  swayDur: 2.4 + rand(i, 6) * 1.8,
  spin: (rand(i, 7) > 0.5 ? 1 : -1) * (3.5 + rand(i, 8) * 3.5),
  opacity: 0.7 + rand(i, 9) * 0.3,
}));

const FLY_HOMES: P[] = [[10, 64], [86, 46], [28, 86], [64, 74], [92, 82], [6, 40], [48, 93], [74, 58]];
const FLIES = FLY_HOMES.map(([hx, hy], i) => ({
  points: [0, 1, 2, 3].map((k): P => [
    Math.round(Math.min(97, Math.max(3, hx + (rand(i, 10 + k) - 0.5) * 22))),
    Math.round(Math.min(97, Math.max(30, hy + (rand(i, 20 + k) - 0.5) * 18))),
  ]),
  dur: 15 + rand(i, 30) * 9,
  phase: rand(i, 31),
  blink: 2.4 + rand(i, 32) * 2.2,
  size: 4 + rand(i, 33) * 2,
}));

export function NightBloom({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-petal`} x1=".5" y1="1" x2=".5" y2="0">
          <stop offset="0" stopColor="#ee7aa2" />
          <stop offset=".38" stopColor="#f8b4cb" />
          <stop offset="1" stopColor="#ffeef4" />
        </linearGradient>
        <radialGradient id={`${uid}-flower`}>
          <stop offset="0" stopColor="#df4479" />
          <stop offset=".2" stopColor="#ef7fa5" />
          <stop offset=".5" stopColor="#f9c0d3" />
          <stop offset="1" stopColor="#fff2f6" />
        </radialGradient>
        <radialGradient id={`${uid}-flower-back`}>
          <stop offset="0" stopColor="#bd376a" />
          <stop offset=".22" stopColor="#d96894" />
          <stop offset=".55" stopColor="#e8a2bd" />
          <stop offset="1" stopColor="#f3cfdc" />
        </radialGradient>
        <linearGradient id={`${uid}-bud`} x1=".5" y1="1" x2=".5" y2="0">
          <stop offset="0" stopColor="#d84c79" />
          <stop offset="1" stopColor="#ffb4cb" />
        </linearGradient>
        <linearGradient id={`${uid}-bark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a3c" />
          <stop offset="1" stopColor="#1d1420" />
        </linearGradient>
        <radialGradient id={`${uid}-lantern`} cx=".5" cy=".48" r=".62">
          <stop offset="0" stopColor="#fff4d2" />
          <stop offset=".34" stopColor="#ffc76c" />
          <stop offset=".74" stopColor="#ee6a3e" />
          <stop offset="1" stopColor="#b3322b" />
        </radialGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor="#ffc27a" stopOpacity=".5" />
          <stop offset=".45" stopColor="#ff9a5a" stopOpacity=".16" />
          <stop offset="1" stopColor="#ff9a5a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-moon`} cx=".38" cy=".34" r=".78">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset=".62" stopColor="#f8eedb" />
          <stop offset="1" stopColor="#e2cda6" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset=".42" stopColor="#fff1d6" stopOpacity=".3" />
          <stop offset=".62" stopColor="#d9c8ff" stopOpacity=".1" />
          <stop offset="1" stopColor="#d9c8ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-fly`}>
          <stop offset="0" stopColor="#fff9c8" stopOpacity=".95" />
          <stop offset=".25" stopColor="#ffe98a" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
        </radialGradient>
      </Defs>
      <Moon uid={uid} />
      <Sprig uid={uid} />
      <Branch uid={uid} />
      <Layer className="nbl-air">
        <Particles
          items={PETALS}
          className="nbl-petal"
          render={() => (
            <svg viewBox="-6.2 -7.6 12.4 12.4">
              <path d={FALLING} fill={`url(#${uid}-petal)`} />
              <path d="M.2 3.6C.1 1 .2 -2 .4 -5" stroke="#f28db0" strokeWidth={0.35} opacity={0.6} fill="none" />
            </svg>
          )}
        />
        {FLIES.map((fly, i) => (
          <Wander key={i} points={fly.points} dur={fly.dur} phase={fly.phase} size={fly.size}>
            <svg viewBox="-12 -12 24 24" className="nbl-fly" style={{ "--blink": `${fly.blink.toFixed(2)}s`, "--bd": `${(-rand(i, 34) * fly.blink).toFixed(2)}s` } as CSSProperties}>
              <circle r={11.5} fill={`url(#${uid}-fly)`} />
              <circle r={1.9} fill="#fffde6" />
            </svg>
          </Wander>
        ))}
      </Layer>
    </>
  );
}
