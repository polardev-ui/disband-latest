"use client";

import {
  Gamepad2,
  Headphones,
  Mic,
  Users,
  MessageSquare,
  Volume2,
  Bell,
  Smartphone,
  Video,
  Music,
  Compass,
  Sparkles,
  Shield,
  ThumbsUp,
} from "lucide-react";

/**
 * Privacy-first decorative backdrop for the standalone auth screen: a wall of
 * Disband-themed glyphs (gamepad, headset, mic, voice bubbles, chat…) laid
 * out on a deterministic full-bleed lattice.
 *
 * Layout runs edge to edge: cells are left/top percentages of the whole
 * viewport, so the wall reaches every corner on every screen — no dead
 * margins around a floating box. Deterministic jitter keeps it reading as
 * "deliberately scattered" instead of a rigid spreadsheet.
 *
 * Everything is inline SVG (lucide), zero network requests — privacy-first
 * and consistent with the app's self-hosting posture.
 *
 * Determinism matters: glyph choice, rotation, size, and opacity come from
 * fixed arrays seeded by cell index — no Math.random() at render time — so
 * server render and client rehydrate to exactly the same layout (no layout
 * shift, no hydration mismatch, no layout-shift on an SSR app).
 */
const GLYPHS = [
  Gamepad2,
  Headphones,
  Mic,
  Users,
  MessageSquare,
  Volume2,
  Bell,
  Smartphone,
  Video,
  Music,
  Compass,
  Sparkles,
  Shield,
  ThumbsUp,
];

// Full-bleed lattice: 11 columns × 15 rows = 165 glyphs, dense and tight.
const COLS = 11;
const ROWS = 15;

// Deterministic jitter (in %) around each cell center — small so neighbors
// hug each other, index-seeded so no two cells land on the same spot.
const JITTER_X = [-1.2, 1.0, -0.8, 1.1, -0.7, 0.9, -1.0, 0.8, -1.1, 0.7];
const JITTER_Y = [-0.8, 0.9, -1.0, 0.7, -0.9, 1.0, -0.7, 0.8, -1.1, 0.6];

// Fixed per-cell rotation (deg) — cycles so no two neighbors share an angle.
const ROTATIONS = [-16, 14, -10, 22, -8, 18, -24, 12, -6, 20, -12, 6];

// Fixed per-cell size (px) — glyphs stay crisp at 165 cells because the
// ceiling is capped; nothing so big it blurs into the denser field.
const SIZES = [
  26, 18, 30, 20, 28, 20, 30, 18, 26, 22, 20, 28, 22, 26, 18, 24, 22, 28,
  20, 30, 18, 24, 26, 28,
];

// Fixed per-cell opacity (0.06–0.13 — the wall whispers; it never shouts).
const OPACITIES = [0.13, 0.07, 0.1, 0.06, 0.12, 0.08, 0.07, 0.11, 0.09, 0.13];

const NUM = COLS * ROWS; // one glyph per grid cell

export function ScatteredIcons() {
  const cells = Array.from({ length: NUM }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const jx = JITTER_X[i % JITTER_X.length];
    const jy = JITTER_Y[i % JITTER_Y.length];
    const left = (col / (COLS - 1)) * 100 + jx;
    const top = (row / (ROWS - 1)) * 100 + jy;
    const G = GLYPHS[i % GLYPHS.length];
    const size = SIZES[i % SIZES.length];
    const rotation = ROTATIONS[i % ROTATIONS.length];
    const opacity = OPACITIES[i % OPACITIES.length];
    return { left, top, G, size, rotation, opacity };
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {cells.map(({ left, top, G, size, rotation, opacity }, i) => (
        <div
          key={i}
          className="absolute text-text-muted"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            opacity,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
        >
          <G size={size} strokeWidth={1.5} />
        </div>
      ))}
    </div>
  );
}
