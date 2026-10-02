"use client";

import type { SketchDesign } from "@/lib/shop";
import { useCosmeticMotion } from "./useCosmeticMotion";
import "./sketch-decorations.css";

// Original irregular contours: their radius stays outside the avatar opening.
const loops = [
  "M59 10 C83 7 107 28 110 54 C115 80 93 106 67 111 C39 116 12 98 9 71 C3 43 23 15 49 11 C54 10 58 10 63 11",
  "M43 13 C70 2 99 17 108 43 C120 70 105 98 79 108 C52 120 23 105 12 82 C0 57 13 28 35 16 C39 14 43 13 47 12",
  "M80 13 C102 23 113 47 109 71 C105 96 80 113 55 111 C28 109 8 86 9 61 C9 35 29 13 54 9 C64 8 74 10 83 15",
];

export function SketchDecoration({ design, playing = true }: { design: SketchDesign; playing?: boolean }) {
  const { ref, running } = useCosmeticMotion(playing);
  return <span ref={ref} className={`sketch-art sketch-${design}`} data-running={running} aria-hidden="true">
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {design === "graphite" && <>
        {loops.map((d, i) => <g className={`sketch-pencil-frame sketch-pencil-frame-${i}`} key={d}>
          <path d={d} strokeWidth="1.25" strokeDasharray="9 .25 4 .4 12 .2" />
          <path d={loops[(i + 1) % 3]} strokeWidth=".65" opacity=".7" transform="rotate(3 60 60)" />
          <path d={loops[(i + 2) % 3]} strokeWidth=".45" opacity=".45" transform="translate(-1 1)" />
          <path d="M17 28l-3 6m81 58l-5 5M45 109l9 2" strokeWidth=".7" opacity=".65" />
        </g>)}
      </>}
      {design === "blue-note" && <>
        <path d={loops[1]} strokeWidth="1.35" />
        <path d={loops[0]} strokeWidth=".55" opacity=".4" />
        <path className="sketch-underline" pathLength="1" d="M34 113q24 4 49-2m-41 6q20 1 33-2" strokeWidth="1.4" />
        <path className="sketch-star" d="m101 11 2 5 6 1-5 3 1 6-5-4-5 2 2-6-3-4 6 1Z" strokeWidth="1.1" />
      </>}
      {design === "margins" && <>
        <path d="M12 42q-3-16 13-27l16-5M80 10q21 5 29 26l1 7M109 80q-6 21-28 29M41 110q-23-6-31-30" strokeWidth="1.4" />
        <path d="M15 39q-1-14 12-22M85 14q16 7 21 24M105 85q-7 15-23 21M36 106q-14-5-22-22" strokeWidth=".6" opacity=".45" />
        {[0, 90, 180, 270].map((angle, i) => <path key={angle} className={`sketch-tick sketch-tick-${i}`} d="M58 5v5m4-4v3" transform={`rotate(${angle} 60 60)`} strokeWidth=".9" />)}
      </>}
      {design === "red-thread" && <>
        <path d={loops[2]} strokeWidth="1.1" />
        <path d={loops[1]} strokeWidth=".55" opacity=".45" />
        <path className="sketch-thread-light" d={loops[2]} pathLength="100" strokeWidth="1.6" />
        <g className="sketch-knot" strokeWidth="1.1">
          <path d="M95 99q-17-11-13-16 7-5 14 14 10-18 15-12 1 7-15 13Zm1 0-8 13m8-13 8 12" />
        </g>
      </>}
    </svg>
  </span>;
}
