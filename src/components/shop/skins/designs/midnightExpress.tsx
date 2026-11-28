import type { SkinProps } from "../Skin";
import { Defs, Piece, rand } from "./parts";
import { Stars, Strip, ridge, ridgeAt, ridgeLine, starField } from "./scene";
import "./scene.css";
import "./midnightExpress.css";

/*
 Midnight Express: you are in a sleeper carriage at night. The top of the
 card is the window, set in a brass bezel with a small hopper pane, and the
 country goes past outside: a far city on the horizon, two ranges of hills
 dotted with farm lights, and a dark hedge line close by, each layer at its
 own speed (the nearer, the faster) and all rocking very slightly with the
 rails. Lights in the city blink now and then; the stars and a thin moon
 hold still, being far away. Two reflections of the carriage lamps slide
 across the glass.

 Below the window is the carriage: dark lacquered panelling, a brass rail
 under the sill, and along the bottom a table with a brass lamp glowing
 amber in the corner and a cup of tea steaming beside it. The profile
 sits on the panelling, in the carriage with you.

 Layout: the window is 37cqw tall from just under the top; panning layers
 are composited strips (see scene.tsx); the table is the floor (SKIN_FLOOR).
*/

const f = (n: number) => Math.round(n * 100) / 100;

/** The window's glass, in card units (1 = 1/300 of the card's width). */
const WIN = { x: 12, y: 10.5, w: 276, h: 111, r: 15 };
const TILE = 276;

/* ------------------------------------------------------------- outside */

const STARS = starField(26, TILE, 58, 31, 5);

/** The far city: a seeded skyline with lit windows, some of which blink. */
const CITY = (() => {
  const blocks: { x: number; w: number; h: number }[] = [];
  let x = 4;
  let i = 0;
  while (x < TILE - 14) {
    const w = 5 + rand(i, 61) * 9;
    const h = 5 + rand(i, 62) * 14 + (i % 7 === 3 ? 9 : 0);
    blocks.push({ x, w, h });
    x += w + 0.6 + rand(i, 63) * 3.5 + (i % 9 === 5 ? 18 : 0);
    i++;
  }
  const lights: { x: number; y: number; blink: number; o: number }[] = [];
  blocks.forEach((b, k) => {
    for (let yy = 30 - b.h + 2; yy < 29; yy += 2.6) {
      for (let xx = b.x + 1.3; xx < b.x + b.w - 1; xx += 2.2) {
        const n = k * 31 + Math.round(yy * 7 + xx);
        if (rand(n, 64) < 0.28) lights.push({ x: xx, y: yy, blink: rand(n, 65) < 0.06 ? 1 + (n % 3) : 0, o: 0.45 + rand(n, 66) * 0.5 });
      }
    }
  });
  return { blocks, lights };
})();

const FAR: [number, number, number][] = [[4, 1, 0.6], [2.4, 3, 1.9], [1.2, 5, 0.4]];
const MID: [number, number, number][] = [[3.2, 2, 2.4], [1.8, 3, 0.2], [0.9, 7, 1.3]];
/** Farm lights on the hills, sitting on their ridges. */
const FARMS = Array.from({ length: 7 }, (_, i) => {
  const x = 16 + i * 38 + rand(i, 71) * 16;
  return { x, y: ridgeAt(TILE, 12, FAR, x) + 2.2 + rand(i, 72) * 3, r: 0.55 + rand(i, 73) * 0.35 };
});
const MID_LIGHTS = Array.from({ length: 4 }, (_, i) => {
  const x = 30 + i * 66 + rand(i, 74) * 20;
  return { x, y: ridgeAt(TILE, 10, MID, x) + 3, r: 0.7 };
});

/** The hedge line nearest the track: lumpy, close and fast. Its last lump
 *  ends at the height its first begins, so the tile joins without a notch. */
const HEDGE = (() => {
  const n = Math.round(TILE / 6);
  const tops = Array.from({ length: n }, (_, i) => 13 + rand(i, 82) * 3);
  let d = `M0 22L0 ${f(tops[0])}`;
  for (let i = 0; i < n; i++) {
    const x = i * 6;
    const a = 3 + rand(i, 81) * 4;
    d += `Q${f(x + 3)} ${f(14 - a)} ${f(x + 6)} ${f(tops[(i + 1) % n])}`;
  }
  return `${d}L${TILE} 22Z`;
})();
/** A few trees standing up out of the hedge, wrapped so none crosses the tile's edge. */
const TREES = [22, 97, 141, 214, 251].map((x, i) => ({ x, h: 10 + rand(i, 83) * 7, w: 4 + rand(i, 84) * 3 }));

function Outside({ uid }: { uid: string }) {
  return (
    <span className="mx-glass" style={{ left: `${f((WIN.x / 300) * 100)}%`, top: `${f(WIN.y / 3)}cqw`, width: `${f((WIN.w / 300) * 100)}%`, height: `${f(WIN.h / 3)}cqw`, borderRadius: `${f(WIN.r / 3)}cqw` }}>
      <span className="mx-sky" />
      <svg className="mx-stars" viewBox={`0 0 ${TILE} 58`} focusable="false">
        <Stars stars={STARS} fill="#e9eeff" />
        {/* A thin old moon, high up and too far away to move. */}
        <g transform="translate(232 14)">
          <circle r="4.6" fill="#e6cf98" opacity=".9" />
          <circle cx="1.8" cy="-1" r="4.4" fill="#0c1529" />
          <circle r="9" fill={`url(#${uid}-moon)`} />
        </g>
      </svg>
      <span className="mx-rock">
        <Strip w={TILE} h={32} dur={90} phase={0.3} className="mx-city">
          {CITY.blocks.map((b, i) => <rect key={i} x={f(b.x)} y={f(30 - b.h)} width={f(b.w)} height={f(b.h + 2)} fill="#101a31" />)}
          {CITY.lights.map((l, i) => (
            <rect
              key={i}
              className={l.blink ? `mx-blink mx-blink-${l.blink}` : undefined}
              x={f(l.x)}
              y={f(l.y)}
              width=".9"
              height="1"
              fill={l.blink ? "#ffcf7a" : "#e7b25e"}
              opacity={f(l.o)}
            />
          ))}
          <rect x="0" y="30" width={TILE} height="2" fill="#101a31" />
        </Strip>
        <Strip w={TILE} h={30} dur={44} phase={0.6} className="mx-far">
          <path d={ridge(TILE, 30, 12, FAR)} fill="#101b35" />
          <path d={ridgeLine(TILE, 12, FAR)} fill="none" stroke="#3a4d78" strokeWidth=".5" opacity=".7" />
          {FARMS.map((l, i) => <circle key={i} cx={f(l.x)} cy={f(l.y)} r={f(l.r)} fill="#f0b35a" opacity=".75" />)}
        </Strip>
        <Strip w={TILE} h={26} dur={19} phase={0.15} className="mx-mid">
          <path d={ridge(TILE, 26, 10, MID)} fill="#0a1224" />
          <path d={ridgeLine(TILE, 10, MID)} fill="none" stroke="#2c3c5f" strokeWidth=".5" opacity=".65" />
          {MID_LIGHTS.map((l, i) => (
            <g key={i}>
              <circle cx={f(l.x)} cy={f(l.y)} r="2.6" fill="#f0a54a" opacity=".12" />
              <circle cx={f(l.x)} cy={f(l.y)} r={l.r} fill="#ffc46e" />
            </g>
          ))}
        </Strip>
        <Strip w={TILE} h={22} dur={7.5} className="mx-near">
          <path d={HEDGE} fill="#05080f" />
          {TREES.map((t, i) => (
            <path key={i} d={`M${f(t.x - t.w)} 16C${f(t.x - t.w)} ${f(16 - t.h * 0.7)} ${f(t.x - t.w * 0.3)} ${f(16 - t.h)} ${t.x} ${f(16 - t.h)}C${f(t.x + t.w * 0.3)} ${f(16 - t.h)} ${f(t.x + t.w)} ${f(16 - t.h * 0.7)} ${f(t.x + t.w)} 16Z`} fill="#05080f" />
          ))}
        </Strip>
      </span>
      {/* Reflections on the glass: the carriage lamps, sliding by. */}
      <span className="mx-reflect"><span /><span /></span>
      <span className="mx-lamp-ghost" />
      <span className="mx-glass-shade" />
    </span>
  );
}

/* -------------------------------------------------------------- inside */

function Frame({ uid }: { uid: string }) {
  const { x, y, w, h, r } = WIN;
  return (
    <Piece vb="0 0 300 132" className="mx-frame" style={{ left: 0, top: 0, width: "100%" }}>
      {/* Gasket, then the brass bezel round it with a lit inner edge. */}
      <rect x={x - 1.2} y={y - 1.2} width={w + 2.4} height={h + 2.4} rx={r + 1.2} fill="none" stroke="#07080b" strokeWidth="2.6" />
      <rect x={x - 3.4} y={y - 3.4} width={w + 6.8} height={h + 6.8} rx={r + 3.4} fill="none" stroke={`url(#${uid}-brass)`} strokeWidth="2.6" />
      <rect x={x - 2.3} y={y - 2.3} width={w + 4.6} height={h + 4.6} rx={r + 2.3} fill="none" stroke="#ecd49c" strokeWidth=".4" opacity=".55" />
      {/* The hopper pane along the top. */}
      <rect x={x} y={y + 19} width={w} height="1.8" fill={`url(#${uid}-brass)`} />
      <rect x={x} y={y + 20.8} width={w} height=".6" fill="#07080b" opacity=".7" />
      <rect x={x + w / 2 - 9} y={y + 15} width="18" height="2.2" rx="1.1" fill={`url(#${uid}-brass)`} />
      {[[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]].map(([cx, cy], i) => (
        <g key={i} opacity=".85"><circle cx={cx - (i % 2 ? -2.2 : 2.2)} cy={cy - (i < 2 ? 2.2 : -2.2)} r=".9" fill="#c8a866" /></g>
      ))}
      {/* The rail under the sill. */}
      <rect x="0" y="125.6" width="300" height="3.4" fill={`url(#${uid}-brass)`} />
      <rect x="0" y="125.6" width="300" height=".6" fill="#f2dcaa" opacity=".6" />
      <rect x="0" y="129" width="300" height="1.4" fill="#000000" opacity=".35" />
      {[24, 150, 276].map((bx) => <rect key={bx} x={bx - 2} y="124.4" width="4" height="6" rx="1" fill="#8a6f3e" />)}
    </Piece>
  );
}

function Table({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 66" className="mx-table" style={{ left: 0, bottom: 0, width: "100%" }}>
      <circle className="mx-lamp-pool" cx="262" cy="22" r="52" fill={`url(#${uid}-pool)`} />
      {/* The table: a brass edge, a walnut top, the shadowed front. */}
      <rect x="0" y="40" width="300" height="26" fill="#120d0b" />
      <rect x="0" y="36.4" width="300" height="4.2" fill="#2b1d15" />
      <rect x="0" y="35.6" width="300" height="1.2" fill={`url(#${uid}-brass)`} />
      <rect x="0" y="40.6" width="300" height="1.4" fill="#000" opacity=".4" />
      {/* Tea, steaming. */}
      <g transform="translate(228 36)">
        <ellipse cx="0" cy="0" rx="12" ry="2.2" fill="#d9d2c4" />
        <ellipse cx="0" cy="-.4" rx="9" ry="1.4" fill="#b7ae9e" />
        <path d="M-6.4 -9.6H6.4L5.2 -1.4C4.8 -.4 3.6 0 0 0C-3.6 0 -4.8 -.4 -5.2 -1.4Z" fill="#e6dfd2" />
        <path d="M6.2 -8C9.4 -8.2 10 -4.4 6 -3.6" fill="none" stroke="#e6dfd2" strokeWidth="1.3" />
        <ellipse cx="0" cy="-9.6" rx="6.4" ry="1.2" fill="#5a3a22" />
        <path d="M-6 -8.8C-4 -8 4 -8 6 -8.8" fill="none" stroke="#c9a866" strokeWidth=".5" />
        <path className="mx-steam mx-steam-a" d="M-1.6 -12C-3.4 -15 0 -17 -1.4 -20.4C-2.4 -22.8 -.6 -24.4 -1.2 -26.4" fill="none" stroke="#e8e2d8" strokeWidth="1" strokeLinecap="round" />
        <path className="mx-steam mx-steam-b" d="M1.8 -12.4C3.4 -15.2 .4 -17.6 2 -20.6C3 -22.6 1.2 -24.6 2 -26" fill="none" stroke="#e8e2d8" strokeWidth=".8" strokeLinecap="round" />
      </g>
      {/* The lamp: brass foot and stem, a pleated amber shade lit from inside. */}
      <g transform="translate(262 36)">
        <ellipse cx="0" cy="-.6" rx="7.4" ry="1.6" fill="#6e5530" />
        <path d="M-6.6 -.8C-6 -2.8 6 -2.8 6.6 -.8Z" fill={`url(#${uid}-brass)`} />
        <rect x="-.9" y="-15" width="1.8" height="13" fill={`url(#${uid}-brass)`} />
        <path d="M-9.6 -15.4L-6 -27.4H6L9.6 -15.4Z" fill={`url(#${uid}-shade)`} />
        <path d="M-6 -27.4H6M-9.6 -15.4H9.6" stroke="#c99a52" strokeWidth=".6" />
        {[-6.4, -3.2, 0, 3.2, 6.4].map((px) => <path key={px} d={`M${f(px * 0.62)} -27.2L${f(px)} -15.6`} stroke="#b97a2e" strokeWidth=".35" opacity=".55" />)}
        <ellipse className="mx-bulb" cx="0" cy="-15" rx="8.6" ry="1.6" fill="#ffe2a6" />
      </g>
    </Piece>
  );
}

export function MidnightExpress({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-brass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2c68b" />
          <stop offset=".45" stopColor="#b8975a" />
          <stop offset="1" stopColor="#7a6036" />
        </linearGradient>
        <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9792e" />
          <stop offset=".6" stopColor="#f0a54a" />
          <stop offset="1" stopColor="#ffd38a" />
        </linearGradient>
        <radialGradient id={`${uid}-pool`}>
          <stop offset="0" stopColor="#f0a54a" stopOpacity=".3" />
          <stop offset=".5" stopColor="#c9792e" stopOpacity=".1" />
          <stop offset="1" stopColor="#c9792e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-moon`}>
          <stop offset=".35" stopColor="#e6cf98" stopOpacity=".2" />
          <stop offset="1" stopColor="#e6cf98" stopOpacity="0" />
        </radialGradient>
      </Defs>
      <span className="mx-wall" />
      <span className="mx-wall-glow" />
      <Outside uid={uid} />
      <Frame uid={uid} />
      <Table uid={uid} />
    </>
  );
}
