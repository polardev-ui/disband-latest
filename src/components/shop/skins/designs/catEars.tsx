import type { SkinProps } from "../Skin";
import { Defs, Piece } from "./parts";

/*
 Cat Ears: a pair of fluffy black cat ears with pink insides standing up
 over the top of the card, and a blush across the middle with little
 scribbled cheek marks.

 Sizing works like Discord's: while this is equipped the card makes room
 above itself (see .skin-cat-ears in skins.css), so the ears stand out over
 its top edge instead of being squeezed into its corners.

 Intro: the ears pop up from behind the card.
 Loop: every few seconds one ear flicks, then the other, then both give a
 quick shake; the blush warms up and fades, and the cheek marks wiggle.
*/

/** A furry ear: a black outer shape with a tufted edge and a pink inside. */
function Ear({ uid, flip }: { uid: string; flip?: boolean }) {
  return (
    <g transform={flip ? "translate(120 0) scale(-1 1)" : undefined}>
      <path
        d="M8 112 C4 80 6 40 18 6 C21 0 26 0 30 4 C52 26 78 48 104 72 C110 78 108 86 100 90
           L92 94 L97 99 L86 102 L90 108 L76 110 L60 114 Z"
        fill="#141216"
      />
      <path d="M18 6 L14 2 L22 4 Z M30 4 L34 -1 L35 7 Z M60 34 L66 30 L64 39 Z" fill="#141216" />
      <path
        d="M24 96 C20 74 22 46 30 22 C48 38 68 56 86 76 C78 86 62 94 44 98 Z"
        fill={`url(#${uid}-ce-inner)`}
      />
      <path
        d="M34 88 C32 72 34 56 38 44 L44 52 L42 60 L50 62 L46 70 L56 74 L50 80 L60 84 C52 88 42 90 34 88 Z"
        fill="#f6a8a0"
        opacity={0.85}
      />
      <path d="M26 100 C22 76 24 48 32 22" stroke="#2a2630" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.7} />
    </g>
  );
}

function Blush({ uid, mark }: { uid: string; mark: "a" | "b" }) {
  return (
    <svg viewBox="0 0 100 60" className="ce-blush-sprite">
      <ellipse cx={50} cy={32} rx={46} ry={24} fill={`url(#${uid}-ce-blush)`} className="ce-glow" />
      <path
        className="ce-mark"
        d={mark === "a"
          ? "M26 40 C30 22 36 22 36 34 C38 20 46 20 46 34 C48 22 56 22 56 32 C58 24 64 22 66 30"
          : "M34 40 C36 26 42 24 42 36 C44 24 52 24 52 36 C54 26 60 26 62 32"}
        stroke="#ffffff"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.9}
      />
    </svg>
  );
}

export function CatEars({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-ce-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef7f73" />
          <stop offset="1" stopColor="#f29a90" />
        </linearGradient>
        <radialGradient id={`${uid}-ce-blush`}>
          <stop offset="0" stopColor="#ff9fb8" stopOpacity={0.75} />
          <stop offset="0.6" stopColor="#ff9fb8" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ff9fb8" stopOpacity={0} />
        </radialGradient>
      </Defs>

      {/* Ears standing over the card's top corners, each pivoting at its base. */}
      <Piece vb="0 -4 120 120" className="ce-ear ce-ear-l" style={{ left: 0, top: 0, width: "var(--ce-ear)" }}>
        <g className="ce-pop"><g className="ce-twitch"><Ear uid={uid} /></g></g>
      </Piece>
      <Piece vb="0 -4 120 120" className="ce-ear ce-ear-r" style={{ right: 0, top: 0, width: "var(--ce-ear)" }}>
        <g className="ce-pop"><g className="ce-twitch"><Ear uid={uid} flip /></g></g>
      </Piece>

      {/* The blush, either side across the middle of the card. */}
      <span className="ce-blush ce-blush-l"><Blush uid={uid} mark="a" /></span>
      <span className="ce-blush ce-blush-r"><Blush uid={uid} mark="b" /></span>
    </>
  );
}
