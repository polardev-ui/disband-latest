"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { HEADER_BADGE_LIMIT, UserBadges, useBadgeCount } from "@/components/ui/UserBadges";
import { ListeningCard } from "@/components/ui/ListeningCard";
import { BotTag } from "@/components/ui/BotTag";
import { IconChevron } from "@/components/icons";
import { displayName, serverInitials } from "@/lib/utils";
import { activeStatusNote, listeningFor, presenceStatusFor } from "@/lib/presence";
import { getAccentBackground, usesCustomAccent } from "@/lib/profileColor";
import { safeImageUrl } from "@/lib/safe-url";
import type { Profile } from "@/lib/supabase/types";

interface DmProfileRailProps {
  friend: Profile;
  onClose: () => void;
  onVoiceCall: () => void;
  onOpenFullProfile: () => void;
}

/**
 * The profile panel beside a DM, in the classic layout: banner, avatar with a
 * cut-out status, badges, then a dark card with the bio, member-since date,
 * what they're listening to, and mutual spaces and friends.
 */
export function DmProfileRail({ friend, onOpenFullProfile }: DmProfileRailProps) {
  const { presenceMap, listeningMap, loadMutuals, servers, friends, selectServer, openDmWithFriend } = useApp();
  const [bannerFailed, setBannerFailed] = useState(false);
  const [mutuals, setMutuals] = useState<{ serverIds: string[]; friendIds: string[] } | null>(null);
  const [open, setOpen] = useState<"servers" | "friends" | null>(null);
  const badgeCount = useBadgeCount(friend.id);

  useEffect(() => {
    let live = true;
    setBannerFailed(false);
    setMutuals(null);
    setOpen(null);
    void loadMutuals(friend.id)
      .then((m) => {
        if (live) setMutuals(m);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [friend.id, loadMutuals]);

  const live = presenceStatusFor(friend, presenceMap);
  const note = activeStatusNote(friend);
  const listening = live === "offline" ? null : listeningFor(friend, listeningMap);
  const banner = bannerFailed ? null : safeImageUrl(friend.banner_url);
  const bannerBg = usesCustomAccent(friend) ? getAccentBackground(friend) : friend.accent_color ?? "#5865f2";
  const mutualServers = (mutuals?.serverIds ?? []).map((id) => servers.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  const mutualFriends = (mutuals?.friendIds ?? []).map((id) => friends.find((f) => f.id === id)).filter((f): f is Profile => !!f);

  return (
    <aside
      aria-label={`${displayName(friend)}'s profile`}
      className="channel-scroll flex min-h-0 w-[340px] shrink-0 flex-col overflow-y-auto bg-bg-secondary-alt"
    >
      <div className="relative shrink-0">
        <div className="relative h-[120px] overflow-hidden" style={{ background: bannerBg }}>
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" onError={() => setBannerFailed(true)} />
          )}
        </div>
        <button
          type="button"
          onClick={onOpenFullProfile}
          aria-label="View full profile"
          className="group/avatar absolute left-4 top-[76px] rounded-full bg-bg-secondary-alt p-1.5"
        >
          <span className="relative block">
            <Avatar profile={friend} size="xl" className="!h-20 !w-20 !text-2xl" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-bold uppercase text-white opacity-0 transition-opacity group-hover/avatar:opacity-100">
              View Profile
            </span>
            <StatusDot status={live} size={16} ring="var(--bg-secondary-alt)" className="absolute -bottom-0.5 -right-0.5" />
          </span>
        </button>
        <div className="flex min-h-[44px] justify-end pl-[116px] pr-4 pt-3">
          {badgeCount > 0 && badgeCount <= HEADER_BADGE_LIMIT && (
            <span className="rounded-lg bg-bg-floating p-1">
              <UserBadges userId={friend.id} size={22} variant="full" className="justify-end" />
            </span>
          )}
        </div>
      </div>

      <div className="mx-4 mb-4 mt-7 rounded-lg bg-bg-floating p-3">
        <div className="flex items-center gap-1">
          <h2 className="min-w-0 truncate text-[20px] font-semibold leading-6 text-header-primary">{displayName(friend)}</h2>
          <BotTag profile={friend} size="sm" />
        </div>
        <p className="text-[14px] leading-[18px] text-header-primary">
          {friend.username ?? ""}
          {friend.pronouns?.trim() && <span className="text-header-secondary"> • {friend.pronouns.trim()}</span>}
        </p>
        {badgeCount > HEADER_BADGE_LIMIT && (
          <UserBadges userId={friend.id} size={22} variant="full" className="mt-2" />
        )}
        {note && <p className="mt-1.5 text-[14px] leading-[18px] text-text-normal">{note}</p>}

        <div className="my-3 h-px bg-bg-secondary" />

        {friend.bio?.trim() && (
          <section className="mb-3">
            <h3 className="mb-1.5 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-primary">About Me</h3>
            <p className="whitespace-pre-wrap break-words text-[14px] leading-[18px] text-text-normal">{friend.bio.trim()}</p>
          </section>
        )}

        <section className="mb-3">
          <h3 className="mb-1.5 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-primary">Member Since</h3>
          <p className="text-[14px] leading-[18px] text-text-normal">
            {new Date(friend.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </section>

        {listening && (
          <section className="mb-1">
            <ListeningCard listening={listening} />
          </section>
        )}
      </div>

      {/* Mutuals, as expandable rows — the classic DM sidebar's bottom half. */}
      <div className="mx-4 mb-4 overflow-hidden rounded-lg bg-bg-floating">
        <MutualRow
          label={`Mutual Servers — ${mutuals?.serverIds.length ?? "…"}`}
          open={open === "servers"}
          onToggle={() => setOpen((v) => (v === "servers" ? null : "servers"))}
        >
          {mutuals && mutualServers.length === 0 && <p className="px-2 py-1 text-[14px] text-text-muted">No servers in common.</p>}
          {mutualServers.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void selectServer(s.id)}
              className="flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left text-[14px] text-text-normal hover:bg-interactive-hover"
            >
              {safeImageUrl(s.icon_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={safeImageUrl(s.icon_url)!} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-primary text-[9px] font-semibold">{serverInitials(s.name)}</span>
              )}
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </MutualRow>
        <div className="mx-3 h-px bg-bg-secondary" />
        <MutualRow
          label={`Mutual Friends — ${mutuals?.friendIds.length ?? "…"}`}
          open={open === "friends"}
          onToggle={() => setOpen((v) => (v === "friends" ? null : "friends"))}
        >
          {mutuals && mutualFriends.length === 0 && <p className="px-2 py-1 text-[14px] text-text-muted">No friends in common.</p>}
          {mutualFriends.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => void openDmWithFriend(f.id)}
              className="flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left text-[14px] text-text-normal hover:bg-interactive-hover"
            >
              <Avatar profile={f} size="sm" className="!h-6 !w-6 !text-[10px]" />
              <span className="truncate">{displayName(f)}</span>
            </button>
          ))}
        </MutualRow>
      </div>

      <button
        type="button"
        onClick={onOpenFullProfile}
        className="mx-4 mb-4 mt-auto h-8 rounded-[3px] text-[14px] font-medium text-header-secondary transition-colors hover:bg-interactive-hover hover:text-header-primary"
      >
        View Full Profile
      </button>
    </aside>
  );
}

function MutualRow({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between px-3 text-left text-[14px] font-medium text-header-secondary transition-colors hover:text-header-primary"
      >
        {label}
        <IconChevron size={16} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="view-enter px-1 pb-2">{children}</div>}
    </div>
  );
}
