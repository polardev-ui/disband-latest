import type { CSSProperties } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Sunseeker: your picture as the face of a sunflower. A ring of seeds frames
 the photo, bright petals radiate in front with a deeper, offset ring behind
 them, and two leaves (one with a ladybird) sit either side of the stem. A
 bumblebee hovers by the top right.

 On hover a ripple runs round the front petals, and the bee flies a loop of
 the whole flower, leaving a dotted trail, and comes back to where it was.
*/

const C = 100;
const f = (n: number) => Math.round(n * 100) / 100;
const pt = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

/** A petal lying along +x from its base at the origin. */
function petal(len: number, wid: number, bend: number) {
  const h = wid / 2;
  return `M0 0C${f(len * 0.18)} ${f(-h * 0.9 + bend)} ${f(len * 0.55)} ${f(-h * 1.1 + bend)} ${f(len * 0.82)} ${f(-h * 0.62 + bend * 1.4)}C${f(len * 0.94)} ${f(-h * 0.34 + bend * 1.6)} ${f(len)} ${f(bend * 1.8)} ${f(len)} ${f(bend * 1.8)}C${f(len)} ${f(bend * 1.8)} ${f(len * 0.94)} ${f(h * 0.34 + bend * 1.6)} ${f(len * 0.82)} ${f(h * 0.62 + bend * 1.4)}C${f(len * 0.55)} ${f(h * 1.1 + bend)} ${f(len * 0.18)} ${f(h * 0.9 + bend)} 0 0Z`;
}

// Deterministic jitter so every petal is a little different.
const jit = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

const FRONT = Array.from({ length: 16 }, (_, i) => {
  const deg = -90 + i * 22.5 + jit(i, 1) * 5;
  return { deg, len: 29 + jit(i, 2) * 5, wid: 12.5 + jit(i, 3) * 2.4, bend: jit(i, 4) * 2.2, i };
});
const BACK = Array.from({ length: 16 }, (_, i) => {
  const deg = -90 + 11.25 + i * 22.5 + jit(i, 5) * 5;
  return { deg, len: 33 + jit(i, 6) * 4, wid: 13.5 + jit(i, 7) * 2, bend: jit(i, 8) * 2.6, i };
});

// Seeds round the photo on a golden-angle spiral, kept to the visible ring.
const SEEDS = Array.from({ length: 70 }, (_, i) => {
  const deg = i * 137.508;
  const r = 50.6 + (i % 3) * 1.6 + jit(i, 9) * 0.6;
  const [x, y] = pt(deg, r);
  return { x, y, r: 0.85 + (i % 3) * 0.12, deg };
});

const LEAF = "M0 0C8 -10 24 -14 38 -8C30 2 14 8 0 0Z";

// The bee's loop: anticlockwise all the way round from its perch at -46°.
const TRAIL = (() => {
  const [sx, sy] = pt(-46, 86);
  const [mx, my] = pt(-226, 86);
  return `M${f(sx)} ${f(sy)}A86 86 0 1 0 ${f(mx)} ${f(my)}A86 86 0 1 0 ${f(sx)} ${f(sy)}`;
})();

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-petal`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#f08a0c" />
        <stop offset=".35" stopColor="#ffc21a" />
        <stop offset="1" stopColor="#ffe774" />
      </linearGradient>
      <linearGradient id={`${uid}-petal-back`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#b55a06" />
        <stop offset=".5" stopColor="#e59110" />
        <stop offset="1" stopColor="#f6b632" />
      </linearGradient>
      <radialGradient id={`${uid}-disc`} cx="50%" cy="50%" r="50%">
        <stop offset=".86" stopColor="#3a1f0c" />
        <stop offset=".95" stopColor="#5e3416" />
        <stop offset="1" stopColor="#2c1607" />
      </radialGradient>
      <linearGradient id={`${uid}-leaf`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7cc657" />
        <stop offset=".5" stopColor="#3f9a3a" />
        <stop offset="1" stopColor="#1f5f26" />
      </linearGradient>
      <linearGradient id={`${uid}-stem`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2f7a2e" />
        <stop offset=".5" stopColor="#5bb04a" />
        <stop offset="1" stopColor="#245f24" />
      </linearGradient>
      <radialGradient id={`${uid}-bee`} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#fff1a1" />
        <stop offset=".6" stopColor="#ffc928" />
        <stop offset="1" stopColor="#d98c06" />
      </radialGradient>
    </defs>
  );
}

function Petal({ p, uid, back }: { p: (typeof FRONT)[number]; uid: string; back?: boolean }) {
  const [x, y] = pt(p.deg, back ? 46 : 51);
  const d = petal(p.len, p.wid, p.bend);
  return (
    <g transform={`translate(${f(x)} ${f(y)}) rotate(${f(p.deg)})`}>
      <g className={back ? undefined : "sf-petal"} style={back ? undefined : ({ "--i": p.i } as CSSProperties)}>
        <path d={d} fill={back ? "#6e3204" : "#a85a06"} opacity=".45" transform="translate(.6 1.2)" />
        <path d={d} fill={`url(#${uid}-${back ? "petal-back" : "petal"})`} stroke={back ? "#7a3d06" : "#b8650a"} strokeWidth=".8" strokeLinejoin="round" />
        <path d={`M${f(p.len * 0.12)} ${f(p.bend * 0.3)}C${f(p.len * 0.4)} ${f(p.bend)} ${f(p.len * 0.7)} ${f(p.bend * 1.3)} ${f(p.len * 0.9)} ${f(p.bend * 1.7)}`} fill="none" stroke={back ? "#a85a06" : "#e8930c"} strokeWidth=".7" strokeLinecap="round" opacity=".7" />
        {!back && (
          <path d={`M${f(p.len * 0.3)} ${f(-p.wid * 0.26 + p.bend)}C${f(p.len * 0.5)} ${f(-p.wid * 0.36 + p.bend)} ${f(p.len * 0.7)} ${f(-p.wid * 0.3 + p.bend * 1.3)} ${f(p.len * 0.82)} ${f(-p.wid * 0.18 + p.bend * 1.5)}`} fill="none" stroke="#fff6c2" strokeWidth=".9" strokeLinecap="round" opacity=".75" />
        )}
      </g>
    </g>
  );
}

function Leaves({ uid }: { uid: string }) {
  return (
    <g>
      <path d="M100 146C101 162 98 178 101 197" fill="none" stroke="#1d4f1f" strokeWidth="7.4" strokeLinecap="round" />
      <path d="M100 146C101 162 98 178 101 197" fill="none" stroke={`url(#${uid}-stem)`} strokeWidth="5.6" strokeLinecap="round" />
      {[
        { t: "translate(99.5 186) rotate(-166) scale(1.55)", flip: false },
        { t: "translate(100.5 180) rotate(-16) scale(1.48 -1.48)", flip: true },
      ].map((l, i) => (
        <g key={i} transform={l.t}>
          <path d={LEAF} fill="#173f1b" opacity=".45" transform="translate(.6 1.4)" />
          <path d={LEAF} fill={`url(#${uid}-leaf)`} stroke="#1a4a1e" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M1 0C12 -4 24 -6 36 -8M10 -3.4L15 -8.6M18 -5L24 -9.8M25 -6.4L30 -9.4M12 -3.6L16 1.6M20 -5.2L25 -1" fill="none" stroke="#a6e07f" strokeWidth=".55" strokeLinecap="round" opacity=".8" />
          {l.flip && (
            // A ladybird on the right leaf.
            <g transform="translate(22 -4) rotate(-20)">
              <ellipse rx="3.4" ry="2.8" fill="#e8322a" stroke="#4a0d0a" strokeWidth=".5" />
              <path d="M0 -2.8V2.8" stroke="#4a0d0a" strokeWidth=".45" />
              <circle cx="3.6" r="1.5" fill="#1c1210" />
              {[[-1.6, -1.1], [-1.4, 1.2], [1.4, -1.2], [1.2, 1.1]].map(([x, y], k) => (
                <circle key={k} cx={x} cy={y} r=".55" fill="#1c1210" />
              ))}
              <circle cx="-1.6" cy="-1.6" r=".55" fill="#fff" opacity=".7" />
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

function SeedRing({ uid }: { uid: string }) {
  return (
    <g>
      <circle cx={C} cy={C} r="52.8" fill="none" stroke={`url(#${uid}-disc)`} strokeWidth="6.4" />
      <circle cx={C} cy={C} r="52.8" fill="none" stroke="#3a1f0c" strokeWidth="6.4" opacity=".55" />
      {SEEDS.map((s, i) => (
        <ellipse key={i} cx={f(s.x)} cy={f(s.y)} rx={s.r} ry={s.r * 0.72} transform={`rotate(${f(s.deg)} ${f(s.x)} ${f(s.y)})`} fill={i % 4 === 0 ? "#a8743c" : "#7a4a1e"} />
      ))}
      <circle cx={C} cy={C} r="56" fill="none" stroke="#2a1405" strokeWidth=".9" />
      <circle cx={C} cy={C} r="49.8" fill="none" stroke="#2a1405" strokeWidth=".8" opacity=".7" />
    </g>
  );
}

function Bee({ uid }: { uid: string }) {
  return (
    <g className="sf-flight">
      <g className="sf-hover di">
        <g transform="rotate(-12)">
          {/* Wings behind the body, flapping. */}
          <g className="sf-wing sf-wing-a di">
            <ellipse cx="-2" cy="-6.6" rx="4.4" ry="6.2" transform="rotate(-24 -2 -6.6)" fill="#eaf7ff" opacity=".8" stroke="#8fb4c9" strokeWidth=".5" />
          </g>
          <g className="sf-wing sf-wing-b di">
            <ellipse cx="2.6" cy="-6" rx="3.4" ry="5.2" transform="rotate(18 2.6 -6)" fill="#eaf7ff" opacity=".7" stroke="#8fb4c9" strokeWidth=".5" />
          </g>
          <path d="M8.4 .6L11.2 1.4L8.2 2.4Z" fill="#1d1a17" />
          <ellipse cx="0" cy="0" rx="9" ry="6.6" fill={`url(#${uid}-bee)`} stroke="#2b1d08" strokeWidth=".8" />
          <path d="M-2.6 -6.1C-3.6 -2 -3.6 2 -2.6 6.1M2.8 -5.9C1.8 -2 1.8 2 2.8 5.9" fill="none" stroke="#1d1a17" strokeWidth="2.2" />
          <circle cx="-8" cy="-.8" r="4.4" fill="#1d1a17" />
          <circle cx="-9.4" cy="-1.8" r="1.1" fill="#fff" />
          <path d="M-9.6 -4.6C-11 -7.4 -12.6 -8.6 -14.2 -8.8M-7.6 -5C-8 -8 -8.8 -9.8 -10.2 -10.8" fill="none" stroke="#1d1a17" strokeWidth=".6" strokeLinecap="round" />
          <circle cx="-14.4" cy="-8.8" r=".8" fill="#1d1a17" />
          <circle cx="-10.4" cy="-10.9" r=".8" fill="#1d1a17" />
          <path d="M-4 -4.6C-1 -6 3 -6 5.6 -4.4" fill="none" stroke="#fff6c8" strokeWidth=".9" strokeLinecap="round" opacity=".8" />
        </g>
      </g>
    </g>
  );
}

function Back({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "sf-play" : undefined}>
        <Leaves uid={uid} />
        {BACK.map((p) => <Petal key={p.i} p={p} uid={uid} back />)}
      </g>
    </>
  );
}

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "sf-play" : undefined}>
        {/* Reveals the dotted loop behind the bee, anticlockwise from where
            it starts. Inside the keyed group so the reveal restarts too. */}
        <mask id={`${uid}-trail`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <path className="sf-reveal" d={TRAIL} fill="none" stroke="#fff" strokeWidth="5" pathLength="100" strokeDasharray="100 100" />
        </mask>
        {FRONT.map((p) => <Petal key={p.i} p={p} uid={uid} />)}
        <SeedRing uid={uid} />
        {/* The bee's loop, drawn in behind it as it flies. */}
        <circle className="sf-trail" mask={`url(#${uid}-trail)`} cx={C} cy={C} r="86" fill="none" stroke="#fff3b0" strokeWidth="1.4" strokeLinecap="round" strokeDasharray=".1 4.4" />
        <g transform={`translate(${C} ${C})`}>
          <Bee uid={uid} />
        </g>
      </g>
    </>
  );
}

export const sunseeker: DesignSpec = {
  cycleMs: 2400,
  gapMs: 1400,
  back: (p) => <Back {...p} />,
  front: (p) => <Front {...p} />,
};
