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
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
  // Profile cards. A size of its own rather than `lg` plus an override class:
  // two height utilities on one element resolve by stylesheet order, not by
  // the order they're written in, so the override silently lost.
  xl: "h-[92px] w-[92px] text-3xl",
};

export function Avatar({ profile, size = "md", className = "" }: AvatarProps) {
  const name = displayName(profile);
  const crop = "avatar_crop" in profile ? profile.avatar_crop : null;
  const style = avatarStyle(profile.avatar_url, crop);
  const accentStyle = getAvatarStyle(profile);
  const remote = safeImageUrl(profile.avatar_url);
  const ring = effectClass(profile.equipped_ring_effect);

  const [cachedSrc, setCachedSrc] = useState<string | null>(null);
  // A dead URL (deleted object, offline host) used to leave the browser's
  // broken-image glyph. Falling back to the initial keeps the avatar looking
  // intentional; reset when the source changes so a new avatar can load.
  const [imgFailed, setImgFailed] = useState(false);
  // A failure used to stick for the session, so one dropped request (a busy
  // member list asks for dozens at once) left that person as an initial.
  // Now a bad cached copy falls back to the original, and the original gets
  // two more tries a few seconds apart.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!imgFailed || attempt >= 2) return;
    const t = window.setTimeout(() => {
      setAttempt((n) => n + 1);
      setImgFailed(false);
    }, 2500 * (attempt + 1));
    return () => window.clearTimeout(t);
  }, [imgFailed, attempt]);
  useEffect(() => {
    setCachedSrc(null);
    setImgFailed(false);
    setAttempt(0);
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

  /*
   Sizing. A caller's own h-/w- classes replace the preset rather than sitting
   next to it — two height utilities on one element resolve by stylesheet
   order, not by the order they're written, so the override used to lose.

   With a shop ring the avatar is wrapped, and the wrapper takes the size: the
   picture fills it. Before, the wrapper got the caller's size (say h-6) while
   the picture kept the preset (h-8), so a 32px image overflowed a 24px box and
   drawn rings like Graphite were traced around the wrong, off-centre circle —
   most visible in the typing indicator.
  */
  const presetClasses = SIZES[size].split(" ");
  const sizeOverride = /(^|\s)(h|w|size)-/.test(className);
  const textOverride = /(^|\s)text-(xs|sm|base|lg|xl|\d|\[)/.test(className);
  const presetText = textOverride ? "" : presetClasses.filter((c) => c.startsWith("text-")).join(" ");
  const presetBox = sizeOverride ? "" : presetClasses.filter((c) => !c.startsWith("text-")).join(" ");
  const wrapped = !!ring || !!profile.equipped_ring_effect;

  const inner = (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${presetText} ${
        wrapped ? "h-full w-full" : `${presetBox} ${className}`
      }`}
      style={accentStyle}
    >
      {remote && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={attempt}
          src={cachedSrc ?? remote}
          alt=""
          className="h-full w-full"
          style={style}
          onError={() => {
            if (cachedSrc) setCachedSrc(null);
            else setImgFailed(true);
          }}
        />
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
      <span className={`fx-ring relative shrink-0 ${presetBox} ${className}`}>
        {inner}
        {decoration}
      </span>
    );
  }
  return (
    <span className={`fx-ring shrink-0 ${ring} ${presetBox} ${className}`}>
      {inner}
      {decoration}
    </span>
  );
}

export { displayName };
