"use client";

import { activityDefinition, type ActivityKind } from "@/lib/activities";

/**
 * A game's cover tile: its two colours as a lit gradient with a soft grid,
 * and an illustration of the game itself. Used at every size, from the 44px
 * launcher tiles to the banner on an open game.
 */
export function ActivityGlyph({
  kind,
  size = 32,
  muted = false,
  radius,
}: {
  kind: ActivityKind;
  size?: number;
  muted?: boolean;
  radius?: number;
}) {
  const def = activityDefinition(kind);
  const r = radius ?? Math.max(6, Math.round(size * 0.24));
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: muted
          ? "linear-gradient(145deg, #3a3c42, #232428)"
          : `radial-gradient(120% 90% at 20% 10%, color-mix(in srgb, ${def.accent} 92%, white 8%), ${def.accent2} 78%)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.18), inset 0 -10px 18px rgba(0,0,0,.18)",
        filter: muted ? "grayscale(1)" : undefined,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" className="absolute inset-0 opacity-[.12]">
        <defs>
          <pattern id={`grid-${kind}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M8 0H0V8" fill="none" stroke="#fff" strokeWidth=".6" />
          </pattern>
        </defs>
        <rect width="48" height="48" fill={`url(#grid-${kind})`} />
      </svg>
      <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 32 32" className="relative drop-shadow-[0_2px_2px_rgba(0,0,0,.35)]">
        <Art kind={kind} />
      </svg>
    </span>
  );
}

function Art({ kind }: { kind: ActivityKind }) {
  switch (kind) {
    case "four_in_row":
      return (
        <g>
          <rect x="3" y="5" width="26" height="22" rx="4" fill="#1d2bb0" />
          {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => {
            const fill = (r === 3 && c < 3) || (r === 2 && c === 1) ? "#ffd23f" : (r === 3 && c === 3) || (r === 2 && c === 2) || (r === 1 && c === 2) ? "#ff4d5e" : "#0d1470";
            return <circle key={`${r}${c}`} cx={7.5 + c * 5.7} cy={9.5 + r * 5} r="2.1" fill={fill} />;
          }))}
        </g>
      );
    case "reversi":
      return (
        <g>
          <circle cx="12" cy="18" r="8" fill="#101113" stroke="#fff" strokeWidth="1.2" />
          <circle cx="20" cy="13" r="8" fill="#f6f6f6" />
          <circle cx="20" cy="13" r="5.5" fill="none" stroke="#d4d4d4" strokeWidth="1" />
        </g>
      );
    case "wordle":
      return (
        <g fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="9" textAnchor="middle">
          {[["W", "#3ba55d"], ["O", "#c99a2e"], ["R", "#3a3d43"]].map(([l, c], i) => (
            <g key={l} transform={`translate(${2 + i * 10} ${i === 1 ? 8 : 11})`}>
              <rect width="9" height="11" rx="1.6" fill={c} />
              <text x="4.5" y="8.4" fill="#fff">{l}</text>
            </g>
          ))}
        </g>
      );
    case "eight_ball":
      return (
        <g>
          <circle cx="16" cy="16" r="13" fill="#0b0c0e" />
          <circle cx="11" cy="10" r="4" fill="#fff" opacity=".18" />
          <circle cx="16" cy="15" r="6" fill="#fff" />
          <text x="16" y="18.6" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="9" fill="#0b0c0e">8</text>
        </g>
      );
    case "trivia":
      return (
        <g>
          <path d="M5 6a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3h-9l-6 5v-5H8a3 3 0 0 1-3-3Z" fill="#fff" />
          <text x="16" y="18" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="14" fill="#a26b05">?</text>
        </g>
      );
    case "would_you_rather":
      return (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 29V17L7 8" stroke="#fff" strokeWidth="3.2" />
          <path d="M16 17l9-9" stroke="#ffd6eb" strokeWidth="3.2" />
          <path d="M4 12V5h7M28 12V5h-7" stroke="#fff" strokeWidth="3" />
        </g>
      );
    case "minesweeper":
      return (
        <g>
          <rect x="2" y="2" width="28" height="28" rx="3" fill="#0c3b57" />
          {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={4 + c * 8.3} y={4 + r * 8.3} width="7.3" height="7.3" rx="1.2" fill={r === 1 && c === 1 ? "#0a2a3d" : "#7dd3fc"} />))}
          <circle cx="16" cy="16" r="2.8" fill="#0b0c0e" />
          <path d="M16 11.5v9M11.5 16h9" stroke="#0b0c0e" strokeWidth="1.3" />
          <path d="M23 21.6v6M23 21.6l4.5 1.8-4.5 1.6" fill="#ef4444" stroke="#ef4444" strokeWidth="1" strokeLinejoin="round" />
          <text x="8" y="26.6" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="5.4" fill="#1d4ed8">2</text>
        </g>
      );
    case "hangman":
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 29h14M9 29V4h12v4" />
          <circle cx="21" cy="11.5" r="3.2" />
          <path d="M21 15v7M21 17.5l-3.5 3M21 17.5l3.5 3M21 22l-3 4.5M21 22l3 4.5" />
        </g>
      );
    case "emoji_riddle":
      return (
        <g>
          <circle cx="14" cy="17" r="11" fill="#ffd93b" />
          <circle cx="10.5" cy="15" r="1.6" fill="#5b3a00" />
          <circle cx="17.5" cy="15" r="1.6" fill="#5b3a00" />
          <path d="M9.5 20.5c2.5 2.5 6.5 2.5 9 0" stroke="#5b3a00" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle cx="25" cy="7.5" r="5.5" fill="#fff" />
          <text x="25" y="10.5" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="8" fill="#854d0e">?</text>
        </g>
      );
    case "scramble":
      return (
        <g fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="8.5" textAnchor="middle">
          {[["S", -10, 5, -8], ["C", 0, 11, 6], ["R", 10, 4, -4]].map(([l, dx, y, rot]) => (
            <g key={l as string} transform={`translate(${12 + (dx as number)} ${y}) rotate(${rot} 5 5)`}>
              <rect width="10" height="11" rx="2" fill="#fff" />
              <text x="5" y="8.4" fill="#4c1d95">{l}</text>
            </g>
          ))}
          <path d="M6 27c4 3 16 3 20 0" stroke="#e9d5ff" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M23.5 24.5l2.8 2.6-3.4 1.3" stroke="#e9d5ff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "higher_lower":
      return (
        <g>
          <rect x="3" y="7" width="14" height="20" rx="2.5" fill="#fff" transform="rotate(-10 10 17)" />
          <rect x="14" y="4" width="14" height="20" rx="2.5" fill="#fff" transform="rotate(8 21 14)" />
          <text x="21" y="17" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="9" fill="#e11d48" transform="rotate(8 21 14)">K♥</text>
          <path d="M8 13.5l3-3.5 3 3.5M8 20.5l3 3.5 3-3.5" stroke="#881337" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-10 10 17)" />
        </g>
      );
  }
}
