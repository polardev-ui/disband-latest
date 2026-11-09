import type { Profile } from "@/lib/supabase/types";

interface BotTagProps {
  profile?: Pick<Profile, "is_bot" | "verified_bot"> | null;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The BOT tag beside a bot's name. Verified bots (Disband's own, like
 * Bruce; migration 0245) get a tick in it, which only Disband's servers can
 * set, so a copy with the same name and picture can't fake it.
 */
export function BotTag({ profile, size = "md", className = "" }: BotTagProps) {
  if (!profile?.is_bot) return null;
  const verified = !!profile.verified_bot;
  const tick = size === "sm" ? 9 : 10;
  return (
    <span
      title={verified ? "Verified bot: made by Disband" : undefined}
      aria-label={verified ? "Verified bot" : "Bot"}
      className={`inline-flex shrink-0 items-center justify-center gap-[3px] rounded-lg bg-brand font-bold uppercase leading-none text-white ${
        size === "sm" ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]"
      } ${className}`}
    >
      {verified && (
        <svg width={tick} height={tick} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      BOT
    </span>
  );
}
