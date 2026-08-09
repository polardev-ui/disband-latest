"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { IconClose, IconFriends, IconPhone, IconSettings } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { SubscriptionBadge } from "@/components/ui/SubscriptionBadge";
import { RolePicker } from "@/components/ui/RolePicker";
import { getProfilePanelMutedColor, getProfilePanelStyle, getAccentBackground } from "@/lib/profileColor";
import { displayName } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { presenceStatusFor } from "@/lib/presence";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { UserBadges } from "@/components/ui/UserBadges";
import type { Profile, ServerRole } from "@/lib/supabase/types";

interface UserProfileModalProps {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
  onMessage?: () => void;
  onAddFriend?: () => void;
  onAcceptFriend?: () => void;
  onDeclineFriend?: () => void;
  onVoiceCall?: () => void;
  onOpenSettings?: () => void;
  onRemoveFriend?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  isFriend?: boolean;
  isBlocked?: boolean;
  pendingIncoming?: boolean;
  pendingOutgoing?: boolean;
  isSelf?: boolean;
  plan?: "free" | "basic" | "super";
  isServerMember?: boolean;
  serverRoles?: ServerRole[];
  canManageRoles?: boolean;
  memberRoleIds?: string[];
  memberIsOwner?: boolean;
  onSetRoles?: (roleIds: string[]) => void;
}

/**
 * Profile banner with a graceful fallback.
 *
 * Previously a broken image URL rendered a blank strip (a background-image div
 * fails silently), which is exactly the "banner missing for some people" bug.
 * The accent gradient always sits underneath, and the image is an <img> with an
 * onError fallback, so any load failure degrades to the user's accent colour
 * instead of nothing.
 */
function ProfileBanner({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  const url = safeImageUrl(profile.banner_url);
  const show = url && !failed;
  return (
    <div
      className="h-24 w-full overflow-hidden rounded-t-xl"
      style={{ background: getAccentBackground(profile) }}
    >
      {show && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url!} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

export function UserProfileModal({
  profile,
  open,
  onClose,
  onMessage,
  onAddFriend,
  onAcceptFriend,
  onDeclineFriend,
  onVoiceCall,
  onOpenSettings,
  onRemoveFriend,
  onBlock,
  onUnblock,
  isFriend,
  isBlocked,
  pendingIncoming,
  pendingOutgoing,
  isSelf,
  plan,
  isServerMember,
  serverRoles,
  canManageRoles,
  memberRoleIds = [],
  memberIsOwner,
  onSetRoles,
}: UserProfileModalProps) {
  const { friends, presenceMap } = useApp();
  if (!open || !profile) return null;

  const friend = friends.some((f) => f.id === profile.id);
  const panelStyle = getProfilePanelStyle(profile);
  const mutedColor = getProfilePanelMutedColor(profile);
  const title = profile.display_name?.trim() || displayName(profile);
  const live = presenceStatusFor(profile, presenceMap);

  const memberRoles = (serverRoles ?? []).filter((r) => memberRoleIds.includes(r.id));
  const assignableRoles = (serverRoles ?? []).filter((r) => !r.is_default);

  const toggleRole = (roleId: string) => {
    if (!onSetRoles) return;
    const next = memberRoleIds.includes(roleId)
      ? memberRoleIds.filter((id) => id !== roleId)
      : [...memberRoleIds, roleId];
    onSetRoles(next);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      {/* No overflow-hidden on the card: the role picker's dropdown must be
          able to escape it. The banner handles its own rounded top corners. */}
      <div className="relative w-full max-w-sm rounded-xl shadow-2xl" style={panelStyle}>
        <ProfileBanner profile={profile} />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
          aria-label="Close profile"
        >
          <IconClose size={20} />
        </button>

        <div className="px-5 pb-5">
          <div className="relative -mt-11 mb-3 w-fit">
            <Avatar profile={profile} size="lg" className="ring-4 ring-black/25" />
            <span
              className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5"
              style={{ background: panelStyle.background }}
            >
              <StatusIndicator status={live} size="md" />
            </span>
          </div>

          <h2 className="text-xl font-bold leading-tight">
            {title}
            {isSelf && (
              <span className="ml-2 rounded bg-black/25 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide">
                You
              </span>
            )}
          </h2>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {profile.username && (
              <p className="text-sm" style={{ color: mutedColor }}>
                @{profile.username}
              </p>
            )}
            {plan && <SubscriptionBadge plan={plan} />}
          </div>

          <div className="mt-1.5">
            <UserBadges profile={profile} size={17} />
          </div>

          {profile.bio && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-snug opacity-90">{profile.bio}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: mutedColor }}>
            <StatusIndicator status={live} size="sm" showLabel />
            <span>
              Member since{" "}
              {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </div>

          {isServerMember && !isSelf && (
            <div className="mt-4 border-t border-black/15 pt-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: mutedColor }}>
                Roles
              </p>
              {memberIsOwner ? (
                <p className="text-sm font-semibold">Server Owner</p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {memberRoles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold"
                      style={{ backgroundColor: `${role.color}2e`, color: role.color }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />
                      {role.name}
                    </span>
                  ))}
                  {memberRoles.length === 0 && !canManageRoles && (
                    <p className="text-xs" style={{ color: mutedColor }}>
                      No roles assigned.
                    </p>
                  )}
                  {canManageRoles && onSetRoles && (
                    <RolePicker
                      roles={assignableRoles}
                      selected={memberRoleIds}
                      onToggle={toggleRole}
                      compact
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {isSelf ? (
            onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-black/35"
              >
                <IconSettings size={16} /> Edit Profile
              </button>
            )
          ) : isBlocked ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-lg border border-black/25 px-3 py-2 text-sm text-text-muted">Blocked</span>
              {onUnblock && (
                <button
                  type="button"
                  onClick={onUnblock}
                  className="rounded-lg bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-black/35"
                >
                  Unblock
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {(isFriend || friend) && onMessage && (
                <button
                  type="button"
                  onClick={onMessage}
                  className="flex items-center gap-1.5 rounded-lg bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-black/35"
                >
                  <IconFriends size={16} /> Message
                </button>
              )}
              {onVoiceCall && (isFriend || friend) && (
                <button
                  type="button"
                  onClick={onVoiceCall}
                  className="flex items-center gap-1.5 rounded-lg bg-status-online px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                >
                  <IconPhone size={16} /> Voice Call
                </button>
              )}
              {!friend && pendingIncoming && onAcceptFriend && onDeclineFriend && (
                <>
                  <button
                    type="button"
                    onClick={onAcceptFriend}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                  >
                    Accept Friend Request
                  </button>
                  <button
                    type="button"
                    onClick={onDeclineFriend}
                    className="rounded-lg border border-black/30 px-3 py-2 text-sm font-semibold transition-colors hover:bg-black/10"
                  >
                    Decline
                  </button>
                </>
              )}
              {!friend && !pendingIncoming && !pendingOutgoing && onAddFriend && (
                <button
                  type="button"
                  onClick={onAddFriend}
                  className="rounded-lg border border-black/30 px-3 py-2 text-sm font-semibold transition-colors hover:bg-black/10"
                >
                  Add Friend
                </button>
              )}
              {!friend && pendingOutgoing && (
                <span className="rounded-lg border border-black/25 px-3 py-2 text-sm text-text-muted">
                  Friend request sent
                </span>
              )}
              {(isFriend || friend) && onRemoveFriend && (
                <button
                  type="button"
                  onClick={onRemoveFriend}
                  className="rounded-lg border border-black/30 px-3 py-2 text-sm font-semibold transition-colors hover:bg-black/10"
                >
                  Remove Friend
                </button>
              )}
              {onBlock && (
                <button
                  type="button"
                  onClick={onBlock}
                  className="rounded-lg border border-status-dnd/40 px-3 py-2 text-sm font-semibold text-status-dnd transition-colors hover:bg-status-dnd/10"
                >
                  Block
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
