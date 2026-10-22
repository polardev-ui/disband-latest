"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ProfileOverlay } from "@/components/shop/ProfileOverlay";
import { useApp } from "@/contexts/AppContext";
import { IconClose, IconMessage, IconMore, IconPhone, IconSettings } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { DisplayName } from "@/components/ui/DisplayName";
import { RolePicker } from "@/components/ui/RolePicker";
import { UnderlineTabs } from "@/components/ui/Tabs";
import { getAccentBackground, getProfileCardTheme, roleIsGradientAnimated, usesCustomAccent } from "@/lib/profileColor";
import { displayName, serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { presenceStatusFor, activeStatusNote, statusExpiryLabel, listeningFor } from "@/lib/presence";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { StatusDot } from "@/components/ui/StatusDot";
import { ListeningCard } from "@/components/ui/ListeningCard";
import { UserBadges } from "@/components/ui/UserBadges";
import { USER_NOTE_MAX, useUserNote } from "@/hooks/useUserNote";
import type { Profile, Server, ServerRole } from "@/lib/supabase/types";
import type { SubscriptionPlan } from "@/lib/subscription";

/*
 The profile card.

 A profile with its own colours is painted in a Discord-style theme: the two
 accents are mixed into a dark base and blended through a soft diagonal
 gradient, so the banner and body read as one surface without losing white
 text. Profiles that haven't picked colours keep the app's ordinary card
 surface. The accent also fills the banner when there's no image and colours
 the primary "Edit profile" action.
*/

type ProfileTab = "about" | "spaces" | "friends";

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
  onReport?: () => void;
  onRemoveFriend?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  isFriend?: boolean;
  isBlocked?: boolean;
  pendingIncoming?: boolean;
  pendingOutgoing?: boolean;
  isSelf?: boolean;
  plan?: SubscriptionPlan;
  isServerMember?: boolean;
  serverRoles?: ServerRole[];
  canManageRoles?: boolean;
  memberRoleIds?: string[];
  memberIsOwner?: boolean;
  onSetRoles?: (roleIds: string[]) => void;
  /** Roles staff have marked safe for members to choose themselves. */
  selfAssignableRoles?: ServerRole[];
  onSetSelfRoles?: (roleIds: string[]) => void;
}

// Classic profile buttons: green "Send Message", blurple, grey; 3px corners.
const BTN_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] px-4 text-[14px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";
const BTN_SOLID = `${BTN_BASE} bg-button-green text-white hover:bg-button-green-hover`;
const BTN_BRAND = `${BTN_BASE} bg-brand text-white hover:bg-brand-hover`;
const BTN_QUIET = `${BTN_BASE} bg-button-secondary text-white hover:bg-button-secondary-hover`;
const BTN_ICON =
  "inline-flex h-8 w-8 items-center justify-center rounded-[3px] bg-button-secondary text-white transition-colors hover:bg-button-secondary-hover";

function relativeAge(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (days < 1) return rtf.format(0, "day");
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

/**
 * Profiles can arrive from partial sources (the Tether info endpoint, cached
 * payloads, older rows) without a usable created_at. Treat those as unknown
 * rather than passing NaN to Intl.RelativeTimeFormat, which throws.
 */
function memberSince(iso: string | null | undefined): { date: string; age: string } | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return {
    date: new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    age: relativeAge(timestamp),
  };
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">{label}</h3>
      {children}
    </section>
  );
}

function ProfileBanner({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  const url = safeImageUrl(profile.banner_url);
  const show = url && !failed;
  const theme = getProfileCardTheme(profile);
  // No image and no accent of their own: a quiet brand wash instead of the
  // old flat grey, so an unconfigured profile still looks finished.
  const background = usesCustomAccent(profile)
    ? getAccentBackground(profile)
    : profile.accent_color ?? "var(--brand)";
  return (
    <div className="relative h-[180px] w-full overflow-hidden" style={{ background }}>
      {show && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url!} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
          {theme && (
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: theme.bannerTint }} />
          )}
        </>
      )}
    </div>
  );
}

function OverflowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={BTN_ICON}
      >
        <IconMore size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-[4px] bg-bg-floating p-1 shadow-[var(--elevation-high)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[14px] font-medium transition-colors ${
                item.danger
                  ? "text-status-dnd hover:bg-status-dnd/10"
                  : "text-text-normal hover:bg-interactive-hover"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyTab({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-text-muted">{children}</p>;
}

export function UserProfileModal({
  profile: profileProp,
  open,
  onClose,
  onMessage,
  onAddFriend,
  onAcceptFriend,
  onDeclineFriend,
  onVoiceCall,
  onOpenSettings,
  onReport,
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
  selfAssignableRoles,
  onSetSelfRoles,
}: UserProfileModalProps) {
  // Keep the last profile around while the card animates out: the parent
  // clears its `profileTarget` the instant it closes, which would otherwise
  // unmount the card mid-fade.
  const { mounted, exiting } = usePresence(open);
  const lastProfileRef = useRef<Profile | null>(null);
  if (profileProp) lastProfileRef.current = profileProp;
  const profile = profileProp ?? lastProfileRef.current;

  const { friends, presenceMap, listeningMap, servers, loadMutuals, user, openDmWithFriend, sendDmMessage } = useApp();
  const [mutualServerIds, setMutualServerIds] = useState<string[]>([]);
  const [mutualFriendIds, setMutualFriendIds] = useState<string[]>([]);
  const [tab, setTab] = useState<ProfileTab>("about");
  // Inline status reply: hover the bubble → reply button → type here → Enter
  // jumps to their DM with the reply sent.
  const [statusReplyOpen, setStatusReplyOpen] = useState(false);
  const [statusReplyText, setStatusReplyText] = useState("");
  const [statusReplySending, setStatusReplySending] = useState(false);
  const note = useUserNote(open ? user?.id : null, open && !isSelf ? profile?.id : null);

  useEffect(() => {
    setTab("about");
    setStatusReplyOpen(false);
    setStatusReplyText("");
    setStatusReplySending(false);
    if (!open || !profile || profile.id === undefined) {
      setMutualServerIds([]);
      setMutualFriendIds([]);
      return;
    }
    let live = true;
    setMutualServerIds([]);
    setMutualFriendIds([]);
    void loadMutuals(profile.id).then((m) => {
      if (!live) return;
      setMutualServerIds(m.serverIds);
      setMutualFriendIds(m.friendIds);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, profile?.id, loadMutuals]);
  useOverlayDismiss(onClose, open);
  if (!mounted || !profile) return null;

  const friend = isFriend || friends.some((f) => f.id === profile.id);
  const title = profile.display_name?.trim() || displayName(profile);
  const live = presenceStatusFor(profile, presenceMap);
  const statusNote = activeStatusNote(profile);
  const listening = live === "offline" ? null : listeningFor(profile, listeningMap);
  const joined = memberSince(profile.created_at);

  // Replying to a status sends a DM quoting it, then jumps there so the
  // reply lands in front of both people. Same open-then-send beat as
  // forwarding: the thread id only settles after the open resolves.
  async function submitStatusReply() {
    if (!profile || isSelf || !statusNote) return;
    const text = statusReplyText.trim();
    if (!text || statusReplySending) return;
    setStatusReplySending(true);
    try {
      await openDmWithFriend(profile.id);
      const content = `> ${statusNote}\n${text}`;
      setTimeout(() => {
        void sendDmMessage(content);
      }, 250);
      setStatusReplyText("");
      setStatusReplyOpen(false);
      onClose();
    } finally {
      setStatusReplySending(false);
    }
  }
  const isBot = !!profile.is_bot;
  const theme = getProfileCardTheme(profile);

  const mutualServers = mutualServerIds
    .map((id) => servers.find((s) => s.id === id))
    .filter((s): s is Server => !!s);
  const mutualFriends = mutualFriendIds
    .map((id) => friends.find((f) => f.id === id))
    .filter((f): f is Profile => !!f);

  const memberRoles = (serverRoles ?? []).filter((r) => memberRoleIds.includes(r.id));
  const assignableRoles = (serverRoles ?? []).filter((r) => !r.is_default);
  const selfAssignable = (selfAssignableRoles ?? []).filter((r) => !r.is_default);
  const selfSelected = memberRoleIds.filter((id) => selfAssignable.some((r) => r.id === id));

  const toggleRole = (roleId: string) => {
    if (!onSetRoles) return;
    const next = memberRoleIds.includes(roleId)
      ? memberRoleIds.filter((id) => id !== roleId)
      : [...memberRoleIds, roleId];
    // Every member implicitly holds @everyone, so it comes back in
    // memberRoleIds — sending it made the whole call fail as an invalid role,
    // which meant no role could be granted to anyone.
    const defaultIds = new Set((serverRoles ?? []).filter((r) => r.is_default).map((r) => r.id));
    onSetRoles(next.filter((id) => !defaultIds.has(id)));
  };

  const toggleSelfRole = (roleId: string) => {
    if (!onSetSelfRoles) return;
    const next = selfSelected.includes(roleId)
      ? selfSelected.filter((id) => id !== roleId)
      : [...selfSelected, roleId];
    onSetSelfRoles(next);
  };

  const selfRolePicker = isSelf && !canManageRoles && onSetSelfRoles && selfAssignable.length > 0 ? (
    <div className="mt-2">
      <p className="mb-1.5 text-[12px] text-text-muted">
        Roles you can give yourself
      </p>
      <RolePicker roles={selfAssignable} selected={selfSelected} onToggle={toggleSelfRole} compact />
    </div>
  ) : null;

  const overflow: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (!isSelf && !isBot) {
    if (!isBlocked) {
      if (friend && onRemoveFriend) overflow.push({ label: "Remove friend", onClick: onRemoveFriend });
      if (onBlock) overflow.push({ label: "Block", onClick: onBlock, danger: true });
    }
    // Blocking someone is not a substitute for reporting them. Keep the
    // report action available after a block, when the evidence matters most.
    if (onReport) overflow.push({ label: "Report profile", onClick: onReport, danger: true });
  }

  let actions: ReactNode = null;
  if (isSelf) {
    actions = onOpenSettings && (
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
        className={`${BTN_BASE} ${theme ? "transition-[filter] hover:brightness-110" : "bg-button-secondary text-white hover:bg-button-secondary-hover"}`}
        style={theme ? { backgroundColor: theme.primary, color: theme.primaryText } : undefined}
      >
        <IconSettings size={15} /> Edit profile
      </button>
    );
  } else if (isBlocked) {
    actions = onUnblock && (
      <button type="button" onClick={onUnblock} className={BTN_QUIET}>
        Unblock
      </button>
    );
  } else if (!isBot) {
    actions = (
      <>
        {friend && onMessage && (
          <button type="button" onClick={onMessage} className={BTN_SOLID}>
            <IconMessage size={15} /> Send Message
          </button>
        )}
        {friend && onVoiceCall && (
          <button type="button" onClick={onVoiceCall} aria-label="Start voice call" title="Voice call" className={BTN_ICON}>
            <IconPhone size={16} />
          </button>
        )}
        {!friend && pendingIncoming && onAcceptFriend && onDeclineFriend && (
          <>
            <button type="button" onClick={onAcceptFriend} className={BTN_BRAND}>
              Accept
            </button>
            <button type="button" onClick={onDeclineFriend} className={BTN_QUIET}>
              Decline
            </button>
          </>
        )}
        {!friend && !pendingIncoming && !pendingOutgoing && onAddFriend && (
          <button type="button" onClick={onAddFriend} className={BTN_SOLID}>
            Add friend
          </button>
        )}
        {!friend && pendingOutgoing && (
          <button type="button" disabled className={BTN_QUIET}>
            Request sent
          </button>
        )}
        <OverflowMenu items={overflow} />
      </>
    );
  }

  const tabs = isSelf
    ? [{ id: "about" as const, label: "User Info" }]
    : [
        { id: "about" as const, label: "User Info" },
        { id: "spaces" as const, label: "Mutual Servers", count: mutualServers.length },
        { id: "friends" as const, label: "Mutual Friends", count: mutualFriends.length },
      ];

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" className={`absolute inset-0 bg-overlay-scrim-strong overlay-fade${exiting ? " overlay-fade-out" : ""}`} onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fx-overlay-host modal-pop${exiting ? " modal-pop-out" : ""} channel-scroll relative max-h-[calc(100vh-3rem)] w-full max-w-[600px] overflow-y-auto rounded-lg ${theme ? "" : "bg-bg-secondary-alt"} text-text-normal shadow-[var(--elevation-high)]`}
        style={theme?.style}
      >
        {/* Artwork sits above the banner and below the readable profile content. */}
        <ProfileOverlay itemId={profile?.equipped_overlay_effect} />
        <ProfileBanner profile={profile} />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[3px] bg-black/60 text-white transition-colors hover:bg-black/75"
          aria-label="Close profile"
        >
          <IconClose size={16} />
        </button>

        <div className="relative z-10 px-6 pb-6">
          {/* Avatar overlaps the banner; actions sit level with its lower half. */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div
              className={`relative -mt-[68px] shrink-0 rounded-full p-[7px] ${theme ? "" : "bg-bg-secondary-alt"}`}
              style={theme ? { backgroundColor: theme.avatarRing } : undefined}
            >
              <Avatar profile={profile} size="xl" className="!h-[120px] !w-[120px] !text-4xl" />
              <StatusDot
                status={live}
                size={22}
                ring={theme?.avatarRing ?? "var(--bg-secondary-alt)"}
                className="absolute bottom-1.5 right-1.5"
              />
            </div>
            {actions && <div className="flex flex-wrap items-center justify-end gap-2 pb-1">{actions}</div>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 className="min-w-0 break-words text-[24px] font-semibold leading-[30px] text-header-primary">
              <DisplayName profile={{ ...profile, display_name: title }} />
            </h2>
            <UserBadges userId={profile.id} plan={plan ?? "free"} size={18} variant="full" />
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[14px] text-text-muted">
            {profile.username && <span>@{profile.username}</span>}
            {profile.pronouns?.trim() && (
              <>
                <span aria-hidden>·</span>
                <span>{profile.pronouns.trim()}</span>
              </>
            )}
            {isSelf && (
              <span className="ml-1 rounded-md border border-divider px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                You
              </span>
            )}
            {isBot && (
              <span className="ml-1 rounded-md bg-brand/15 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-brand">
                Assistant
              </span>
            )}
          </p>

          {statusNote && (
            // A speech bubble whose notch points back up at the name.
            <div className="group/status relative mt-3.5 w-fit max-w-full">
              <span
                aria-hidden
                className="absolute -top-[5px] left-5 h-2.5 w-2.5 rotate-45 bg-bg-floating"
              />
              <div className="rounded-lg bg-bg-floating px-3.5 py-2">
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => setStatusReplyOpen((v) => !v)}
                    aria-label="Reply to status"
                    title="Reply to status"
                    className="absolute -top-2 right-1 flex h-6 w-6 items-center justify-center rounded-full border border-divider bg-bg-secondary text-text-muted opacity-0 shadow transition-all hover:text-text-normal focus-visible:opacity-100 group-hover/status:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 17 4 12 9 7" />
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                    </svg>
                  </button>
                )}
                <p className="break-words text-[14px] leading-snug">{statusNote}</p>
                {profile.status_expires_at && (
                  <p className="mt-0.5 text-[11px] text-text-muted">{statusExpiryLabel(profile.status_expires_at)}</p>
                )}
                {!isSelf && statusReplyOpen && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={statusReplyText}
                      onChange={(e) => setStatusReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void submitStatusReply();
                        }
                        if (e.key === "Escape") {
                          setStatusReplyOpen(false);
                          setStatusReplyText("");
                        }
                      }}
                      placeholder={`Reply to ${title}…`}
                      maxLength={500}
                      disabled={statusReplySending}
                      className="min-w-0 flex-1 rounded-lg bg-bg-primary px-2.5 py-1.5 text-[13px] text-text-normal placeholder:text-text-muted outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => void submitStatusReply()}
                      disabled={!statusReplyText.trim() || statusReplySending}
                      aria-label="Send status reply"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-all hover:bg-brand-hover active:scale-95 disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tabs.length > 1 ? (
            <UnderlineTabs idPrefix="profile" tabs={tabs} value={tab} onChange={setTab} className="mt-5" />
          ) : (
            <div className="mt-5 border-b border-divider" />
          )}

          <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`} className="pt-4">
            {tab === "about" && (
              <>
                {isBot && (
                  <Section label="About">
                    <p className="text-[14px] leading-relaxed text-text-muted">
                      This is Disband&apos;s assistant — it can&apos;t be messaged, friended, called, or blocked.
                    </p>
                  </Section>
                )}

                {profile.bio && (
                  <Section label="About me">
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                      {profile.bio}
                    </p>
                  </Section>
                )}

                {listening && (
                  <Section label="Listening">
                    <ListeningCard listening={listening} />
                  </Section>
                )}

                {joined && (
                  <Section label="Disband member since">
                    <p className="text-[14px]">
                      {joined.date}
                      <span className="text-text-muted"> · {joined.age}</span>
                    </p>
                  </Section>
                )}

                {isServerMember && (
                  <Section label="Roles">
                    {memberIsOwner ? (
                      <>
                        <p className="text-[14px] font-medium">Space owner</p>
                        {selfRolePicker}
                      </>
                    ) : (
                      <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {memberRoles.map((role) => (
                          <span
                            key={role.id}
                            className={`inline-flex items-center gap-1.5 rounded-[3px] border border-divider py-0.5 pl-2 ${canManageRoles && onSetRoles ? "pr-1" : "pr-2"} text-[12px] font-medium ${roleIsGradientAnimated(role) ? "animate-role-gradient" : ""}`}
                            style={
                              role.gradient_to?.trim()
                                ? {
                                    backgroundImage: `linear-gradient(90deg, ${role.color}24, ${role.gradient_to.trim()}24)`,
                                    backgroundSize: role.gradient_animated ? "200% 100%" : undefined,
                                  }
                                : { backgroundColor: `${role.color}1c` }
                            }
                          >
                            {role.icon && <RoleIcon icon={role.icon} name={role.name} size={14} />}
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />
                            {role.name}
                            {canManageRoles && onSetRoles && (
                              <button
                                type="button"
                                onClick={() => toggleRole(role.id)}
                                aria-label={`Remove the ${role.name} role`}
                                title={`Remove ${role.name}`}
                                className="-mr-0.5 ml-0.5 flex h-5 w-5 items-center justify-center rounded-[2px] text-text-muted transition-colors hover:bg-black/20 hover:text-text-normal"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                  <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </span>
                        ))}
                        {memberRoles.length === 0 && (
                          <p className="text-[13px] text-text-muted">No roles assigned.</p>
                        )}
                        {canManageRoles && onSetRoles && (
                          <RolePicker roles={assignableRoles} selected={memberRoleIds} onToggle={toggleRole} compact />
                        )}
                      </div>
                      {selfRolePicker}
                      </>
                    )}
                  </Section>
                )}

                {!isSelf && !isBot && note.state !== "unavailable" && (
                  <Section label="Note (only you can see it)">
                    <textarea
                      value={note.note}
                      onChange={(e) => note.setNote(e.target.value.slice(0, USER_NOTE_MAX))}
                      onBlur={() => void note.save()}
                      disabled={note.state === "loading"}
                      rows={2}
                      maxLength={USER_NOTE_MAX}
                      placeholder="Click to add a note"
                      aria-label={`Private note about ${title}`}
                      className="block w-full resize-none rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 py-2.5 text-[14px] leading-relaxed text-text-normal outline-none transition-[border-color,box-shadow] placeholder:text-text-muted/80 focus:border-brand disabled:opacity-60"
                    />
                  </Section>
                )}
              </>
            )}

            {tab === "spaces" &&
              (mutualServers.length === 0 ? (
                <EmptyTab>No spaces in common.</EmptyTab>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {mutualServers.map((s) => {
                    const icon = safeImageUrl(s.icon_url);
                    return (
                      <li key={s.id} className="flex items-center gap-3 rounded-[4px] px-2 py-2">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="h-9 w-9 shrink-0 rounded-[4px] object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-bg-accent text-[12px] font-semibold">
                            {serverInitials(s.name)}
                          </span>
                        )}
                        <span className="truncate text-[14px] font-medium">{s.name}</span>
                      </li>
                    );
                  })}
                </ul>
              ))}

            {tab === "friends" &&
              (mutualFriends.length === 0 ? (
                <EmptyTab>No friends in common.</EmptyTab>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {mutualFriends.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-[4px] px-2 py-2">
                      <Avatar profile={f} size="sm" className="h-9 w-9" />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{displayName(f)}</span>
                        {f.username && <span className="block truncate text-[12px] text-text-muted">@{f.username}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
