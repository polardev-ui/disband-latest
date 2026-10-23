"use client";

import { guildTagForeground, showGuildTagSpace, type GuildTag, type GuildTagIcon } from "@/lib/guild-tags";
import { useGuildTag } from "@/lib/guild-tag-store";

/*
 The pixel icons are 12x12 grids: '#' is full ink, '+' half ink for edges and
 shading, '.' empty. Drawn at 12px (or 24px) every art pixel lands on whole
 screen pixels, so edges stay hard; at the old 8x8-in-11px they smeared. The
 tag's foreground colour drives the ink, so one icon works on any tag colour.
*/
const PIXELS: Record<GuildTagIcon, readonly string[]> = {
  star: [
    ".....++.....",
    ".....##.....",
    "....+##+....",
    "....####....",
    "+##########+",
    ".+########+.",
    "..+######+..",
    "...######...",
    "..+######+..",
    "..###++###..",
    ".+##+..+##+.",
    ".##......##.",
  ],
  heart: [
    "............",
    ".+##+..+##+.",
    "+####++####+",
    "##.#########",
    "#.##########",
    "############",
    "+##########+",
    ".+########+.",
    "..+######+..",
    "...+####+...",
    "....+##+....",
    ".....++.....",
  ],
  bolt: [
    "......####..",
    ".....####...",
    "....####....",
    "...####.....",
    "..#########.",
    ".#########..",
    ".....####...",
    "....####....",
    "....###.....",
    "...###......",
    "...##.......",
    "..#.........",
  ],
  crown: [
    "............",
    "+....++....+",
    "#+..+##+..+#",
    "##+.####.+##",
    "###+####+###",
    "############",
    "############",
    "##.##..##.##",
    "############",
    "############",
    "+##########+",
    "............",
  ],
  skull: [
    "...+####+...",
    ".+########+.",
    ".##########.",
    "############",
    "##+..##..+##",
    "##...##...##",
    "###+####+###",
    "+####..####+",
    ".+########+.",
    "..########..",
    "..##.##.##..",
    "...+####+...",
  ],
  moon: [
    "....+###+...",
    "..+###+.....",
    ".+###.......",
    ".###........",
    "####........",
    "####........",
    "####.......+",
    "####+.....+#",
    "+####+...+##",
    ".+#########+",
    "..+#######+.",
    "....+###+...",
  ],
  leaf: [
    ".........###",
    ".......#####",
    ".....######+",
    "....#####.##",
    "...####.###+",
    "..####.####.",
    "..###.####..",
    "..##.####...",
    "..+.####....",
    ".+.+##+.....",
    ".#..........",
    "#...........",
  ],
  flame: [
    "......#.....",
    ".....##.....",
    ".....###....",
    "....+###....",
    "...+####+...",
    "..+###+##+..",
    "..####.###..",
    ".####..+###.",
    ".###+...###.",
    ".###....+##.",
    "..###..###..",
    "...+####+...",
  ],
};

/** One path per tone, merging horizontal runs, so a tag is two nodes, not ~100. */
function pixelPaths(rows: readonly string[]): { full: string; half: string } {
  let full = "";
  let half = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x;
      while (end < row.length && row[end] === ch) end += 1;
      const run = `M${x} ${y}h${end - x}v1h-${end - x}z`;
      if (ch === "#") full += run;
      else if (ch === "+") half += run;
      x = end;
    }
  });
  return { full, half };
}

const PATHS = Object.fromEntries(
  Object.entries(PIXELS).map(([id, rows]) => [id, pixelPaths(rows)]),
) as Record<GuildTagIcon, { full: string; half: string }>;

/** Use 12 or 24: other sizes scale the grid by a fraction and blur it. */
export function PixelGuildIcon({
  icon,
  size = 12,
  className = "",
}: {
  icon: GuildTagIcon;
  size?: number;
  className?: string;
}) {
  const paths = PATHS[icon] ?? PATHS.star;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d={paths.full} fill="currentColor" />
      {paths.half && <path d={paths.half} fill="currentColor" opacity={0.5} />}
    </svg>
  );
}

export function GuildTagBadge({
  tag,
  size = "md",
  className = "",
  onActivate,
}: {
  tag: GuildTag;
  size?: "sm" | "md";
  className?: string;
  onActivate?: () => void;
}) {
  const foreground = guildTagForeground(tag.color);
  const small = size === "sm";
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center gap-[3px] whitespace-nowrap rounded-[4px] font-bold uppercase leading-none tracking-[0.02em] ${
        small ? "h-[16px] px-[4px] text-[10px]" : "h-[18px] px-[5px] text-[11px]"
      } ${onActivate ? "cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80" : ""} ${className}`}
      style={{
        backgroundColor: tag.color,
        color: foreground,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
      }}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={
        onActivate
          ? (event) => {
              event.stopPropagation();
              onActivate();
            }
          : undefined
      }
      onKeyDown={
        onActivate
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onActivate();
            }
          : undefined
      }
      title={onActivate ? (tag.is_private ? "Private space — click for details" : "View this space") : `Guild tag: ${tag.tag}`}
      aria-label={`Guild tag ${tag.tag}${onActivate ? ", view space" : ""}`}
    >
      <PixelGuildIcon icon={tag.icon} size={12} />
      <span>{tag.tag}</span>
    </span>
  );
}

/**
 * Read and show a user's worn guild tag. The store batches reads, so this can
 * sit next to every name without one request per row.
 */
export function GuildTag({
  userId,
  size = "md",
  className = "",
}: {
  userId?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const tag = useGuildTag(userId);
  if (!tag) return null;
  return (
    <GuildTagBadge
      tag={tag}
      size={size}
      className={className}
      onActivate={() => showGuildTagSpace(tag.server_id)}
    />
  );
}
