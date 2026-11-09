"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";
import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { Avatar } from "@/components/ui/Avatar";
import { GuildTag } from "@/components/ui/GuildTag";
import { StatusDot } from "@/components/ui/StatusDot";
import { displayName } from "@/lib/utils";
import { IconFriends, IconSearch, IconClose } from "@/components/icons";
import type { Profile, UserStatus } from "@/lib/supabase/types";
import type { PresenceMap } from "@/lib/presence";
import { activeStatusNote } from "@/lib/presence";

type FriendsTab = "online" | "all" | "pending" | "blocked";

const STATUS_DOT: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  idle: "Away",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

const TAB_LABEL: Record<FriendsTab, string> = {
  online: "Online",
  all: "All",
  pending: "Pending",
  blocked: "Blocked",
};

function StatusAvatar({ profile, presence, ring = "var(--bg-primary)" }: { profile: Profile; presence: PresenceMap; ring?: string }) {
  const live = presence.get(profile.id) ?? "offline";
  return (
    <div className="relative shrink-0">
      <Avatar profile={profile} size="sm" />
      <StatusDot status={live} ring={ring} className="absolute -bottom-[3px] -right-[3px] group-hover:![background:var(--interactive-hover)]" />
    </div>
  );
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-secondary-alt text-interactive-normal transition-colors hover:border-border-strong hover:text-interactive-active"
    >
      {children}
    </button>
  );
}

function IconMessage({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function IconMore({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

interface FriendsPanelProps {
  onOpenProfile: (profile: Profile) => void;
  onFriendContext: (profile: Profile, x: number, y: number) => void;
}

export function FriendsPanel({ onOpenProfile, onFriendContext }: FriendsPanelProps) {
  const {
    friends,
    friendships,
    pendingIncoming,
    pendingOutgoing,
    blockedUserIds,
    sendFriendRequest,
    respondFriendRequest,
    unblockUser,
    openDmWithFriend,
    presenceMap,
  } = useApp();
  const { t } = useI18n();

  const [tab, setTab] = useState<FriendsTab>("online");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const pendingCount = pendingIncoming.length;
  // Search applies to every tab (previously the box only showed on some
  // tabs, so pending/blocked lists couldn't be filtered at all).
  const matchQuery = (p: Profile | null | undefined) => {
    const q = query.trim().toLowerCase();
    if (!q || !p) return !q;
    return displayName(p).toLowerCase().includes(q) || (p.username ?? "").toLowerCase().includes(q);
  };
  const visiblePendingIncoming = pendingIncoming.filter((f) => matchQuery(f.requester));
  const visiblePendingOutgoing = pendingOutgoing.filter((f) => matchQuery(f.addressee));

  const blocked = useMemo(
    () =>
      friendships
        .filter((f) => f.status === "blocked" && blockedUserIds.has(f.addressee_id))
        .map((f) => f.addressee)
        .filter((p): p is Profile => !!p)
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [friendships, blockedUserIds],
  );
  const visibleBlocked = blocked.filter((p) => matchQuery(p));

  const visible = useMemo(() => {
    const base = tab === "online" ? friends.filter((f) => (presenceMap.get(f.id) ?? "offline") !== "offline") : friends;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (f) =>
            displayName(f).toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q),
        )
      : base;
    return [...filtered].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [friends, tab, query, presenceMap]);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = addValue.trim();
    if (!name || sending) return;
    setSending(true);
    setAddError(null);
    setAddSuccess(null);
    const err = await sendFriendRequest(name);
    if (err) {
      setAddError(err);
    } else {
      setAddSuccess(t("Friend request sent to {name}.", { name }));
      setAddValue("");
    }
    setSending(false);
  }

  const heading =
    tab === "pending"
      ? t("Pending — {count}", { count: pendingIncoming.length + pendingOutgoing.length })
      : tab === "blocked"
        ? t("Blocked — {count}", { count: blocked.length })
        : tab === "online"
          ? t("Online — {count}", { count: visible.length })
          : t("All friends — {count}", { count: visible.length });

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="relative z-[2] flex h-14 shrink-0 items-center gap-2 border-b border-column-border px-4">
        <IconFriends size={22} className="shrink-0 text-channels-default" />
        <h1 className="shrink-0 text-[16px] font-semibold text-header-primary">{t("My friends")}</h1>

        <span className="mx-2 h-6 w-px shrink-0 bg-divider" />

        <nav className="flex items-center gap-1.5 overflow-x-auto">
          {(["online", "all", "pending", "blocked"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setAddOpen(false);
              }}
              className={`flex h-8 shrink-0 items-center rounded-lg px-3 text-[15px] font-medium leading-5 transition-colors ${
                tab === id && !addOpen
                  ? "bg-interactive-selected text-interactive-active"
                  : "text-interactive-normal hover:bg-interactive-hover hover:text-text-normal"
              }`}
            >
              {t(TAB_LABEL[id])}
              {id === "pending" && pendingCount > 0 && (
                <span
                  key={pendingCount}
                  className="badge-pop ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[12px] font-bold leading-none text-white"
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              setAddOpen((v) => !v);
              setAddError(null);
              setAddSuccess(null);
            }}
            className={`flex h-8 shrink-0 items-center rounded-lg px-3 text-[15px] font-semibold leading-5 transition-colors ${
              addOpen
                ? "bg-brand-soft text-brand"
                : "bg-brand text-brand-foreground hover:bg-brand-hover"
            }`}
          >
            {t("Add friend")}
          </button>
        </nav>
      </header>

      {addOpen && (
        <div className="view-enter flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
          <h2 className="text-[20px] font-bold leading-6 text-header-primary">{t("Add friend")}</h2>
          <p className="mt-1.5 text-[14px] leading-5 text-text-muted">
            {t("You can add friends by their Disband username.")}
          </p>
          {/* One field with the button inside it; the border turns red or green with the result. */}
          <form
            onSubmit={submitAdd}
            className={`mt-4 flex h-[52px] max-w-2xl items-center gap-2 rounded-xl border bg-bg-secondary pl-4 pr-1.5 transition-colors focus-within:border-brand ${
              addError ? "border-status-dnd" : addSuccess ? "border-status-online" : "border-border-subtle"
            }`}
          >
            <span aria-hidden className="text-[15px] font-semibold text-text-muted">@</span>
            <input
              autoFocus
              value={addValue}
              onChange={(e) => {
                setAddValue(e.target.value);
                setAddError(null);
                setAddSuccess(null);
              }}
              aria-label={t("Username")}
              placeholder={t("Enter a username")}
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-text-normal outline-none placeholder:text-text-muted"
            />
            <button
              type="submit"
              disabled={!addValue.trim() || sending}
              aria-busy={sending}
              className="h-10 shrink-0 rounded-lg bg-brand px-4 text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted"
            >
              {sending ? <LoadingDots size={6} /> : t("Send request")}
            </button>
          </form>
          <div aria-live="polite" className="min-h-[24px] pt-2">
            {addError && <p className="text-[13px] text-status-dnd">{addError}</p>}
            {addSuccess && <p className="text-[13px] text-status-online">{addSuccess}</p>}
          </div>

        </div>
      )}

      {!addOpen && (
        <div className="shrink-0 px-6 pb-2 pt-4">
          <div className="relative">
            <IconSearch
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "online" ? t("Search online friends") : t("Search friends")}
              className="h-11 w-full rounded-lg border border-border-subtle bg-bg-secondary-alt pl-10 pr-10 text-[15px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-border-strong"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("Clear search")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-normal"
              >
                <IconClose size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {!addOpen && (
        <div key={tab} className="view-enter min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <p className="sticky top-0 z-10 bg-bg-primary pb-2 pt-4 text-[12px] font-semibold uppercase leading-4 tracking-[0.04em] text-text-muted">
            {heading}
          </p>

          {tab === "pending" ? (
            visiblePendingIncoming.length === 0 && visiblePendingOutgoing.length === 0 ? (
              <p className="py-10 text-sm text-text-muted">
                {query.trim()
                  ? t("No pending requests match “{query}”.", { query: query.trim() })
                  : t("There are no pending friend requests.")}
              </p>
            ) : (
              <PendingList
                incoming={visiblePendingIncoming}
                outgoing={visiblePendingOutgoing}
                onRespond={respondFriendRequest}
                onOpenProfile={onOpenProfile}
              />
            )
          ) : tab === "blocked" ? (
            visibleBlocked.length === 0 ? (
              <p className="py-10 text-sm text-text-muted">
                {query.trim()
                  ? t("No blocked users match “{query}”.", { query: query.trim() })
                  : t("You haven’t blocked anyone.")}
              </p>
            ) : (
              <ul className="border-t border-divider">
                {visibleBlocked.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 border-b border-divider py-2.5"
                  >
                    <Avatar profile={person} size="md" className="opacity-60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold leading-5 text-header-primary">
                        {displayName(person)}
                      </p>
                      <p className="truncate text-[13px] text-text-muted">{t("Blocked")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void unblockUser(person.id)}
                      className="shrink-0 rounded-full border border-divider px-4 py-1.5 text-[13px] font-semibold text-text-normal transition-all hover:border-text-muted hover:bg-interactive-hover"
                    >
                      {t("Unblock")}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : visible.length === 0 ? (
            <EmptyState
              query={query}
              tab={tab}
              totalFriends={friends.length}
              onAdd={() => setAddOpen(true)}
            />
          ) : (
            <ul>
              {visible.map((friend) => (
                <li key={friend.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenProfile(friend)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenProfile(friend);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onFriendContext(friend, e.clientX, e.clientY);
                    }}
                    className="group -mx-3 flex h-[62px] cursor-pointer items-center gap-3 rounded-xl px-3 transition-colors hover:bg-interactive-hover"
                  >
                    <StatusAvatar profile={friend} presence={presenceMap} />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 text-[16px] font-semibold leading-5 text-header-primary">
                        <span className="truncate">{displayName(friend)}</span>
                        <GuildTag userId={friend.id} size="sm" />
                        {friend.username && (
                          <span className="truncate text-sm font-normal text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            @{friend.username}
                          </span>
                        )}
                      </p>
                      {(friend.pronouns || activeStatusNote(friend)) && (
                        <p className="truncate text-[12px] text-text-muted/80">
                          <span className="font-medium text-brand">{friend.pronouns}</span>
                          {friend.pronouns && activeStatusNote(friend) && (
                            <span className="mx-1 text-text-muted/40">·</span>
                          )}
                          <span className="italic">{activeStatusNote(friend)}</span>
                        </p>
                      )}
                      <p className="truncate text-[13px] text-text-muted">
                        {t(STATUS_LABEL[presenceMap.get(friend.id) ?? "offline"])}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RowAction label={t("Message")} onClick={() => void openDmWithFriend(friend.id)}>
                        <IconMessage />
                      </RowAction>
                      <RowAction
                        label={t("More")}
                        onClick={(e) => {
                          // Anchor to the clicked button itself: the old code
                          // read document.activeElement, which mispositions
                          // the menu for keyboard users and focus jumps.
                          const rect = e.currentTarget.getBoundingClientRect();
                          onFriendContext(friend, rect.left, rect.bottom + 4);
                        }}
                      >
                        <IconMore />
                      </RowAction>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

function EmptyState({
  query,
  tab,
  totalFriends,
  onAdd,
}: {
  query: string;
  tab: FriendsTab;
  totalFriends: number;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  if (query) {
    return (
      <p className="py-10 text-sm text-text-muted">
        {t("No friends match “{query}”.", { query })}
      </p>
    );
  }
  if (totalFriends === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary text-interactive-normal">
          <IconFriends size={34} />
        </span>
        <h2 className="text-[20px] font-semibold text-header-primary">{t("No friends yet")}</h2>
        <p className="mt-1.5 max-w-sm text-[15px] text-text-muted">
          {t("Add someone by their username to start sending messages and calls.")}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
        >
          {t("Add friend")}
        </button>
      </div>
    );
  }
  if (tab === "online") {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary text-interactive-normal">
          <IconFriends size={34} />
        </span>
        <h2 className="text-[20px] font-semibold text-header-primary">{t("Nobody's around right now")}</h2>
        <p className="mt-1.5 max-w-sm text-[15px] text-text-muted">
          {t("Friends show up here the moment they come online.")}
        </p>
      </div>
    );
  }
  return <p className="py-10 text-sm text-text-muted">{t("No friends to show.")}</p>;
}

function PendingList({
  incoming,
  outgoing,
  onRespond,
  onOpenProfile,
}: {
  incoming: ReturnType<typeof useApp>["pendingIncoming"];
  outgoing: ReturnType<typeof useApp>["pendingOutgoing"];
  onRespond: (id: string, accept: boolean) => Promise<void>;
  onOpenProfile: (profile: Profile) => void;
}) {
  const { presenceMap } = useApp();
  const { t } = useI18n();
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <p className="py-10 text-sm text-text-muted">{t("There are no pending friend requests.")}</p>
    );
  }

  return (
    <ul className="border-t border-divider">
      {incoming.map((f) => (
        <li
          key={f.id}
          className="flex items-center gap-3 border-b border-divider py-2.5"
        >
          {f.requester && <StatusAvatar profile={f.requester} presence={presenceMap} />}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => f.requester && onOpenProfile(f.requester)}
              className="block truncate text-[15px] font-semibold text-text-normal hover:underline"
            >
              {f.requester ? displayName(f.requester) : t("Unknown user")}
            </button>
            <p className="text-[13px] text-text-muted">{t("Incoming friend request")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RowAction label={t("Accept")} onClick={() => void onRespond(f.id, true)}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </RowAction>
            <RowAction label={t("Ignore")} onClick={() => void onRespond(f.id, false)}>
              <IconClose size={18} />
            </RowAction>
          </div>
        </li>
      ))}

      {outgoing.map((f) => (
        <li
          key={f.id}
          className="flex items-center gap-3 border-b border-divider py-2.5"
        >
          {f.addressee && <StatusAvatar profile={f.addressee} presence={presenceMap} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-text-normal">
              {f.addressee ? displayName(f.addressee) : "…"}
            </p>
            <p className="text-[13px] text-text-muted">{t("Outgoing friend request")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RowAction label={t("Cancel request")} onClick={() => void onRespond(f.id, false)}>
              <IconClose size={18} />
            </RowAction>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ActiveNowPanel() {
  const { friends, dmListEntries, presenceMap } = useApp();
  const { t } = useI18n();

  const active = useMemo(() => {
    const inDm = new Set(dmListEntries.map((e) => e.friend.id));
    return friends
      .filter((f) => {
        const live = presenceMap.get(f.id) ?? "offline";
        return live === "online" || live === "idle" || live === "dnd";
      })
      .sort((a, b) => Number(inDm.has(b.id)) - Number(inDm.has(a.id)))
      .slice(0, 12);
  }, [friends, dmListEntries, presenceMap]);

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col overflow-hidden border-l border-column-border bg-bg-primary xl:flex">
      <div className="flex h-14 shrink-0 items-center px-5">
        <h2 className="text-[20px] font-bold leading-6 text-header-primary">{t("Active now")}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {active.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 pb-16 text-center">
            <span aria-hidden className="mb-3 text-[28px] font-bold leading-none text-text-muted">z<sup className="text-[20px]">z</sup></span>
            <p className="text-[16px] font-semibold text-header-primary">{t("It’s quiet for now…")}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {t("When a friend starts an activity or comes online, you’ll see them here.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 pt-1">
            {active.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-secondary-alt px-3.5 py-3 transition-colors hover:border-border-strong">
                <StatusAvatar profile={f} presence={presenceMap} ring="var(--bg-secondary-alt)" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-normal">
                    {displayName(f)}
                  </p>
                  <p className="truncate text-[13px] text-text-muted">{t(STATUS_LABEL[presenceMap.get(f.id) ?? "offline"])}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
