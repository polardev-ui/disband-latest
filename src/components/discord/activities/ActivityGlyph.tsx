"use client";

import { activityDefinition, type ActivityKind } from "@/lib/activities";

export function ActivityGlyph({
  kind,
  size = 32,
  muted = false,
}: {
  kind: ActivityKind;
  size?: number;
  muted?: boolean;
}) {
  const def = activityDefinition(kind);
  const color = muted ? "var(--text-muted)" : def.accent;

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
      style={{
        width: size,
        height: size,
        color,
        background: muted
          ? "var(--bg-accent)"
          : `color-mix(in srgb, ${def.accent} 18%, transparent)`,
        border: `1px solid ${muted ? "var(--divider)" : `color-mix(in srgb, ${def.accent} 34%, transparent)`}`,
      }}
    >
      {(kind === "four_in_row" || kind === "reversi") && (
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
        >
          {[0, 1, 2].flatMap((r) =>
            [0, 1, 2].map((c) => (
              <circle
                key={`${r}-${c}`}
                cx={5 + c * 7}
                cy={5 + r * 7}
                r="2.6"
                fill={
                  kind === "four_in_row"
                    ? r === c
                      ? "currentColor"
                      : "none"
                    : (r + c) % 2
                      ? "currentColor"
                      : "none"
                }
                stroke="currentColor"
                strokeWidth="1.5"
              />
            )),
          )}
        </svg>
      )}
      {kind === "wordle" && (
        <svg
          width={size * 0.52}
          height={size * 0.52}
          viewBox="0 0 15 15"
          fill="none"
        >
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={col * 5 + 0.5}
                y={row * 5 + 0.5}
                width="4"
                height="4"
                rx="0.6"
                fill={row === 1 && col === 1 ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1"
              />
            )),
          )}
        </svg>
      )}

      {kind === "eight_ball" && (
        <svg
          width={size * 0.56}
          height={size * 0.56}
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="8" cy="8" r="6.5" fill="currentColor" opacity="0.92" />
          <circle cx="8" cy="8" r="3.4" fill="var(--bg-secondary)" />
          <text
            x="8"
            y="10.3"
            textAnchor="middle"
            fontSize="5.3"
            fontWeight="800"
            fill="currentColor"
          >
            8
          </text>
        </svg>
      )}

      {kind === "trivia" && (
        <svg
          width={size * 0.54}
          height={size * 0.54}
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx="8"
            cy="8"
            r="6.3"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M6.3 6.1a1.8 1.8 0 1 1 2.6 1.6c-.5.3-.8.6-.8 1.2v.3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8.1" cy="11.4" r="0.8" fill="currentColor" />
        </svg>
      )}

      {kind === "would_you_rather" && (
        <svg
          width={size * 0.58}
          height={size * 0.58}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M2.5 5h7.2l-1.8-1.8M13.5 11H6.3l1.8 1.8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="12.8"
            cy="5"
            r="1.4"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle
            cx="3.2"
            cy="11"
            r="1.4"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      )}
    </span>
  );
}
