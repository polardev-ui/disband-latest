"use client";

import { useApp } from "@/contexts/AppContext";
import { IconClose, IconFriends, IconPhone, IconSettings } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { getProfilePanelMutedColor, getProfilePanelStyle } from "@/lib/profileColor";
import { displayName } from "@/lib/utils";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import type { Profile } from "@/lib/supabase/types";

interface UserProfileModalProps {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
  onMessage?: () => void;
  onAddFriend?: () => void;
  onVoiceCall?: () => void;
  onOpenSettings?: () => void;
  isFriend?: boolean;
  isSelf?: boolean;
}

export function UserProfileModal({
  profile,
  open,
  onClose,
  onMessage,
  onAddFriend,
  onVoiceCall,
  onOpenSettings,
  isFriend,
  isSelf,
}: UserProfileModalProps) {
  const { friends } = useApp();
  if (!open || !profile) return null;

  const friend = friends.some((f) => f.id === profile.id);
  const panelStyle = getProfilePanelStyle(profile);
  const mutedColor = getProfilePanelMutedColor(profile);
  const title = profile.display_name?.trim() || displayName(profile);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-sm overflow-hidden rounded-lg shadow-2xl">
        {profile.banner_url && (
          <div
            className="h-24 bg-cover bg-center"
            style={{ backgroundImage: `url(${profile.banner_url})` }}
          />
        )}
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60">
          <IconClose size={20} />
        </button>
        <div className={`px-4 pb-4 ${profile.banner_url ? "pt-0" : "pt-3"}`} style={panelStyle}>
          <div className={`relative mb-3 inline-block ${profile.banner_url ? "-mt-12" : ""}`}>
            <Avatar profile={profile} size="lg" className="ring-4 ring-black/20" />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5" style={{ background: panelStyle.background }}>
              <StatusIndicator status={profile.status} size="md" />
            </span>
          </div>
          <h2 className="text-xl font-bold leading-tight">{title}</h2>
          {profile.username && (
            <p className="text-sm" style={{ color: mutedColor }}>
              @{profile.username}
            </p>
          )}
          {profile.bio && (
            <p className="mt-2 text-sm leading-snug opacity-90">{profile.bio}</p>
          )}
          <div className="mt-2">
            <StatusIndicator status={profile.status} size="sm" showLabel />
          </div>

          {isSelf ? (
            onOpenSettings && (
              <button
                type="button"
                onClick={() => { onClose(); onOpenSettings(); }}
                className="mt-4 flex items-center gap-1 rounded bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm hover:bg-black/35"
              >
                <IconSettings size={16} /> Edit Profile
              </button>
            )
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {(isFriend || friend) && onMessage && (
                <button type="button" onClick={onMessage} className="flex items-center gap-1 rounded bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm hover:bg-black/35">
                  <IconFriends size={16} /> Message
                </button>
              )}
              {onVoiceCall && (isFriend || friend) && (
                <button type="button" onClick={onVoiceCall} className="flex items-center gap-1 rounded bg-status-online px-3 py-2 text-sm font-semibold text-white">
                  <IconPhone size={16} /> Voice Call
                </button>
              )}
              {!friend && onAddFriend && (
                <button type="button" onClick={onAddFriend} className="rounded border border-current/30 px-3 py-2 text-sm font-semibold hover:bg-black/10">
                  Add Friend
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
