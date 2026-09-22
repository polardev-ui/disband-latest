"use client";

import { useEffect, useState } from "react";
import { displayName, avatarStyle, type AvatarCrop } from "@/lib/utils";
import { getAvatarStyle, type ProfileAccentFields } from "@/lib/profileColor";
import { safeImageUrl } from "@/lib/safe-url";
import { getCachedAvatarUrl, storeAvatar } from "@/lib/avatar-cache";
import { effectClass } from "@/lib/shop";
import { AvatarDecoration } from "@/components/shop/AvatarDecoration";

interface AvatarProps {
  profile: ProfileAccentFields & {
    avatar_url?: string | null;
    display_name?: string | null;
    username?: string | null;
    avatar_crop?: AvatarCrop | null;
    /** Shop ring the owner is wearing; drawn around every avatar of theirs. */
    equipped_ring_effect?: string | null;
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
  const remote = safeImageUrl(profile.avatar_url);
  const ring = effectClass(profile.equipped_ring_effect);

  const [cachedSrc, setCachedSrc] = useState<string | null>(null);
  useEffect(() => {
    setCachedSrc(null);
    if (!remote) return;
    let live = true;
    void getCachedAvatarUrl(remote).then((hit) => {
      if (!live) return;
      if (hit) {
        setCachedSrc(hit);
      } else {
        void storeAvatar(remote);
      }
    });
    return () => {
      live = false;
    };
  }, [remote]);

  const inner = (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${SIZES[size]} ${ring ? "" : className}`}
      style={accentStyle}
    >
      {remote ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cachedSrc ?? remote} alt="" className="h-full w-full" style={style} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );

  // The ring is a wrapper rather than a border on the avatar itself: it has to
  // sit outside the rounded clip, and it carries its own hover state. A drawn
  // decoration mounts in the same wrapper, above the image.
  const decoration = <AvatarDecoration itemId={profile.equipped_ring_effect} />;
  if (!ring) {
    if (!profile.equipped_ring_effect) return inner;
    return (
      <span className={`fx-ring relative ${className}`}>
        {inner}
        {decoration}
      </span>
    );
  }
  return (
    <span className={`fx-ring ${ring} ${className}`}>
      {inner}
      {decoration}
    </span>
  );
}

export { displayName };
