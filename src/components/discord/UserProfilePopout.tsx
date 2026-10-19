"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { useUserNote, USER_NOTE_MAX } from "@/hooks/useUserNote";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { HEADER_BADGE_LIMIT, UserBadges, useBadgeCount } from "@/components/ui/UserBadges";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { RolePicker } from "@/components/ui/RolePicker";
import { BotTag } from "@/components/ui/BotTag";
import { IconClose, IconEdit } from "@/components/icons";
import { displayName } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { getAccentBackground, usesCustomAccent } from "@/lib/profileColor";
import { activeStatusNote, listeningFor, presenceStatusFor } from "@/lib/presence";
import { OVERLAY_Z } from "@/lib/overlay";
import type { Profile, ServerRole } from "@/lib/supabase/types";
import type { SubscriptionPlan } from "@/lib/subscription";

const WIDTH = 340;
const GAP = 12;

export interface UserProfilePopoutProps {
  profile: Profile | null;
  /** The element that was clicked; the popout opens beside it. */
  anchor: DOMRect | null;
  onClose: () => void;
  onOpenFullProfile: () => void;
  onOpenSettings?: () => void;
  isSelf?: boolean;
  plan?: SubscriptionPlan;
  isServerMember?: boolean;
  memberJoinedAt?: string | null;
  serverName?: string | null;
  serverIcon?: string | null;
  serverRoles?: ServerRole[];
  memberRoleIds?: string[];
  canManageRoles?: boolean;
  onSetRoles?: (roleIds: string[]) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatElapsed(fromIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(fromIso)) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The classic profile popout: opens beside whatever was clicked (a name in
 * chat, a member in the list), with the full profile one click away.
 */
export function UserProfilePopout({
  profile,
  anchor,
  onClose,
  onOpenFullProfile,
  onOpenSettings,
  isSelf,
  plan,
  isServerMember,
  memberJoinedAt,
  serverName,
  serverIcon,
  serverRoles = [],
  memberRoleIds = [],
  canManageRoles,
  onSetRoles,
}: UserProfilePopoutProps) {
  const { presenceMap, listeningMap, user, openDmWithFriend, sendDmMessage } = useApp();
  const open = !!profile && !!anchor;
  const { mounted, exiting } = usePresence(open);
  const lastProfile = useRef<Profile | null>(null);
  if (profile) lastProfile.current = profile;
  const p = profile ?? lastProfile.current;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: "left" | "right" } | null>(null);
  const [message, setMessage] = useState("");
  const [, tick] = useState(0);
  const badgeCount = useBadgeCount(p?.id, isSelf ? plan : undefined);
  const note = useUserNote(open && !isSelf ? user?.id : null, open && !isSelf ? p?.id : null);

  useOverlayDismiss(onClose, open);

  // Place beside the anchor: to its right when it's on the left half of the
  // window, otherwise to its left; vertically aligned and kept on screen.
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const h = ref.current?.offsetHeight ?? 480;
    const onLeftHalf = anchor.left + anchor.width / 2 < window.innerWidth / 2;
    const left = onLeftHalf
      ? Math.min(anchor.right + GAP, window.innerWidth - WIDTH - 8)
      : Math.max(8, anchor.left - GAP - WIDTH);
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8));
    setPos({ left, top, side: onLeftHalf ? "right" : "left" });
  }, [open, anchor, p?.id]);

  // The listening clock ticks while it's on screen.
  const listening = p ? listeningFor(p, listeningMap) : null;
  useEffect(() => {
    if (!open || !listening) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [open, listening]);

  if (!mounted || !p || typeof document === "undefined") return null;

  const live = presenceStatusFor(p, presenceMap);
  const statusNote = activeStatusNote(p);
  const banner = safeImageUrl(p.banner_url);
  const bannerBg = usesCustomAccent(p) ? getAccentBackground(p) : p.accent_color ?? "#5865f2";
  const roles = serverRoles.filter((r) => !r.is_default && memberRoleIds.includes(r.id)).sort((a, b) => b.position - a.position);

  async function sendQuickMessage() {
    const text = message.trim();
    if (!text || !p) return;
    setMessage("");
    await openDmWithFriend(p.id);
    // The thread id settles after the open resolves; same beat as forwarding.
    window.setTimeout(() => void sendDmMessage(text), 250);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: OVERLAY_Z.contextMenu - 1 }}>
      <button type="button" aria-label="Close profile" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-label={`${displayName(p)}'s profile`}
        data-side={pos?.side ?? "right"}
        className={`profile-popout${exiting ? " profile-popout-out" : ""} absolute w-[340px] overflow-hidden rounded-lg bg-bg-secondary-alt shadow-[0_8px_16px_rgba(0,0,0,0.24),0_0_0_1px_rgba(0,0,0,0.2)]`}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
      >
        {/* Banner */}
        <div className={`relative ${banner ? "h-[120px]" : "h-[60px]"}`} style={{ background: bannerBg }}>
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        {/* Avatar, cut into the banner */}
        <button
          type="button"
          onClick={onOpenFullProfile}
          aria-label="View full profile"
          className="group/avatar absolute left-4 rounded-full bg-bg-secondary-alt p-1.5"
          style={{ top: banner ? 76 : 16 }}
        >
          <span className="relative block">
            <Avatar profile={p} size="xl" className="!h-20 !w-20 !text-2xl" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-bold uppercase text-white opacity-0 transition-opacity group-hover/avatar:opacity-100">
              View Profile
            </span>
            <StatusDot status={live} size={16} ring="var(--bg-secondary-alt)" className="absolute -bottom-0.5 -right-0.5" />
          </span>
        </button>

        {/* Badges, top right under the banner */}
        <div className="flex min-h-[44px] justify-end pl-[116px] pr-4 pt-3">
          {badgeCount > 0 && badgeCount <= HEADER_BADGE_LIMIT && (
            <span className="rounded-lg bg-bg-floating p-1">
              <UserBadges userId={p.id} plan={isSelf ? plan : undefined} size={22} variant="full" className="justify-end" />
            </span>
          )}
        </div>

        {/* Inner card */}
        <div className="mx-4 mb-4 mt-7 rounded-lg bg-bg-floating p-3">
          <div className="flex items-center gap-1">
            <h2 className="min-w-0 truncate text-[20px] font-semibold leading-6 text-header-primary">{displayName(p)}</h2>
            <BotTag profile={p} size="sm" />
          </div>
          <p className="text-[14px] leading-[18px] text-header-primary">
            {p.username ?? ""}
            {p.pronouns?.trim() && <span className="text-header-secondary"> • {p.pronouns.trim()}</span>}
          </p>
          {badgeCount > HEADER_BADGE_LIMIT && (
            <UserBadges userId={p.id} plan={isSelf ? plan : undefined} size={22} variant="full" className="mt-2" />
          )}
          {statusNote && <p className="mt-1.5 text-[14px] leading-[18px] text-text-normal">{statusNote}</p>}

          <div className="my-3 h-px bg-[#2e2f34]" />

          {p.bio?.trim() && (
            <Section title="About Me">
              <p className="line-clamp-6 whitespace-pre-wrap break-words text-[14px] leading-[18px] text-text-normal">{p.bio.trim()}</p>
            </Section>
          )}

          <Section title="Member Since">
            <div className="flex items-center gap-2 text-[14px] leading-[18px] text-text-normal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-4 w-4 object-contain opacity-80" title="Disband" />
              <span>{formatDate(p.created_at)}</span>
              {isServerMember && memberJoinedAt && (
                <>
                  <span className="h-1 w-1 rounded-full bg-[#4e5058]" />
                  {serverIcon && safeImageUrl(serverIcon) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={safeImageUrl(serverIcon)!} alt="" className="h-4 w-4 rounded-full object-cover" title={serverName ?? undefined} />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-secondary text-[7px] font-bold" title={serverName ?? undefined}>
                      {(serverName ?? "?").slice(0, 1)}
                    </span>
                  )}
                  <span>{formatDate(memberJoinedAt)}</span>
                </>
              )}
            </div>
          </Section>

          {listening && (
            <Section
              title={`Listening to ${listening.source === "spotify" ? "Spotify" : listening.source === "soundcloud" ? "SoundCloud" : "Last.fm"}`}
              aside={
                listening.source === "spotify" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="text-[#1db954]">
                    <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.62.62 0 0 1-.86.2c-2.35-1.43-5.3-1.76-8.78-.96a.62.62 0 1 1-.28-1.22c3.8-.87 7.07-.5 9.7 1.12.3.18.4.57.21.86Zm1.22-2.73a.78.78 0 0 1-1.07.26c-2.69-1.65-6.78-2.13-9.96-1.17a.78.78 0 1 1-.45-1.49c3.63-1.1 8.14-.57 11.22 1.33.37.22.48.7.26 1.07Zm.1-2.84C14.7 8.92 9.37 8.75 6.29 9.68a.94.94 0 1 1-.54-1.8c3.53-1.07 9.41-.86 13.12 1.34a.94.94 0 0 1-.96 1.61Z" />
                  </svg>
                ) : null
              }
            >
              <div className="flex items-center gap-2.5">
                {listening.artwork && safeImageUrl(listening.artwork) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={safeImageUrl(listening.artwork)!} alt="" className="h-[60px] w-[60px] shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-[60px] w-[60px] shrink-0 rounded-lg bg-bg-secondary" />
                )}
                <div className="min-w-0 text-[14px] leading-[18px]">
                  <p className="truncate font-semibold text-header-primary">{listening.track}</p>
                  <p className="truncate text-text-normal">by {listening.artists}</p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-text-muted">{formatElapsed(listening.started_at)} elapsed</p>
                </div>
              </div>
              {listening.track_url && (
                <a
                  href={listening.track_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2.5 flex h-8 items-center justify-center gap-1.5 rounded-[3px] bg-button-secondary text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover"
                >
                  Play on {listening.source === "spotify" ? "Spotify" : listening.source === "soundcloud" ? "SoundCloud" : "Last.fm"}
                </a>
              )}
            </Section>
          )}

          {isServerMember && (roles.length > 0 || canManageRoles) && (
            <Section title={roles.length === 1 ? "Role" : "Roles"}>
              <div className="flex flex-wrap gap-1">
                {roles.map((r) => (
                  <span key={r.id} className="group/role inline-flex h-[22px] items-center gap-1 rounded-[4px] bg-bg-secondary px-1.5 text-[12px] font-medium text-text-normal">
                    {canManageRoles && onSetRoles ? (
                      <button
                        type="button"
                        aria-label={`Remove ${r.name}`}
                        onClick={() => onSetRoles(memberRoleIds.filter((id) => id !== r.id))}
                        className="relative flex h-3 w-3 items-center justify-center rounded-full"
                        style={{ backgroundColor: r.color }}
                      >
                        <IconClose size={8} className="text-black/70 opacity-0 group-hover/role:opacity-100" />
                      </button>
                    ) : (
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                    )}
                    {r.icon && <RoleIcon icon={r.icon} name={r.name} size={14} />}
                    {r.name}
                  </span>
                ))}
                {canManageRoles && onSetRoles && (
                  <RolePicker
                    roles={serverRoles.filter((r) => !r.is_default)}
                    selected={memberRoleIds}
                    onToggle={(id) =>
                      onSetRoles(memberRoleIds.includes(id) ? memberRoleIds.filter((x) => x !== id) : [...memberRoleIds, id])
                    }
                    compact
                  />
                )}
              </div>
            </Section>
          )}

          {!isSelf && note.state !== "unavailable" && (
            <Section title="Note">
              <textarea
                value={note.note}
                onChange={(e) => note.setNote(e.target.value.slice(0, USER_NOTE_MAX))}
                onBlur={() => void note.save()}
                disabled={note.state === "loading"}
                rows={1}
                placeholder="Click to add a note"
                className="-mx-1 block min-h-[30px] w-[calc(100%+8px)] resize-none rounded-[3px] bg-transparent px-1 py-1.5 text-[12px] leading-4 text-text-normal outline-none placeholder:text-text-muted focus:bg-bg-tertiary"
              />
            </Section>
          )}

          {isSelf ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings?.();
              }}
              className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-[3px] bg-button-secondary text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover"
            >
              <IconEdit size={16} /> Edit Profile
            </button>
          ) : (
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuickMessage();
                }
              }}
              placeholder={`Message @${p.username ?? displayName(p)}`}
              aria-label={`Message ${displayName(p)}`}
              className="mt-1 h-10 w-full rounded-[3px] border border-bg-tertiary bg-transparent px-2.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-primary">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
