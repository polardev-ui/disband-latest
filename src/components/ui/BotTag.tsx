import type { Profile } from "@/lib/supabase/types";

interface BotTagProps {
  profile?: Pick<Profile, "is_bot"> | null;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Discord-style "BOT" pill, shown next to bot usernames in chat and the
 * member list. Renders nothing for human profiles.
 */
export function BotTag({ profile, size = "md", className = "" }: BotTagProps) {
  if (!profile?.is_bot) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[4px] bg-[#5865f2] font-bold uppercase leading-none text-white ${
        size === "sm" ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]"
      } ${className}`}
    >
      BOT
    </span>
  );
}
