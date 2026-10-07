"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ProfileOverlay } from "@/components/shop/ProfileOverlay";
import { useApp } from "@/contexts/AppContext";
import { IconClose, IconMessage, IconMore, IconPhone, IconSettings } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { DisplayName } from "@/components/ui/DisplayName";
import { RolePicker } from "@/components/ui/RolePicker";
import { UnderlineTabs } from "@/components/ui/Tabs";
import { getAccentBackground, roleIsGradientAnimated, sanitizeHex, usesCustomAccent } from "@/lib/profileColor";
import { displayName, serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { presenceStatusFor, activeStatusNote, statusExpiryLabel } from "@/lib/presence";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { UserBadges } from "@/components/ui/UserBadges";
import { USER_NOTE_MAX, useUserNote } from "@/hooks/useUserNote";
import type { Profile, Server, ServerRole } from "@/lib/supabase/types";
import type { SubscriptionPlan } from "@/lib/subscription";

/*
 The profile card.

 It used to be painted edge to edge in the user's accent colour (a flat grey
 for anyone who hadn't picked one) with the text colour flipped to match —
 Discord's profile-theme look, and the reason every card read as a different
 app. The card is now always the app's own dark (or light) surface, so type,
 tabs and fields behave the same on every profile. The accent still belongs to
 the person: it fills the banner when there's no image, tints the top of the
 card, and edges the border.
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
}

const BTN_BASE =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[13.5px] font-semibold transition-[background-color,opacity,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
/** High-contrast neutral: near-white on dark themes, near-black on light ones. */
const BTN_SOLID = `${BTN_BASE} bg-text-normal text-bg-primary hover:opacity-90`;
const BTN_BRAND = `${BTN_BASE} bg-brand text-white hover:bg-brand-hover`;
const BTN_QUIET = `${BTN_BASE} border border-divider bg-bg-accent text-text-normal hover:bg-interactive-hover`;
const BTN_ICON =
  "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-divider bg-bg-accent text-text-normal transition-colors hover:bg-interactive-hover";

function relativeAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (days < 1) return rtf.format(0, "day");
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</h3>
      {children}
    </section>
  );
}

function ProfileBanner({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  const url = safeImageUrl(profile.banner_url);
  const show = url && !failed;
  // No image and no accent of their own: a quiet brand wash instead of the
  // old flat grey, so an unconfigured profile still looks finished.
  const background = usesCustomAccent(profile)
    ? getAccentBackground(profile)
    : "linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 52%, var(--color-bg-tertiary)) 0%, color-mix(in srgb, var(--color-brand) 14%, var(--color-bg-tertiary)) 100%)";
  return (
    <div className="h-[128px] w-full overflow-hidden" style={{ background }}>
      {show && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url!} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
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
          className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-divider bg-overlay-surface p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
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
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${
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
  const { friends, presenceMap, servers, loadMutuals, user } = useApp();
  const [mutualServerIds, setMutualServerIds] = useState<string[]>([]);
  const [mutualFriendIds, setMutualFriendIds] = useState<string[]>([]);
  const [tab, setTab] = useState<ProfileTab>("about");
  const note = useUserNote(open ? user?.id : null, open && !isSelf ? profile?.id : null);

  useEffect(() => {
    setTab("about");
    if (!open || !profile || profile.id === undefined) {
      setMutualServerIds([]);
      setMutualFriendIds([]);
      return;
    }
    let live = true;
    void loadMutuals(profile.id).then((m) => {
      if (!live) return;
      setMutualServerIds(m.serverIds);
      setMutualFriendIds(m.friendIds);
    });
    return () => {
      live = false;
    };
  }, [open, profile?.id, loadMutuals]);
  useOverlayDismiss(onClose, open);
  if (!open || !profile) return null;

  const friend = isFriend || friends.some((f) => f.id === profile.id);
  const title = profile.display_name?.trim() || displayName(profile);
  const live = presenceStatusFor(profile, presenceMap);
  const statusNote = activeStatusNote(profile);
  const isBot = !!profile.is_bot;

  const mutualServers = mutualServerIds
    .map((id) => servers.find((s) => s.id === id))
    .filter((s): s is Server => !!s);
  const mutualFriends = mutualFriendIds
    .map((id) => friends.find((f) => f.id === id))
    .filter((f): f is Profile => !!f);

  const memberRoles = (serverRoles ?? []).filter((r) => memberRoleIds.includes(r.id));
  const assignableRoles = (serverRoles ?? []).filter((r) => !r.is_default);

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

  // The person's accent tints the top of the card and its edge.
  const accent = usesCustomAccent(profile) ? sanitizeHex(profile.accent_color) : null;
  const cardStyle: CSSProperties = accent
    ? {
        background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 14%, var(--color-overlay-panel)) 0px, var(--color-overlay-panel) 300px)`,
        borderColor: `color-mix(in srgb, ${accent} 30%, var(--color-divider))`,
      }
    : {};

  const overflow: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (!isSelf && !isBot && !isBlocked) {
    if (friend && onRemoveFriend) overflow.push({ label: "Remove friend", onClick: onRemoveFriend });
    if (onBlock) overflow.push({ label: "Block", onClick: onBlock, danger: true });
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
        className={BTN_QUIET}
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
            <IconMessage size={15} /> Message
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
    ? [{ id: "about" as const, label: "About" }]
    : [
        { id: "about" as const, label: "About" },
        { id: "spaces" as const, label: "Mutual Spaces", count: mutualServers.length },
        { id: "friends" as const, label: "Mutual Friends", count: mutualFriends.length },
      ];

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-overlay-scrim overlay-fade" onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fx-overlay-host modal-pop relative max-h-[calc(100vh-3rem)] w-full max-w-[440px] overflow-y-auto rounded-[22px] border border-divider bg-overlay-panel text-text-normal shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)]"
        style={cardStyle}
      >
        {/* Artwork sits above the banner and below the readable profile content. */}
        <ProfileOverlay itemId={profile?.equipped_overlay_effect} />
        <ProfileBanner profile={profile} />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
          aria-label="Close profile"
        >
          <IconClose size={16} />
        </button>

        <div className="relative z-10 px-6 pb-6">
          {/* Avatar overlaps the banner; actions sit level with its lower half. */}
          <div className="flex items-end justify-between gap-3">
            <div className="relative -mt-[52px] shrink-0 rounded-full bg-overlay-panel p-[5px]" style={accent ? { background: "inherit" } : undefined}>
              <Avatar profile={profile} size="xl" />
              <span className="absolute bottom-1 right-1 rounded-full bg-overlay-panel p-[3px]">
                <StatusIndicator status={live} size="md" />
              </span>
            </div>
            {actions && <div className="flex flex-wrap items-center justify-end gap-2 pb-1">{actions}</div>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 className="min-w-0 break-words text-[24px] font-semibold leading-tight tracking-[-0.02em]">
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
            <div className="relative mt-3.5 w-fit max-w-full">
              <span
                aria-hidden
                className="absolute -top-[5px] left-5 h-2.5 w-2.5 rotate-45 border-l border-t border-divider bg-bg-accent"
              />
              <div className="rounded-2xl border border-divider bg-bg-accent px-3.5 py-2">
                <p className="break-words text-[14px] leading-snug">{statusNote}</p>
                {profile.status_expires_at && (
                  <p className="mt-0.5 text-[11px] text-text-muted">{statusExpiryLabel(profile.status_expires_at)}</p>
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

                <Section label="Disband member since">
                  <p className="text-[14px]">
                    {new Date(profile.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <span className="text-text-muted"> · {relativeAge(profile.created_at)}</span>
                  </p>
                </Section>

                {isServerMember && (
                  <Section label="Roles">
                    {memberIsOwner ? (
                      <p className="text-[14px] font-medium">Space owner</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {memberRoles.map((role) => (
                          <span
                            key={role.id}
                            className={`inline-flex items-center gap-1.5 rounded-md border border-divider px-2 py-0.5 text-[12.5px] font-medium ${roleIsGradientAnimated(role) ? "animate-role-gradient" : ""}`}
                            style={
                              role.gradient_to?.trim()
                                ? {
                                    backgroundImage: `linear-gradient(90deg, ${role.color}24, ${role.gradient_to.trim()}24)`,
                                    backgroundSize: role.gradient_animated ? "200% 100%" : undefined,
                                  }
                                : { backgroundColor: `${role.color}1c` }
                            }
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />
                            {role.name}
                          </span>
                        ))}
                        {memberRoles.length === 0 && (!canManageRoles || isSelf) && (
                          <p className="text-[13px] text-text-muted">No roles assigned.</p>
                        )}
                        {canManageRoles && !isSelf && onSetRoles && (
                          <RolePicker roles={assignableRoles} selected={memberRoleIds} onToggle={toggleRole} compact />
                        )}
                      </div>
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
                      className="block w-full resize-none rounded-xl border border-divider bg-bg-accent px-3.5 py-2.5 text-[14px] leading-relaxed text-text-normal outline-none transition-[border-color,box-shadow] placeholder:text-text-muted/80 focus:border-brand/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_14%,transparent)] disabled:opacity-60"
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
                      <li key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-accent text-[12px] font-semibold">
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
                    <li key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <Avatar profile={f} size="sm" className="h-9 w-9" />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{displayName(f)}</span>
                        {f.username && <span className="block truncate text-[12.5px] text-text-muted">@{f.username}</span>}
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
