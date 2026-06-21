"use client";

import { useApp } from "@/contexts/AppContext";
import { IconClose, IconFriends, IconPhone, IconSettings } from "@/components/icons";
import { Avatar, displayName } from "@/components/ui/Avatar";
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

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-sm overflow-hidden rounded-lg bg-bg-primary shadow-2xl">
        <div
          className="h-32 bg-cover bg-center"
          style={{
            backgroundColor: profile.accent_color ?? "#5865f2",
            backgroundImage: profile.banner_url ? `url(${profile.banner_url})` : undefined,
          }}
        />
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60">
          <IconClose size={20} />
        </button>
        <div className="px-4 pb-4">
          <div className="relative -mt-12 mb-2 inline-block">
            <Avatar profile={profile} size="lg" className="ring-4 ring-bg-primary" />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-bg-primary p-0.5">
              <StatusIndicator status={profile.status} size="md" />
            </span>
          </div>
          <h2 className="text-xl font-bold leading-tight" style={{ color: profile.accent_color ?? undefined }}>
            {displayName(profile)}
          </h2>
          {profile.username && <p className="text-sm text-text-muted">@{profile.username}</p>}
          {profile.bio && <p className="mt-2 text-sm leading-snug text-text-normal">{profile.bio}</p>}
          <div className="mt-2">
            <StatusIndicator status={profile.status} size="sm" showLabel />
          </div>

          {isSelf ? (
            onOpenSettings && (
              <button
                type="button"
                onClick={() => { onClose(); onOpenSettings(); }}
                className="mt-4 flex items-center gap-1 rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                <IconSettings size={16} /> Edit Profile
              </button>
            )
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {(isFriend || friend) && onMessage && (
                <button type="button" onClick={onMessage} className="flex items-center gap-1 rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
                  <IconFriends size={16} /> Message
                </button>
              )}
              {onVoiceCall && (isFriend || friend) && (
                <button type="button" onClick={onVoiceCall} className="flex items-center gap-1 rounded bg-status-online px-3 py-2 text-sm font-semibold text-white">
                  <IconPhone size={16} /> Voice Call
                </button>
              )}
              {!friend && onAddFriend && (
                <button type="button" onClick={onAddFriend} className="rounded border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10">
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
