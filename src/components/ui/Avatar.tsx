"use client";

import { displayName, avatarStyle, type AvatarCrop } from "@/lib/utils";
import { getAvatarStyle, type ProfileAccentFields } from "@/lib/profileColor";

interface AvatarProps {
  profile: ProfileAccentFields & {
    avatar_url?: string | null;
    display_name?: string | null;
    username?: string | null;
    avatar_crop?: AvatarCrop | null;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" };

export function Avatar({ profile, size = "md", className = "" }: AvatarProps) {
  const name = displayName(profile);
  const crop = "avatar_crop" in profile ? profile.avatar_crop : null;
  const style = avatarStyle(profile.avatar_url, crop);
  const accentStyle = getAvatarStyle(profile);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${SIZES[size]} ${className}`}
      style={accentStyle}
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" className="h-full w-full" style={style} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

export { displayName };
