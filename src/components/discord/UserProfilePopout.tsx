"use client";

import { AuthorizeAppButton } from "@/components/ui/AuthorizeAppButton";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { Avatar } from "@/components/ui/Avatar";
import { GuildTag } from "@/components/ui/GuildTag";
import { ListeningCard } from "@/components/ui/ListeningCard";
import { ActivityCard } from "@/components/ui/ActivityCard";
import { activityFor } from "@/lib/activity";
import { StatusDot } from "@/components/ui/StatusDot";
import { HEADER_BADGE_LIMIT, UserBadges, useBadgeCount } from "@/components/ui/UserBadges";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { RolePicker } from "@/components/ui/RolePicker";
import { BotTag } from "@/components/ui/BotTag";
import { IconClose, IconEdit, IconUserPlus } from "@/components/icons";
import { displayName } from "@/lib/utils";
import { NAME_FONT_CLASS, type NameFontId } from "@/lib/nameFonts";
import { safeImageUrl } from "@/lib/safe-url";
import { getAccentBackground, getProfileCardTheme, usesCustomAccent } from "@/lib/profileColor";
import { activeStatusNote, listeningFor, presenceStatusFor } from "@/lib/presence";
import { OVERLAY_Z } from "@/lib/overlay";
import { ArtPanel, ProfileOverlay, SkinFloor } from "@/components/shop/ProfileOverlay";
import type { Profile, ServerRole } from "@/lib/supabase/types";
import type { SubscriptionPlan } from "@/lib/subscription";
import { useI18n } from "@/contexts/I18nContext";

const WIDTH = 340;
const GAP = 12;
const BOTTOM_MARGIN = 72;

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
  /** Their roles are still loading: hold the section's place. */
  rolesPending?: boolean;
  memberJoinedAt?: string | null;
  serverName?: string | null;
  serverIcon?: string | null;
  serverRoles?: ServerRole[];
  /** Roles the signed-in member is allowed to hand out (already rank-filtered). */
  assignableRoles?: ServerRole[];
  memberRoleIds?: string[];
  canManageRoles?: boolean;
  onSetRoles?: (roleIds: string[]) => void;
  /** Roles staff have marked safe for members to choose themselves. */
  selfAssignableRoles?: ServerRole[];
  onSetSelfRoles?: (roleIds: string[]) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  rolesPending,
  memberJoinedAt,
  serverName,
  serverIcon,
  serverRoles = [],
  assignableRoles,
  memberRoleIds = [],
  canManageRoles,
  onSetRoles,
  selfAssignableRoles = [],
  onSetSelfRoles,
}: UserProfilePopoutProps) {
  const { t } = useI18n();
  const {
    presenceMap, listeningMap, activityMap, user, openDmWithFriend, sendDmMessage,
    friends, dmThreads, pendingOutgoing, sendFriendRequest,
  } = useApp();
  const open = !!profile && !!anchor;
  const { mounted, exiting } = usePresence(open);
  const lastProfile = useRef<Profile | null>(null);
  if (profile) lastProfile.current = profile;
  const p = profile ?? lastProfile.current;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: "left" | "right" } | null>(null);
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const badgeCount = useBadgeCount(p?.id, isSelf ? plan : undefined);
  const [friendNote, setFriendNote] = useState<string | null>(null);

  // Strangers can only be messaged as a request, and only when you share a
  // space other than Disband itself (everyone is in that one). Checked up
  // front so the card offers Add Friend instead of a box that can't send.
  const targetId = open && p && !isSelf && !p.is_bot ? p.id : null;
  const knownContact = !!targetId && (friends.some((f) => f.id === targetId) || dmThreads.some((d) => d.friend?.id === targetId));
  // Asked of the server, which applies the same rule when the DM opens
  // (including Disband's staff being able to reach its members).
  const [canRequest, setCanRequest] = useState<{ id: string; ok: boolean } | null>(null);
  useEffect(() => {
    setFriendNote(null);
    if (!targetId || knownContact) return;
    let live = true;
    void getSupabaseClient()
      .rpc("can_request_dm", { p_user_id: targetId })
      .then(({ data, error }) => {
        // On error leave the box: the send reports the real reason.
        if (live && !error) setCanRequest({ id: targetId, ok: data === true });
      });
    return () => {
      live = false;
    };
  }, [targetId, knownContact]);
  const friendsOnly = !!targetId && !knownContact && canRequest?.id === targetId && !canRequest.ok;
  const requestSent = !!targetId && pendingOutgoing.some((f) => f.addressee_id === targetId);
  // The banner's Add Friend button: anyone you aren't friends with yet.
  const isFriend = !!targetId && friends.some((f) => f.id === targetId);
  const canAddFriend = !!targetId && !isFriend && !!p?.username;
  const [addingFriend, setAddingFriend] = useState(false);

  useOverlayDismiss(onClose, open);

  // Place beside the anchor: to its right when it's on the left half of the
  // window, otherwise to its left; vertically aligned and kept on screen.
  // Re-placed whenever the card changes height (badges, roles and notes load
  // after it opens) or the window resizes, so it never runs off the bottom.
  // Waits for `mounted`: usePresence renders the card a beat after `open`,
  // and running before that measured nothing and never attached the
  // observer, so a card opened from closed stayed placed for a 480px guess.
  useLayoutEffect(() => {
    if (!open || !anchor || !mounted) return;
    const place = () => {
      // A roomy bottom margin: on macOS the window often runs behind the Dock,
      // so "just inside the viewport" can still be hidden.
      const h = Math.min(ref.current?.offsetHeight ?? 480, window.innerHeight - BOTTOM_MARGIN - 8);
      const onLeftHalf = anchor.left + anchor.width / 2 < window.innerWidth / 2;
      const left = onLeftHalf
        ? Math.max(8, Math.min(anchor.right + GAP, window.innerWidth - WIDTH - 8))
        : Math.max(8, anchor.left - GAP - WIDTH);
      const top = Math.max(8, Math.min(anchor.top, window.innerHeight - h - BOTTOM_MARGIN));
      setPos((prev) =>
        prev && prev.left === left && prev.top === top ? prev : { left, top, side: onLeftHalf ? "right" : "left" },
      );
    };
    place();
    const el = ref.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(place) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open, anchor, p?.id, mounted]);

  const listening = p && presenceStatusFor(p, presenceMap) !== "offline" ? listeningFor(p, listeningMap) : null;
  const activity = p ? activityFor(p, activityMap) : null;

  if (!mounted || !p || typeof document === "undefined") return null;

  const live = presenceStatusFor(p, presenceMap);
  const statusNote = activeStatusNote(p);
  const banner = safeImageUrl(p.banner_url);
  const bannerBg = usesCustomAccent(p) ? getAccentBackground(p) : p.accent_color ?? "#5865f2";
  const theme = getProfileCardTheme(p);
  const art = !!p.equipped_overlay_effect;
  const roles = serverRoles.filter((r) => !r.is_default && memberRoleIds.includes(r.id)).sort((a, b) => b.position - a.position);
  const selfRoles = selfAssignableRoles.filter((r) => !r.is_default);
  const selfRoleIds = memberRoleIds.filter((id) => selfRoles.some((r) => r.id === id));
  const canPickSelfRoles = isSelf && !canManageRoles && !!onSetSelfRoles && selfRoles.length > 0;

  async function sendQuickMessage() {
    const text = message.trim();
    if (!text || !p) return;
    setMessage("");
    const err = await openDmWithFriend(p.id);
    if (err) {
      // Never send: the open failed, so the active DM is someone else's.
      setMessage(text);
      setSendError(/share a space with/.test(err) ? t("Add {name} as a friend to message them.", { name: displayName(p) }) : err);
      return;
    }
    // The thread id settles after the open resolves; same beat as forwarding.
    window.setTimeout(() => void sendDmMessage(text), 250);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: OVERLAY_Z.contextMenu - 1 }}>
      <button type="button" aria-label={t("Close profile")} className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-label={t("{name}'s profile", { name: displayName(p) })}
        data-side={pos?.side ?? "right"}
        className={`profile-popout${exiting ? " profile-popout-out" : ""} fx-overlay-host absolute isolate flex max-h-[calc(100dvh-80px)] w-[340px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border ${theme ? "border-white/10" : "border-border-subtle bg-bg-floating"} text-text-normal shadow-[var(--elevation-high)]`}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden", ...theme?.style }}
      >
        {/* The equipped profile effect: over the banner, under the profile,
            and holding still while the card scrolls beneath it. */}
        <ProfileOverlay itemId={p.equipped_overlay_effect} />
        <div className="relative min-h-0 overflow-y-auto">
          {/* Banner */}
          <div className={`relative overflow-hidden ${banner ? "h-[120px]" : "h-[60px]"}`} style={{ background: bannerBg }}>
            {banner && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
                {theme && <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: theme.bannerTint }} />}
              </>
            )}
            {canAddFriend && (
              <button
                type="button"
                disabled={requestSent || addingFriend}
                onClick={async () => {
                  if (!p.username) return;
                  setAddingFriend(true);
                  const err = await sendFriendRequest(p.username);
                  setAddingFriend(false);
                  setFriendNote(err);
                }}
                title={requestSent ? t("Friend Request Sent") : t("Add Friend")}
                aria-label={requestSent ? t("Friend Request Sent") : t("Add Friend")}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-black/65 disabled:cursor-default"
              >
                {requestSent ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <IconUserPlus size={17} />
                )}
              </button>
            )}
          </div>

          {/* Avatar, cut into the banner. Above the badges row (z-20): that
              row spans the card's width and covered the avatar's lower half,
              so only the top half could be clicked. */}
          <button
            type="button"
            onClick={onOpenFullProfile}
            aria-label={t("View full profile")}
            className={`group/avatar absolute left-4 z-20 rounded-full p-1.5 ${theme ? "" : "bg-bg-floating"}`}
            style={{ top: banner ? 76 : 16, backgroundColor: theme?.avatarRing }}
          >
            <span className="relative block">
              <Avatar profile={p} size="xl" className="!h-20 !w-20 !text-2xl" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-bold uppercase text-white opacity-0 transition-opacity group-hover/avatar:opacity-100">
                {t("View Profile")}
              </span>
              <StatusDot
                status={live}
                size={16}
                ring={theme?.avatarRing ?? "var(--bg-secondary-alt)"}
                className="absolute -bottom-0.5 -right-0.5"
              />
            </span>
          </button>

          {/* Badges, top right under the banner */}
          <div className="relative z-10 flex min-h-[44px] justify-end pl-[116px] pr-4 pt-3">
            {badgeCount > 0 && badgeCount <= HEADER_BADGE_LIMIT && (
              <span className="rounded-lg bg-bg-floating p-1">
                <UserBadges userId={p.id} plan={isSelf ? plan : undefined} size={22} variant="full" className="justify-end" />
              </span>
            )}
          </div>

          {/* Inner card */}
          <ArtPanel art={art} className={`mx-4 mb-4 mt-7 rounded-xl p-3 ${theme ? "" : "border border-border-subtle"}`} background={theme ? "bg-black/10" : "bg-bg-secondary-alt"}>
            <div className="flex items-center gap-1">
              <h2
                className={`min-w-0 truncate text-[22px] font-bold leading-7 text-header-primary ${NAME_FONT_CLASS[(p.name_font as NameFontId) ?? "default"] ?? ""}`}
                style={p.name_color ? (p.name_color_2 ? { backgroundImage: `linear-gradient(135deg, ${p.name_color}, ${p.name_color_2})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } : { color: p.name_color }) : undefined}
              >
                {displayName(p)}
              </h2>
              <GuildTag userId={p.id} size="sm" />
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

            <div className={`my-3 h-px ${theme ? "bg-white/15" : "bg-border-subtle"}`} />

            {p.bio?.trim() && (
              <Section title={t("About Me")}>
                <p className="line-clamp-6 whitespace-pre-wrap break-words text-[14px] leading-[18px] text-text-normal">{p.bio.trim()}</p>
              </Section>
            )}

            <Section title={t("Member Since")}>
              <div className="flex items-center gap-2 text-[14px] leading-[18px] text-text-normal">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="h-4 w-4 object-contain opacity-80" title="Disband" />
                <span>{formatDate(p.created_at)}</span>
                {isServerMember && memberJoinedAt && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-text-muted/60" />
                    {serverIcon && safeImageUrl(serverIcon) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={safeImageUrl(serverIcon)!} alt="" className="h-4 w-4 rounded-full object-cover" title={serverName ?? undefined} />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-tertiary text-[7px] font-bold" title={serverName ?? undefined}>
                        {(serverName ?? "?").slice(0, 1)}
                      </span>
                    )}
                    <span>{formatDate(memberJoinedAt)}</span>
                  </>
                )}
              </div>
            </Section>

            {activity && <div className="mb-3"><ActivityCard activity={activity} /></div>}
            {listening && <div className="mb-3"><ListeningCard listening={listening} /></div>}

            {rolesPending && !isServerMember && (
              <Section title={t("Roles")}>
                <div className="flex flex-wrap gap-1" aria-busy="true" aria-label="Loading roles">
                  {[64, 88, 52].map((w) => (
                    <span key={w} className="skeleton-glimmer h-6 rounded-full" style={{ width: w }} />
                  ))}
                </div>
              </Section>
            )}
            {isServerMember && (roles.length > 0 || canManageRoles || canPickSelfRoles) && (
              <Section title={roles.length === 1 ? t("Role") : t("Roles")}>
                <div className="flex flex-wrap gap-1">
                  {roles.map((r) => (
                    <span key={r.id} className="group/role inline-flex h-6 items-center gap-1.5 rounded-full border border-border-subtle bg-bg-tertiary px-2 text-[12px] font-medium text-text-normal">
                      {canManageRoles && onSetRoles ? (
                        <button
                          type="button"
                          aria-label={t("Remove {name}", { name: r.name })}
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
                      roles={(assignableRoles ?? serverRoles).filter((r) => !r.is_default)}
                      selected={memberRoleIds}
                      onToggle={(id) =>
                        onSetRoles(memberRoleIds.includes(id) ? memberRoleIds.filter((x) => x !== id) : [...memberRoleIds, id])
                      }
                      compact
                    />
                  )}
                  {canPickSelfRoles && onSetSelfRoles && (
                    <RolePicker
                      roles={selfRoles}
                      selected={selfRoleIds}
                      onToggle={(id) =>
                        onSetSelfRoles(
                          selfRoleIds.includes(id)
                            ? selfRoleIds.filter((x) => x !== id)
                            : [...selfRoleIds, id],
                        )
                      }
                      compact
                    />
                  )}
                </div>
              </Section>
            )}

            {isSelf ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings?.();
                }}
                className={`mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition-[filter,background-color] ${
                  theme ? "hover:brightness-110" : "bg-brand text-brand-foreground hover:bg-brand-hover"
                }`}
                style={theme ? { backgroundColor: theme.primary, color: theme.primaryText } : undefined}
              >
                <IconEdit size={16} /> {t("Edit profile")}
              </button>
            ) : friendsOnly ? (
              <div className="mt-1">
                <p className="mb-1.5 text-[12px] leading-4 text-text-muted">
                  {t("Add {name} as a friend to message them.", { name: displayName(p) })}
                </p>
                <button
                  type="button"
                  disabled={requestSent}
                  onClick={async () => {
                    if (!p.username) return;
                    const err = await sendFriendRequest(p.username);
                    setFriendNote(err);
                  }}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-default disabled:bg-button-secondary disabled:text-text-muted"
                >
                  <IconUserPlus size={16} /> {requestSent ? t("Friend Request Sent") : t("Add Friend")}
                </button>
                {friendNote && <p className="mt-1.5 text-[12px] leading-4 text-status-dnd">{friendNote}</p>}
              </div>
            ) : (
              <input
                value={message}
                onChange={(e) => { setMessage(e.target.value); setSendError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendQuickMessage();
                  }
                }}
                placeholder={t("Message @{value}", { value: p.username ?? displayName(p) })}
                aria-label={t("Message {name}", { name: displayName(p) })}
                className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-brand"
              />
            )}
            {sendError && <p className="mt-1.5 text-[12px] leading-4 text-status-dnd">{sendError}</p>}
            {friendNote && !friendsOnly && <p className="mt-1.5 text-[12px] leading-4 text-status-dnd">{friendNote}</p>}
            {p.is_bot && <AuthorizeAppButton userId={p.id} className="mt-2" />}
          </ArtPanel>
          <SkinFloor itemId={p.equipped_overlay_effect} />
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
        <h3 className="text-[12px] font-semibold uppercase leading-4 tracking-[0.04em] text-text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
