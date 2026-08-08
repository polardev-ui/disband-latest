"use client";

import { useApp } from "@/contexts/AppContext";
import { IconClose, IconFriends, IconPhone, IconSettings } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { SubscriptionBadge } from "@/components/ui/SubscriptionBadge";
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
  memberRoleId?: string | null;
  memberIsOwner?: boolean;
  onAssignRole?: (roleId: string | null) => void;
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
  memberRoleId,
  memberIsOwner,
  onAssignRole,
}: UserProfileModalProps) {
  const { friends, presenceMap } = useApp();
  if (!open || !profile) return null;

  const friend = friends.some((f) => f.id === profile.id);
  const panelStyle = getProfilePanelStyle(profile);
  const mutedColor = getProfilePanelMutedColor(profile);
  const title = profile.display_name?.trim() || displayName(profile);
  const live = presenceStatusFor(profile, presenceMap);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-sm overflow-hidden rounded-lg shadow-2xl">
        {profile.banner_url ? (
          <div
            className="h-28 bg-cover bg-center"
            style={{ backgroundImage: safeImageUrl(profile.banner_url) ? `url(${safeImageUrl(profile.banner_url)})` : undefined }}
          />
        ) : (
          <div className="h-20" style={{ background: getAccentBackground(profile) }} />
        )}
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60">
          <IconClose size={20} />
        </button>
        <div className={`px-4 pb-4 ${profile.banner_url ? "pt-0" : "pt-0"}`} style={panelStyle}>
          <div className="relative mb-3 inline-block -mt-12">
            <Avatar profile={profile} size="lg" className="ring-4 ring-black/20" />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5" style={{ background: panelStyle.background }}>
              <StatusIndicator status={live} size="md" />
            </span>
          </div>
          <h2 className="text-xl font-bold leading-tight">
            {title}
            {isSelf && <span className="ml-2 rounded bg-black/25 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide">You</span>}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {profile.username && (
              <p className="text-sm" style={{ color: mutedColor }}>
                @{profile.username}
              </p>
            )}
            {plan && <SubscriptionBadge plan={plan} />}
          </div>
          <div className="mt-2">
            <UserBadges profile={profile} size={17} />
          </div>
          {profile.bio && (
            <p className="mt-2 text-sm leading-snug opacity-90">{profile.bio}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: mutedColor }}>
            <StatusIndicator status={live} size="sm" showLabel />
            <span>Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          </div>

          {isSelf ? (
            onOpenSettings && (
              <button
                type="button"
                onClick={() => { onClose(); onOpenSettings(); }}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-black/35"
              >
                <IconSettings size={16} /> Edit Profile
              </button>
            )
          ) : isBlocked ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded border border-current/20 px-3 py-2 text-sm text-text-muted">Blocked</span>
              {onUnblock && (
                <button type="button" onClick={onUnblock} className="rounded bg-black/25 px-3 py-2 text-sm font-semibold backdrop-blur-sm hover:bg-black/35">
                  Unblock
                </button>
              )}
            </div>
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
              {!friend && pendingIncoming && onAcceptFriend && onDeclineFriend && (
                <>
                  <button type="button" onClick={onAcceptFriend} className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white">
                    Accept Friend Request
                  </button>
                  <button type="button" onClick={onDeclineFriend} className="rounded border border-current/30 px-3 py-2 text-sm font-semibold hover:bg-black/10">
                    Decline
                  </button>
                </>
              )}
              {!friend && !pendingIncoming && !pendingOutgoing && onAddFriend && (
                <button type="button" onClick={onAddFriend} className="rounded border border-current/30 px-3 py-2 text-sm font-semibold hover:bg-black/10">
                  Add Friend
                </button>
              )}
              {!friend && pendingOutgoing && (
                <span className="rounded border border-current/20 px-3 py-2 text-sm text-text-muted">
                  Friend request sent
                </span>
              )}
              {(isFriend || friend) && onRemoveFriend && (
                <button type="button" onClick={onRemoveFriend} className="rounded border border-current/30 px-3 py-2 text-sm font-semibold hover:bg-black/10">
                  Remove Friend
                </button>
              )}
              {onBlock && (
                <button type="button" onClick={onBlock} className="rounded border border-status-dnd/40 px-3 py-2 text-sm font-semibold text-status-dnd hover:bg-status-dnd/10">
                  Block
                </button>
              )}
            </div>
          )}

          {canManageRoles && onAssignRole && !isSelf && isServerMember && (
            <div className="mt-4 border-t border-black/15 pt-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: mutedColor }}>
                Server Role
              </p>
              {memberIsOwner ? (
                <p className="text-sm font-semibold">Server Owner</p>
              ) : (
                <select
                  value={memberRoleId ?? ""}
                  onChange={(e) => onAssignRole(e.target.value || null)}
                  className="w-full rounded bg-black/20 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">No role</option>
                  {(serverRoles ?? [])
                    .filter((r) => !r.is_default)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
