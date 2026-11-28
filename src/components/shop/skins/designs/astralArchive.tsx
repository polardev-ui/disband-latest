import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, Layer, Piece, Wander, rand } from "./parts";
import "./scene.css";
import "./astralArchive.css";

/*
 Astral Archive: a library adrift in deep space.

 A great engraved celestial ring hangs off the top right corner, its outer
 scale of degrees turning one way and its inner band of markers the other,
 slowly, with a small armillary sphere at its heart whose meridians turn
 about its axis. Stars twinkle across the whole card. Books drift loose
 down both sides, turning as they go. At the bottom, a short shelf of
 spines floats on the right, and a brass astrolabe on the left, its star
 map turning against its rule.

 Everything is midnight blue, muted violet and antique gold, with white for
 the stars. The ring and the sphere sit in the banner band; the shelf and
 astrolabe are the floor; the books keep to the margins.
*/

const f = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ sky */

const STARS = Array.from({ length: 40 }, (_, i) => ({
  x: rand(i, 91) * 98 + 1,
  y: rand(i, 92) * 97 + 1,
  s: 0.35 + rand(i, 93) * 0.5 + (i % 8 === 0 ? 0.6 : 0),
  tw: 2.6 + rand(i, 94) * 3.4,
  td: -rand(i, 95) * 6,
  big: i % 8 === 0,
}));

/* ---------------------------------------------------------------- rings */

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);

function OuterRing({ uid }: { uid: string }) {
  return (
    <svg className="aa-ring aa-ring-outer" viewBox="-60 -60 120 120" focusable="false">
      <circle r="57" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle r="51.5" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth=".5" />
      <circle r="54.3" fill="none" stroke="#c8a45c" strokeWidth="4.6" opacity=".07" />
      {TICKS.map((a) => {
        const long = a % 30 === 0;
        const r0 = long ? 52 : 53.6;
        const rad = (a * Math.PI) / 180;
        return <line key={a} x1={f(Math.cos(rad) * r0)} y1={f(Math.sin(rad) * r0)} x2={f(Math.cos(rad) * 56.4)} y2={f(Math.sin(rad) * 56.4)} stroke="#d9bd7c" strokeWidth={long ? 0.55 : 0.3} opacity={long ? 0.9 : 0.6} />;
      })}
      {/* Engraved marks between the long ticks: dots, bars and small crosses. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i * 30 + 15) * Math.PI) / 180;
        const x = Math.cos(a) * 48.6;
        const y = Math.sin(a) * 48.6;
        const kind = i % 3;
        return (
          <g key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${i * 30 + 105})`} opacity=".75">
            {kind === 0 && <circle r=".9" fill="none" stroke="#d9bd7c" strokeWidth=".35" />}
            {kind === 1 && <path d="M-1.4 0H1.4M0 -1.4V1.4" stroke="#d9bd7c" strokeWidth=".35" />}
            {kind === 2 && <path d="M-1.2 .7L0 -1.1L1.2 .7Z" fill="none" stroke="#d9bd7c" strokeWidth=".35" />}
          </g>
        );
      })}
    </svg>
  );
}

function InnerRing({ uid }: { uid: string }) {
  return (
    <svg className="aa-ring aa-ring-inner" viewBox="-60 -60 120 120" focusable="false">
      <circle r="40" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth=".7" />
      <circle r="36.5" fill="none" stroke="#8f7fd0" strokeWidth=".4" opacity=".7" />
      <circle r="38.2" fill="none" stroke="#6b5ca8" strokeWidth="2.6" opacity=".22" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        return i % 2 ? (
          <circle key={i} cx={f(Math.cos(a) * 38.2)} cy={f(Math.sin(a) * 38.2)} r=".45" fill="#e8dcbc" />
        ) : (
          <path key={i} d="M0 -1.1L.7 0L0 1.1L-.7 0Z" fill="#d9bd7c" transform={`translate(${f(Math.cos(a) * 38.2)} ${f(Math.sin(a) * 38.2)}) rotate(${i * 15})`} />
        );
      })}
    </svg>
  );
}

/** A small armillary sphere: a tilted horizon ring, two meridians turning about the axis, a globe. */
function Armillary({ uid }: { uid: string }) {
  return (
    <svg className="aa-armillary" viewBox="-24 -24 48 48" focusable="false">
      <g transform="rotate(-18)">
        <line x1="0" y1="-21" x2="0" y2="21" stroke="#d9bd7c" strokeWidth=".6" />
        <ellipse rx="17" ry="5.2" fill="none" stroke="#8f7fd0" strokeWidth=".7" opacity=".6" />
        <circle r="17" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth=".9" />
        <g className="aa-meridian"><ellipse rx="17" ry="17" fill="none" stroke="#d9bd7c" strokeWidth=".6" /></g>
        <g className="aa-meridian aa-meridian-b"><ellipse rx="17" ry="17" fill="none" stroke="#b9a7f0" strokeWidth=".5" opacity=".8" /></g>
        <circle r="4.6" fill={`url(#${uid}-globe)`} />
        <path d="M-17 0A17 5.2 0 0 0 17 0" fill="none" stroke="#8f7fd0" strokeWidth=".7" />
        <circle cy="-21" r="1" fill="#d9bd7c" />
        <circle cy="21" r="1" fill="#d9bd7c" />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- books */

function Book({ cover, band }: { cover: string; band: string }) {
  return (
    <svg viewBox="-12 -9 24 18">
      <path d="M-10 -6.4L9 -7.6L10 6.4L-9 7.6Z" fill="#000" opacity=".25" transform="translate(.6 .8)" />
      <path d="M-10 -6.4L9 -7.6L10 6.4L-9 7.6Z" fill={cover} />
      <path d="M-10 -6.4L-8.6 -7.4L10.4 -8.5L9 -7.6Z" fill="#e9e4d6" opacity=".85" />
      <path d="M9 -7.6L10.4 -8.5L11.4 5.6L10 6.4Z" fill="#d8d0bd" opacity=".9" />
      <path d="M-7.4 -6.55L-6.4 7.45M-5.6 -6.65L-4.6 7.35" stroke={band} strokeWidth=".7" />
      <path d="M-1.6 -2.6L6.4 -3.1M-1.3 .2L5 -.2" stroke={band} strokeWidth=".45" opacity=".8" />
      <circle cx="2.2" cy="3.2" r="1.2" fill="none" stroke={band} strokeWidth=".4" />
    </svg>
  );
}

/* --------------------------------------------------------- shelf, astrolabe */

const SPINES = [
  { w: 6, h: 34, c: "#4a3f7a" }, { w: 5, h: 38, c: "#2c356b" }, { w: 7, h: 31, c: "#6b5ca8" }, { w: 4.6, h: 40, c: "#3b2f5e" },
  { w: 6.4, h: 36, c: "#23295a" }, { w: 5.4, h: 33, c: "#8a6a35" }, { w: 6, h: 37, c: "#4a3f7a" },
];

function Shelf({ uid }: { uid: string }) {
  let x = 14;
  return (
    <Piece vb="0 0 110 60" className="aa-shelf" style={{ right: "3%", bottom: "2cqw", width: "38%" }}>
      {SPINES.map((s, i) => {
        const x0 = x;
        x += s.w + 0.5;
        return (
          <g key={i}>
            <rect x={x0} y={50 - s.h} width={s.w} height={s.h} rx=".6" fill={s.c} />
            <rect x={x0} y={50 - s.h + 3} width={s.w} height=".7" fill="#d9bd7c" opacity=".8" />
            <rect x={x0} y={50 - s.h + 4.6} width={s.w} height=".35" fill="#d9bd7c" opacity=".6" />
            <rect x={x0} y={46} width={s.w} height=".7" fill="#d9bd7c" opacity=".7" />
            <rect x={x0 + s.w * 0.3} y={50 - s.h * 0.62} width={s.w * 0.4} height={s.h * 0.2} rx=".3" fill="#e9e4d6" opacity=".18" />
          </g>
        );
      })}
      {/* One leaning against the rest. */}
      <g transform={`translate(${x + 1} 50) rotate(-16)`}>
        <rect x="0" y="-32" width="5.6" height="32" rx=".6" fill="#6b5ca8" />
        <rect x="0" y="-29" width="5.6" height=".7" fill="#d9bd7c" />
      </g>
      <rect x="6" y="50" width="98" height="3.2" rx=".8" fill={`url(#${uid}-gold)`} />
      <rect x="6" y="53.2" width="98" height="1.4" fill="#000" opacity=".3" />
      <path d="M14 53V58M96 53V58" stroke="#a8823d" strokeWidth="1.2" />
    </Piece>
  );
}

function Astrolabe({ uid }: { uid: string }) {
  return (
    <Piece vb="-32 -34 64 68" className="aa-astrolabe" style={{ left: "4%", bottom: "2.6cqw", width: "21%" }}>
      <circle cy="-30" r="3" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="1.2" />
      <circle r="27" fill="#141a45" />
      <circle r="27" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="2.4" />
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i * 10 * Math.PI) / 180;
        return <line key={i} x1={f(Math.cos(a) * 23.4)} y1={f(Math.sin(a) * 23.4)} x2={f(Math.cos(a) * 25.4)} y2={f(Math.sin(a) * 25.4)} stroke="#d9bd7c" strokeWidth=".35" />;
      })}
      <circle r="15" fill="none" stroke="#6b5ca8" strokeWidth=".4" />
      <circle r="8" fill="none" stroke="#6b5ca8" strokeWidth=".4" />
      {/* The rete: an open star map in gold, turning. */}
      <g className="aa-rete">
        <circle cx="-3" cy="-2.4" r="17" fill="none" stroke="#d9bd7c" strokeWidth=".7" />
        <circle cx="5" r="9" fill="none" stroke="#d9bd7c" strokeWidth=".5" />
        <path d="M0 -22C6 -14 6 -6 0 0C-6 6 -6 14 0 22M-22 0C-14 -6 -6 -6 0 0C6 6 14 6 22 0" fill="none" stroke="#d9bd7c" strokeWidth=".5" opacity=".85" />
        {[[-10, -14], [12, -9], [-15, 8], [9, 15], [17, 4]].map(([x, y], i) => (
          <path key={i} d="M0 -2.2L.6 -.6L2.2 0L.6 .6L0 2.2L-.6 .6L-2.2 0L-.6 -.6Z" fill="#efe3c0" transform={`translate(${x} ${y})`} />
        ))}
      </g>
      <g className="aa-rule">
        <path d="M-24 -.7H24V.7H-24Z" fill={`url(#${uid}-gold)`} />
        <path d="M18 -1.6L24 0L18 1.6Z" fill="#d9bd7c" />
      </g>
      <circle r="1.6" fill="#d9bd7c" />
    </Piece>
  );
}

export function AstralArchive({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e7cf94" />
          <stop offset=".5" stopColor="#c8a45c" />
          <stop offset="1" stopColor="#8a6a35" />
        </linearGradient>
        <radialGradient id={`${uid}-globe`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#d9cffb" />
          <stop offset=".6" stopColor="#6b5ca8" />
          <stop offset="1" stopColor="#2c2560" />
        </radialGradient>
      </Defs>
      <span className="aa-space" />
      <Layer className="aa-stars">
        {STARS.map((s, i) => (
          <span key={i} className="aa-star" style={{ left: `${f(s.x)}%`, top: `${f(s.y)}%`, width: `${f(s.s)}%`, "--tw": `${f(s.tw)}s`, "--td": `${f(s.td)}s` } as CSSProperties}>
            <svg viewBox="-1 -1 2 2">
              {s.big ? <path d="M0 -1C.14 -.26 .26 -.14 1 0C.26 .14 .14 .26 0 1C-.14 .26 -.26 .14 -1 0C-.26 -.14 -.14 -.26 0 -1Z" fill="#ffffff" /> : <circle r=".5" fill="#eef0ff" />}
            </svg>
          </span>
        ))}
      </Layer>
      <span className="aa-orrery">
        <OuterRing uid={uid} />
        <InnerRing uid={uid} />
        <Armillary uid={uid} />
      </span>
      <Layer className="aa-books">
        <Wander points={[[2.5, 58], [4, 66], [2, 74], [3.5, 64]]} dur={22} phase={0.1} size={6}>
          <span className="aa-turn" style={{ "--rt": "13s", "--r0": "-24deg", "--r1": "-6deg" } as CSSProperties}><Book cover="#4a3f7a" band="#d9bd7c" /></span>
        </Wander>
        <Wander points={[[97, 52], [95.5, 60], [97.5, 68], [96, 58]]} dur={26} phase={0.6} size={6}>
          <span className="aa-turn" style={{ "--rt": "17s", "--r0": "14deg", "--r1": "38deg" } as CSSProperties}><Book cover="#2c356b" band="#c8a45c" /></span>
        </Wander>
        <Wander points={[[96, 36], [97.5, 41], [95, 45], [96.5, 39]]} dur={19} phase={0.35} size={4.6}>
          <span className="aa-turn" style={{ "--rt": "11s", "--r0": "-60deg", "--r1": "-30deg" } as CSSProperties}><Book cover="#6b5ca8" band="#efe3c0" /></span>
        </Wander>
      </Layer>
      <Shelf uid={uid} />
      <Astrolabe uid={uid} />
    </>
  );
}
