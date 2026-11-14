import { IconGroup } from "@/components/icons";
import { safeImageUrl, thumbImageUrl } from "@/lib/safe-url";
import type { GroupChat } from "@/lib/supabase/types";

/** A group chat's picture: its icon if it has one, otherwise a coloured
 *  circle with the group glyph. The colour comes from the id so it stays put. */
export function GroupAvatar({ group, size = 32, className = "" }: { group: Pick<GroupChat, "id" | "icon_url" | "name">; size?: number; className?: string }) {
  const src = thumbImageUrl(group.icon_url, 40);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center rounded-full text-white ${className}`}
      style={{ width: size, height: size, background: `hsl(${(group.id.charCodeAt(0) * 37) % 360} 55% 45%)` }}
    >
      <IconGroup size={Math.round(size * 0.56)} />
    </span>
  );
}
