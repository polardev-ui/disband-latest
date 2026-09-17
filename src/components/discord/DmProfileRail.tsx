"use client";

import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { UserBadges } from "@/components/ui/UserBadges";
import { IconClose, IconFriends, IconPhone } from "@/components/icons";
import { displayName } from "@/lib/utils";
import {
  activeStatusNote,
  presenceStatusFor,
  statusExpiryLabel,
} from "@/lib/presence";
import {
  getProfilePanelMutedColor,
  getProfilePanelStyle,
  getAccentBackground,
} from "@/lib/profileColor";
import { safeImageUrl } from "@/lib/safe-url";
import { useState } from "react";
import type { Profile } from "@/lib/supabase/types";

interface DmProfileRailProps {
  friend: Profile;
  onClose: () => void;
  onVoiceCall: () => void;
  onOpenFullProfile: () => void;
}

export function DmProfileRail({ friend, onClose, onVoiceCall, onOpenFullProfile }: DmProfileRailProps) {
  const { presenceMap } = useApp();
  const [bannerFailed, setBannerFailed] = useState(false);
  const panelStyle = getProfilePanelStyle(friend);
  const mutedColor = getProfilePanelMutedColor(friend);
  const live = presenceStatusFor(friend, presenceMap);
  const note = activeStatusNote(friend);
  const bannerUrl = safeImageUrl(friend.banner_url);

  return (
    <aside
      aria-label={`${displayName(friend)}'s profile`}
      className="flex min-h-0 w-72 shrink-0 flex-col overflow-y-auto border-l border-divider"
      style={panelStyle}
    >
      <div className="relative h-20 shrink-0" style={{ background: getAccentBackground(friend) }}>
        {bannerUrl && !bannerFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBannerFailed(true)}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide profile panel"
          className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
        >
          <IconClose size={16} />
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="relative -mt-9 mb-2 w-fit">
          <Avatar profile={friend} size="lg" className="ring-4 ring-black/25" />
          <span
            className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5"
            style={{ background: panelStyle.background }}
          >
            <StatusIndicator status={live} size="md" />
          </span>
        </div>

        <h2 className="text-lg font-bold leading-tight">{displayName(friend)}</h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {friend.username && (
            <p className="text-[13px]" style={{ color: mutedColor }}>
              @{friend.username}
            </p>
          )}
          {friend.pronouns?.trim() && (
            <span className="rounded bg-brand/20 px-1.5 py-px text-[11px] font-semibold text-brand">
              {friend.pronouns.trim()}
            </span>
          )}
        </div>

        <div className="mt-1.5">
          <UserBadges userId={friend.id} plan="free" size={16} variant="full" />
        </div>

        {note && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-black/20 px-2.5 py-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 opacity-70">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div className="min-w-0">
              <p className="break-words text-[13px] leading-snug">{note}</p>
              <p className="mt-0.5 text-[11px] opacity-60">
                {statusExpiryLabel(friend.status_expires_at)}
              </p>
            </div>
          </div>
        )}

        {friend.bio?.trim() && (
          <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-snug opacity-90">
            {friend.bio.trim()}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: mutedColor }}>
          <StatusIndicator status={live} size="sm" showLabel />
          <span>
            Member since{" "}
            {new Date(friend.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={onVoiceCall}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-status-online px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <IconPhone size={16} /> Voice Call
          </button>
          <button
            type="button"
            onClick={onOpenFullProfile}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-black/35"
          >
            <IconFriends size={16} /> Full Profile
          </button>
        </div>
      </div>
    </aside>
  );
}
