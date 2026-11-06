import type { CSSProperties } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Tangled Up: a coral octopus sitting on your head. Its face peeks over the
 top of the picture, two arms hug down both sides and curl in under the
 chin, and four more wave about behind: two out to the sides, two dangling
 below. It blinks now and then and its arms never quite keep still.

 On hover it squeezes, twice: the head squashes down, the hugging arms pull
 in, its eyes go happy, the arms behind wave, and a few bubbles float up.

 Arms are built from a spine (Catmull-Rom through hand-placed points) with a
 tapering width, so each one is a single closed shape with its suckers along
 the inside of the curl.
*/

type P = [number, number];
const f = (n: number) => Math.round(n * 100) / 100;

function spline(pts: P[], per = 10): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

interface Arm {
  body: string;
  /** A lit stripe along the outer edge and a shaded one along the inner. */
  lit: string;
  shade: string;
  suckers: { x: number; y: number; r: number; a: number }[];
}

/** `side` 1 puts the suckers on the left of travel, -1 on the right. */
function arm(pts: P[], w0: number, w1: number, side: 1 | -1, count: number): Arm {
  const c = spline(pts);
  const seg = c.slice(1).map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let run = 0;
  const left: P[] = [];
  const right: P[] = [];
  const lit: P[] = [];
  const shade: P[] = [];
  const frames = c.map((p, i) => {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const t = run / total;
    if (i < seg.length) run += seg[i];
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.85)) / 2;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
    lit.push([p[0] - side * nx * w * 0.55, p[1] - side * ny * w * 0.55]);
    shade.push([p[0] + side * nx * w * 0.62, p[1] + side * ny * w * 0.62]);
    return { p, nx, ny, w, t };
  });
  const tipW = frames[frames.length - 1].w;
  const line = (ps: P[]) => ps.map(([x, y]) => `${f(x)} ${f(y)}`).join("L");
  const body = `M${line(left)}A${f(tipW)} ${f(tipW)} 0 0 1 ${line([...right].reverse())}Z`;
  const suckers: Arm["suckers"] = [];
  for (let k = 0; k < count; k++) {
    const target = 0.16 + (k / Math.max(1, count - 1)) * 0.72;
    const fr = frames.reduce((best, x) => (Math.abs(x.t - target) < Math.abs(best.t - target) ? x : best));
    suckers.push({
      x: fr.p[0] + side * fr.nx * fr.w * 0.5,
      y: fr.p[1] + side * fr.ny * fr.w * 0.5,
      r: Math.max(0.7, fr.w * 0.36),
      a: (Math.atan2(fr.ny, fr.nx) * 180) / Math.PI,
    });
  }
  const cut = Math.floor(frames.length * 0.9);
  return { body, lit: `M${line(lit.slice(2, cut))}`, shade: `M${line(shade.slice(2, cut))}`, suckers };
}

// Hugging arms, in front: from under the head, round the outside of the
// photo (r ≈ 56) and curling in under the chin.
const HUG_L = arm([[80, 54], [64, 58], [51.5, 72], [44.6, 90], [44.8, 110], [51.5, 128], [62, 141], [74, 148.5], [84.5, 146], [87, 138.5], [82, 134.5], [77.6, 137.6]], 13, 3, -1, 9);
const HUG_R = arm([[120, 54], [136, 58], [148.5, 72], [155.4, 90], [155.2, 110], [148.5, 128], [138, 141.5], [126, 149], [115.5, 146.5], [113, 139], [118, 135], [122.4, 138]], 13, 3, 1, 9);
// Waving arms behind: out to each side, and two hanging below.
const SIDE_L = arm([[74, 48], [52, 50], [32, 55], [19, 66], [15.5, 81], [21, 90.5], [29.5, 89], [30, 81.5], [24, 81]], 11, 2.8, 1, 7);
const SIDE_R = arm([[126, 48], [148, 50], [168, 55], [181, 66], [184.5, 81], [179, 90.5], [170.5, 89], [170, 81.5], [176, 81]], 11, 2.8, -1, 7);
const LOW_L = arm([[88, 136], [77, 154], [69, 170], [69.5, 183], [78.5, 187], [83, 180], [77.5, 176.5]], 9.5, 2.6, 1, 6);
const LOW_R = arm([[112, 136], [123, 154], [131, 170], [130.5, 183], [121.5, 187], [117, 180], [122.5, 176.5]], 9.5, 2.6, -1, 6);

const HEAD =
  "M100 5C122.5 5 137 19.5 137 37.5C137 46.5 133.5 52.5 129 57.5Q121.5 63.5 113 59.5Q106.5 64.5 100 60.5Q93.5 64.5 87 59.5Q78.5 63.5 71 57.5C66.5 52.5 63 46.5 63 37.5C63 19.5 77.5 5 100 5Z";

const BUBBLES = [
  { x: 138, y: 30, r: 5, dx: 18, dy: -22, d: 520 },
  { x: 62, y: 26, r: 4, dx: -16, dy: -18, d: 640 },
  { x: 134, y: 16, r: 3.2, dx: 12, dy: -12, d: 820 },
  { x: 68, y: 12, r: 2.8, dx: -10, dy: -9, d: 960 },
];

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-skin`} cx="36%" cy="24%" r="85%">
        <stop offset="0" stopColor="#ffc2a1" />
        <stop offset=".3" stopColor="#ff8a64" />
        <stop offset=".7" stopColor="#ec5558" />
        <stop offset="1" stopColor="#b23048" />
      </radialGradient>
      <linearGradient id={`${uid}-arm`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff9a72" />
        <stop offset=".55" stopColor="#f0625a" />
        <stop offset="1" stopColor="#c23b4c" />
      </linearGradient>
      <linearGradient id={`${uid}-armback`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ee7a5e" />
        <stop offset="1" stopColor="#a83347" />
      </linearGradient>
      <radialGradient id={`${uid}-sucker`} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#fff1e6" />
        <stop offset=".7" stopColor="#ffd2bd" />
        <stop offset="1" stopColor="#e99a86" />
      </radialGradient>
      <radialGradient id={`${uid}-bubble`} cx="35%" cy="30%" r="70%">
        <stop offset="0" stopColor="#fff" stopOpacity=".9" />
        <stop offset=".45" stopColor="#d9f6ff" stopOpacity=".25" />
        <stop offset="1" stopColor="#9fdcf5" stopOpacity=".55" />
      </radialGradient>
    </defs>
  );
}

function ArmShape({ a, uid, back }: { a: Arm; uid: string; back?: boolean }) {
  return (
    <g>
      <path d={a.body} fill="#6e1630" opacity=".4" transform="translate(.8 1.4)" />
      <path d={a.body} fill={`url(#${uid}-${back ? "armback" : "arm"})`} stroke="#7a1d33" strokeWidth="1.1" strokeLinejoin="round" />
      <path d={a.lit} fill="none" stroke="#ffd0b8" strokeWidth="1.1" strokeLinecap="round" opacity={back ? 0.35 : 0.55} />
      <path d={a.shade} fill="none" stroke="#9e2741" strokeWidth="1.4" strokeLinecap="round" opacity=".35" />
      {a.suckers.map((s, i) => (
        <g key={i} transform={`translate(${f(s.x)} ${f(s.y)}) rotate(${f(s.a)})`}>
          <ellipse rx={f(s.r * 0.78)} ry={f(s.r)} fill={`url(#${uid}-sucker)`} stroke="#c0606a" strokeWidth=".55" />
          <ellipse rx={f(s.r * 0.3)} ry={f(s.r * 0.42)} fill="#d98473" opacity=".75" />
        </g>
      ))}
    </g>
  );
}

function Face() {
  return (
    <g>
      <g className="tu-eyes">
        {[88, 112].map((x) => (
          <g key={x} transform={`translate(${x} 34)`}>
            <g className="tu-blink di">
              <ellipse rx="6.6" ry="7.6" fill="#1b0f1d" />
              <ellipse rx="6.6" ry="7.6" fill="none" stroke="#4a1626" strokeWidth=".8" />
              <circle cx="-2.2" cy="-2.8" r="2.4" fill="#fff" />
              <circle cx="2.3" cy="2.6" r="1.1" fill="#fff" opacity=".85" />
            </g>
          </g>
        ))}
      </g>
      <g className="tu-happy">
        <path d="M82 36.5Q88 27.5 94 36.5M106 36.5Q112 27.5 118 36.5" fill="none" stroke="#1b0f1d" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <ellipse className="tu-cheek" cx="77.5" cy="45" rx="5.4" ry="3.1" fill="#ff5f8a" />
      <ellipse className="tu-cheek" cx="122.5" cy="45" rx="5.4" ry="3.1" fill="#ff5f8a" />
      <path d="M95.5 44.5Q97.8 48 100 44.8Q102.2 48 104.5 44.5" fill="none" stroke="#5a1424" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Head({ uid }: { uid: string }) {
  return (
    <g className="tu-head">
      <g className="tu-breathe di">
        <path d={HEAD} fill="#6e1630" opacity=".45" transform="translate(1 2.2)" />
        <path d={HEAD} fill={`url(#${uid}-skin)`} stroke="#7a1d33" strokeWidth="1.3" strokeLinejoin="round" />
        {/* Gloss, freckles, and the shading under the skirt. */}
        <path d="M74 24C77 15 85 9.5 95 8.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".55" />
        <circle cx="72.5" cy="31" r="1.5" fill="#fff" opacity=".6" />
        {[[91, 15, 1.8], [108, 12.5, 1.4], [119, 19.5, 2.2], [126, 29, 1.4], [81, 21, 1.3], [101, 20, 1.1]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#c43c52" opacity=".45" />
        ))}
        <path d="M72 55Q79 60.5 87 57M113 57Q121 60.5 128 55" fill="none" stroke="#9e2741" strokeWidth="1.3" strokeLinecap="round" opacity=".55" />
        <Face />
      </g>
    </g>
  );
}

function Back({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "tu-play" : undefined}>
        <g className="tu-wave tu-wave-l"><g className="tu-sway tu-sway-l di"><ArmShape a={SIDE_L} uid={uid} back /></g></g>
        <g className="tu-wave tu-wave-r"><g className="tu-sway tu-sway-r di"><ArmShape a={SIDE_R} uid={uid} back /></g></g>
        <g className="tu-dangle tu-dangle-l di"><ArmShape a={LOW_L} uid={uid} back /></g>
        <g className="tu-dangle tu-dangle-r di"><ArmShape a={LOW_R} uid={uid} back /></g>
      </g>
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "tu-play" : undefined}>
        <g className="tu-hug">
          <ArmShape a={HUG_L} uid={uid} />
          <ArmShape a={HUG_R} uid={uid} />
        </g>
        <Head uid={uid} />
        {BUBBLES.map((b, i) => (
          <g key={i} transform={`translate(${b.x} ${b.y})`}>
            <g
              className="tu-bubble"
              style={{ "--dx": `${b.dx}px`, "--dy": `${b.dy}px`, animationDelay: `calc(${b.d}ms * var(--deco-slow, 1))` } as CSSProperties}
            >
              <circle r={b.r} fill={`url(#${uid}-bubble)`} stroke="#e9fbff" strokeWidth=".9" />
              <circle cx={-b.r * 0.35} cy={-b.r * 0.35} r={b.r * 0.28} fill="#fff" />
            </g>
          </g>
        ))}
      </g>
    </>
  );
}

export const tangledUp: DesignSpec = {
  cycleMs: 1900,
  gapMs: 1200,
  back: (p) => <Back {...p} />,
  front: (p) => <Front {...p} />,
};
