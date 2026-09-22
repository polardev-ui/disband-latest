"use client";

/**
 * Illustrated decorations — drawn, not generated.
 *
 * The difference from the procedural effects next door is the whole point.
 * Those are shapes a formula produced: a conic gradient, a ring of dots, a
 * circle that scales. These are drawn: every curve is a placed bezier, every
 * form has a light side and a shadow side, and the colour is a chosen palette
 * rather than a hue rotation.
 *
 * That is what "looks illustrated" actually means, and it is why it cannot be
 * shortcut with a gradient. It also has a ceiling: this is still vector art
 * made of paths. Genuinely painted decorations — the rendered, textured kind —
 * ship as image assets, and the loader below takes those too.
 */

interface DecorationProps {
  /** Rendered at the avatar's box; the art is authored on a 100x100 grid. */
  size?: number;
  className?: string;
}

const BOX = { viewBox: "0 0 100 100", className: "pointer-events-none absolute inset-0" };

/* ------------------------------------------------------------- Cat ears */

/**
 * A cat hood: two ears with inner fur and shading, a collar, and a bell that
 * swings. Sits around the avatar the way Discord's decorations do.
 */
export function CatEarsDecoration({ className = "" }: DecorationProps) {
  return (
    <svg {...BOX} className={`${BOX.className} ${className}`} aria-hidden overflow="visible">
      <defs>
        <linearGradient id="dec-cat-fur" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#8fd3ff" />
          <stop offset="45%" stopColor="#4aa8f0" />
          <stop offset="100%" stopColor="#2b6fb5" />
        </linearGradient>
        <linearGradient id="dec-cat-inner" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffd9ea" />
          <stop offset="100%" stopColor="#ff9dc4" />
        </linearGradient>
        <linearGradient id="dec-cat-collar" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="#ff6b95" />
          <stop offset="100%" stopColor="#c82f60" />
        </linearGradient>
        <radialGradient id="dec-cat-bell" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="60%" stopColor="#f5c22b" />
          <stop offset="100%" stopColor="#9a6a05" />
        </radialGradient>
      </defs>

      {/* Left ear: outer fur, then the inner ear inset and rotated to sit in
          it, then a rim light on the leading edge. */}
      <g className="dec-ear-left">
        <path
          d="M18 34 C 14 20, 20 9, 27 8 C 33 7, 40 15, 43 25 C 38 26, 26 29, 18 34 Z"
          fill="url(#dec-cat-fur)"
          stroke="#1d4f82"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M22 30 C 20 21, 23 14, 27 13 C 31 12, 35 18, 37 25 C 33 26, 27 27, 22 30 Z"
          fill="url(#dec-cat-inner)"
          opacity="0.95"
        />
        <path
          d="M19 32 C 16 21, 21 11, 27 10"
          fill="none"
          stroke="#cdefff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>

      <g className="dec-ear-right">
        <path
          d="M82 34 C 86 20, 80 9, 73 8 C 67 7, 60 15, 57 25 C 62 26, 74 29, 82 34 Z"
          fill="url(#dec-cat-fur)"
          stroke="#1d4f82"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M78 30 C 80 21, 77 14, 73 13 C 69 12, 65 18, 63 25 C 67 26, 73 27, 78 30 Z"
          fill="url(#dec-cat-inner)"
          opacity="0.95"
        />
        <path
          d="M81 32 C 84 21, 79 11, 73 10"
          fill="none"
          stroke="#cdefff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      {/* Collar, drawn as a band that follows the avatar's lower curve. */}
      <path
        d="M22 74 C 33 88, 67 88, 78 74"
        fill="none"
        stroke="url(#dec-cat-collar)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M24 75 C 34 86, 66 86, 76 75"
        fill="none"
        stroke="#ffb3c8"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.6"
      />

      <g className="dec-bell" style={{ transformOrigin: "50px 80px" }}>
        <circle cx="50" cy="86" r="5.4" fill="url(#dec-cat-bell)" stroke="#7d5400" strokeWidth="0.9" />
        <path d="M45.2 85.4 H54.8" stroke="#8a5f04" strokeWidth="1" />
        <circle cx="50" cy="88.4" r="1.15" fill="#6d4a02" />
        <circle cx="47.9" cy="83.7" r="1.5" fill="#fffbe0" opacity="0.9" />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- Koi */

/**
 * Two koi circling the avatar: body, tail and pectoral fins are separate
 * paths so the tail can trail behind the turn instead of the whole fish
 * rotating as one rigid sprite.
 */
export function KoiDecoration({ className = "" }: DecorationProps) {
  return (
    <svg {...BOX} className={`${BOX.className} ${className}`} aria-hidden overflow="visible">
      <defs>
        <linearGradient id="dec-koi-body" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0%" stopColor="#fffdf8" />
          <stop offset="55%" stopColor="#ffd9c0" />
          <stop offset="100%" stopColor="#ff8a4c" />
        </linearGradient>
        <linearGradient id="dec-koi-fin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff6ee" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffb98c" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <g className="dec-koi-orbit" style={{ transformOrigin: "50px 50px" }}>
        <g transform="translate(50 -2)">
          <Koi />
        </g>
      </g>
      <g className="dec-koi-orbit dec-koi-orbit-b" style={{ transformOrigin: "50px 50px" }}>
        <g transform="translate(50 102) rotate(180)">
          <Koi />
        </g>
      </g>
    </svg>
  );
}

/** One fish, drawn nose-left: tail, pectorals, body, then markings. */
function Koi() {
  return (
    <g>
      <path
        className="dec-koi-tail"
        d="M13 0 C 20 -7, 27 -9, 30 -4 C 27 -1, 27 1, 30 4 C 27 9, 20 7, 13 0 Z"
        fill="url(#dec-koi-fin)"
        style={{ transformOrigin: "13px 0px" }}
      />
      <path
        className="dec-koi-fin"
        d="M0 1 C -3 6, -8 8, -9 5 C -8 3, -6 2, -3 1 Z"
        fill="url(#dec-koi-fin)"
        style={{ transformOrigin: "0px 1px" }}
      />
      <path
        d="M-12 0 C -9 -4.6, -2 -6, 6 -4.4 C 11 -3.4, 14 -1.6, 14.5 0 C 14 1.6, 11 3.4, 6 4.4 C -2 6, -9 4.6, -12 0 Z"
        fill="url(#dec-koi-body)"
        stroke="#d4703a"
        strokeWidth="0.55"
      />
      {/* Markings: two soft patches, not a pattern fill. */}
      <ellipse cx="2" cy="-1.3" rx="3.4" ry="1.9" fill="#ff5a2b" opacity="0.85" />
      <ellipse cx="9" cy="0.9" rx="2.1" ry="1.3" fill="#ff5a2b" opacity="0.7" />
      <circle cx="-9.6" cy="-1" r="0.85" fill="#33231c" />
      <path d="M-11 -2.4 C -8 -4.2, -3 -5, 2 -4.3" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.75" />
    </g>
  );
}

export const DECORATIONS: Record<string, (p: DecorationProps) => React.ReactElement> = {
  "dec-cat": CatEarsDecoration,
  "dec-koi": KoiDecoration,
};
