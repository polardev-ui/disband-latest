import type { ComponentType, ReactNode } from "react";
import { IconBounty, IconCrown, IconOG, IconStaff } from "@/components/icons";

/**
 * Badges that keep their original artwork.
 *
 * The four that existed before the badge system was rewritten are the ones
 * people know by sight, so they render from the components they always used
 * rather than being redrawn as outlines to match the newer marks.
 */
const BADGE_COMPONENTS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  owner: IconCrown,
  staff: IconStaff,
  og: IconOG,
  bounty: IconBounty,
};

/**
 * The glyph for each badge key.
 *
 * Drawn here rather than pulled from the icon set because most of these marks
 * exist only as badges, and the catalogue itself lives in the database — the
 * key is the contract between the two, so a badge added server-side renders
 * with a neutral fallback rather than breaking the row.
 */
const S = {
  fill: "none",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const BADGE_GLYPHS: Record<string, ReactNode> = {
  moderator: <><path d="M12 2.5 20 6v6.2c0 4.6-3.3 7.6-8 9.3-4.7-1.7-8-4.7-8-9.3V6Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.6" /></>,
  partner: <><path d="M12 2.6 14.5 8l5.9.7-4.4 4 1.2 5.8L12 15.6 6.8 18.5 8 12.7l-4.4-4L9.5 8Z" /><path d="M8.6 21.4 12 19.2l3.4 2.2" /></>,
  early: <><path d="M12 20.5S3.8 15.6 3.8 9.9A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8.2 2.5c0 5.7-8.2 10.6-8.2 10.6Z" /><path d="M19.6 2.4v3.4M17.9 4.1h3.4" /></>,
  anniv: <><path d="M4.2 20.4v-6.2c0-1 .8-1.8 1.8-1.8h12c1 0 1.8.8 1.8 1.8v6.2Z" /><path d="M2.6 20.4h18.8" /><path d="M12 12.4V9M12 6.6c1.2-1.1.6-2.6-.4-3.4.9 1.5-1.4 1.9-.5 3.4" /><path d="M7.6 12.4V9.6M16.4 12.4V9.6" /></>,
  bot_dev: <><rect x="4" y="7.6" width="16" height="12" rx="3.2" /><path d="M12 7.6V4" /><circle cx="9" cy="13.2" r="1.4" fill="currentColor" stroke="none" /><circle cx="15" cy="13.2" r="1.4" fill="currentColor" stroke="none" /><path d="M9.4 16.8h5.2" /></>,
  bot_ver: <><rect x="3.2" y="7.6" width="14" height="11.4" rx="3" /><path d="M10.2 7.6V4.4" /><circle cx="7.6" cy="12.8" r="1.2" fill="currentColor" stroke="none" /><circle cx="12.8" cy="12.8" r="1.2" fill="currentColor" stroke="none" /><path d="m16.4 19.4 2.2 2.2 4-4.6" /></>,
  contrib: <><path d="m8.4 7.4-5 4.9 5 4.9M15.6 7.4l5 4.9-5 4.9" /><path d="m13.6 4.2-3.2 15.8" /></>,
  translate: <><circle cx="12" cy="12" r="9.2" /><path d="M2.8 12h18.4" /><path d="M12 2.8c2.5 2.6 3.8 5.8 3.8 9.2s-1.3 6.6-3.8 9.2c-2.5-2.6-3.8-5.8-3.8-9.2S9.5 5.4 12 2.8Z" /></>,
  hunter: <><path d="M8.4 5.6a3.6 3.6 0 0 1 7.2 0" /><rect x="7.6" y="7.8" width="8.8" height="11.6" rx="4.4" /><path d="M7.6 11.4H4M7.6 15.6H4.4M16.4 11.4H20M16.4 15.6h3.2" /><path d="m8.6 5-1.8-2M15.4 5l1.8-2" /></>,
  hunter2: <><circle cx="10.4" cy="10.4" r="7.6" /><path d="m15.8 15.8 5.2 5.2" /><rect x="8.3" y="8.2" width="4.2" height="5.6" rx="2.1" /><path d="M8.3 10.1H6.1M8.3 12.6H6.3M12.5 10.1h2.2M12.5 12.6h2" /><path d="m9.1 7.8-.9-1.3M11.7 7.8l.9-1.3" /></>,
  security: <><path d="M12 2.6 19.4 6v6c0 4.4-3.1 7.2-7.4 8.8C7.7 19.2 4.6 16.4 4.6 12V6Z" /><circle cx="12" cy="10.8" r="2.2" /><path d="M12 13v3.4" /></>,
  feedback: <><path d="M20.6 14.4a2.6 2.6 0 0 1-2.6 2.6H8.4l-5 4V5.4a2.6 2.6 0 0 1 2.6-2.6H18a2.6 2.6 0 0 1 2.6 2.6Z" /><path d="m8.8 9.6 2.2 2.2 4.2-4.4" /></>,
  founder: <><path d="M9.4 21.2V3.6l9 2.9-9 2.9" /><path d="M6.6 21.2h5.6" /></>,
  server_v: <><rect x="3" y="4.4" width="14.4" height="6" rx="1.8" /><rect x="3" y="12.4" width="10" height="6" rx="1.8" /><circle cx="6.2" cy="7.4" r="1" fill="currentColor" stroke="none" /><circle cx="6.2" cy="15.4" r="1" fill="currentColor" stroke="none" /><path d="m15.4 17.4 2.2 2.2 4.2-4.8" /></>,
  boost: <><path d="M12 2.4 21.2 12 12 21.6 2.8 12Z" /><path d="m12 15.8v-7M8.8 11.6 12 8.4l3.2 3.2" /></>,
  recruit: <><circle cx="9.4" cy="8" r="3.8" /><path d="M2.8 20.4c0-3.6 2.9-6.2 6.6-6.2 1.5 0 2.9.4 4 1.2" /><path d="M17.6 14.6v6.2M14.5 17.7h6.2" /></>,
  emoji: <><circle cx="11" cy="12.4" r="8.6" /><circle cx="8.4" cy="10.4" r="1.1" fill="currentColor" stroke="none" /><circle cx="13.6" cy="10.4" r="1.1" fill="currentColor" stroke="none" /><path d="M7.4 15c.9 1.5 2.2 2.2 3.6 2.2s2.7-.7 3.6-2.2" /><path d="M19.4 2.2v3M17.9 3.7h3" /></>,
  gift: <><rect x="3" y="10" width="18" height="11" rx="1.8" /><path d="M3 14.4h18M12 10v11" /><path d="M12 10S10.6 5.4 8.2 5.4a2.3 2.3 0 0 0 0 4.6ZM12 10s1.4-4.6 3.8-4.6a2.3 2.3 0 0 1 0 4.6Z" /></>,
  beta: <><path d="M9.4 2.8v5.6L4.2 18a2.6 2.6 0 0 0 2.3 3.8h11a2.6 2.6 0 0 0 2.3-3.8L14.6 8.4V2.8Z" /><path d="M8.4 2.8h7.2" /><path d="M7.2 14.4h9.6" /></>,
  mobile: <><rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.6" /><path d="M10.4 18.6h3.2" /><path d="m12 7 1.1 2.3 2.5.3-1.9 1.8.5 2.5-2.2-1.2-2.2 1.2.5-2.5-1.9-1.8 2.5-.3Z" /></>,
  voice: <><rect x="9" y="2.6" width="6" height="11" rx="3" /><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0" /><path d="M12 18v3.4M9 21.4h6" /><path d="M2.6 9.4v4M21.4 9.4v4" /></>,
};

/** A badge the client does not know the glyph for still gets a mark. */
const FALLBACK = <><circle cx="12" cy="12" r="8.6" /><path d="M12 8.4v4.4M12 16.2h.01" /></>;

export function BadgeGlyph({ badgeKey, size = 13 }: { badgeKey: string; size?: number }) {
  const Original = BADGE_COMPONENTS[badgeKey];
  if (Original) return <Original size={size} />;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...S}>
      {BADGE_GLYPHS[badgeKey] ?? FALLBACK}
    </svg>
  );
}
