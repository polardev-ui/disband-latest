import type { Profile } from "@/lib/supabase/types";

interface PlatformBadgeProps {
  profile: Pick<Profile, "show_owner_badge" | "show_staff_badge">;
  className?: string;
}

export function PlatformBadge({ profile, className = "" }: PlatformBadgeProps) {
  if (profile.show_owner_badge) {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[#faa61a]/25 text-[#faa61a] ${className}`}
      >
        Owner
      </span>
    );
  }
  if (profile.show_staff_badge) {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-brand/30 text-[#dee0fc] ${className}`}
      >
        Staff
      </span>
    );
  }
  return null;
}
