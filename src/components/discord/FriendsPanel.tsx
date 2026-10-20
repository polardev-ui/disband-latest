"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
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

function StatusAvatar({ profile, presence }: { profile: Profile; presence: PresenceMap }) {
  const live = presence.get(profile.id) ?? "offline";
  return (
    <div className="relative shrink-0">
      <Avatar profile={profile} size="sm" />
      <StatusDot status={live} ring="var(--bg-primary)" className="absolute -bottom-[3px] -right-[3px] group-hover:![background:var(--interactive-hover)]" />
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
      className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-secondary text-interactive-normal transition-colors hover:text-interactive-active group-hover:bg-bg-tertiary"
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
      setAddSuccess(`Friend request sent to ${name}.`);
      setAddValue("");
    }
    setSending(false);
  }

  const heading =
    tab === "pending"
      ? `Pending — ${pendingIncoming.length + pendingOutgoing.length}`
      : tab === "blocked"
        ? `Blocked — ${blocked.length}`
        : tab === "online"
          ? `Online — ${visible.length}`
          : `All friends — ${visible.length}`;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="relative z-[2] flex h-12 shrink-0 items-center gap-2 px-4 shadow-[var(--elevation-low)]">
        <IconFriends size={24} className="shrink-0 text-channels-default" />
        <h1 className="shrink-0 text-[16px] font-semibold text-header-primary">Friends</h1>

        <span className="mx-2 h-6 w-px shrink-0 bg-divider" />

        <nav className="flex items-center gap-4 overflow-x-auto">
          {(["online", "all", "pending", "blocked"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setAddOpen(false);
              }}
              className={`flex shrink-0 items-center rounded-[4px] px-2 py-0.5 text-[16px] font-medium capitalize leading-5 transition-colors ${
                tab === t && !addOpen
                  ? "bg-interactive-selected text-interactive-active"
                  : "text-interactive-normal hover:bg-interactive-hover hover:text-text-normal"
              }`}
            >
              {t}
              {t === "pending" && pendingCount > 0 && (
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
            className={`shrink-0 rounded-[4px] px-2 py-0.5 text-[16px] font-medium leading-5 transition-colors ${
              addOpen
                ? "bg-transparent text-[#2dc770]"
                : "bg-button-green text-white hover:bg-button-green-hover"
            }`}
          >
            Add Friend
          </button>
        </nav>
      </header>

      {addOpen && (
        <div className="shrink-0 border-b border-divider px-[30px] py-5">
          <h2 className="text-[16px] font-semibold uppercase leading-5 text-header-primary">Add Friend</h2>
          <p className="mt-1 text-sm text-text-muted">
            You can add friends by their Disband username.
          </p>
          <form onSubmit={submitAdd} className="mt-3 flex max-w-xl gap-2">
            <input
              autoFocus
              value={addValue}
              onChange={(e) => {
                setAddValue(e.target.value);
                setAddError(null);
                setAddSuccess(null);
              }}
              placeholder="Enter a username"
              className="min-w-0 flex-1 rounded-lg border border-bg-tertiary bg-bg-tertiary px-3 py-3 text-[16px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-[#00a8fc] focus:ring-brand/20"
            />
            <button
              type="submit"
              disabled={!addValue.trim() || sending}
              className="shrink-0 rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send request"}
            </button>
          </form>
          {addError && <p className="mt-2 text-sm text-status-dnd">{addError}</p>}
          {addSuccess && <p className="mt-2 text-sm text-status-online">{addSuccess}</p>}
        </div>
      )}

      {!addOpen && (
        <div className="shrink-0 px-[30px] pb-2 pt-4">
          <div className="relative">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "online" ? "Search online friends" : "Search friends"}
              className="w-full rounded-[4px] border border-transparent bg-bg-tertiary py-[5px] pl-2 pr-10 text-[16px] text-text-normal outline-none placeholder:text-text-muted focus:ring-0 focus:ring-brand/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-normal"
              >
                <IconClose size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {!addOpen && (
        <div key={tab} className="view-enter min-h-0 flex-1 overflow-y-auto px-[30px] pb-6">
          <p className="sticky top-0 z-10 bg-bg-primary pb-2 pt-4 text-[12px] font-semibold uppercase leading-4 tracking-[0.02em] text-header-secondary">
            {heading}
          </p>

          {tab === "pending" ? (
            visiblePendingIncoming.length === 0 && visiblePendingOutgoing.length === 0 ? (
              <p className="py-10 text-sm text-text-muted">
                {query.trim()
                  ? `No pending requests match “${query.trim()}”.`
                  : "There are no pending friend requests."}
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
                  ? `No blocked users match “${query.trim()}”.`
                  : "You haven’t blocked anyone."}
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
                      <p className="truncate text-[13px] text-text-muted">Blocked</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void unblockUser(person.id)}
                      className="shrink-0 rounded-full border border-divider px-4 py-1.5 text-[13px] font-semibold text-text-normal transition-all hover:border-text-muted hover:bg-interactive-hover"
                    >
                      Unblock
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
            <ul className="border-t border-divider">
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
                    className="group -mx-2.5 flex h-[62px] cursor-pointer items-center gap-3 rounded-lg border-t border-divider/60 px-2.5 transition-colors hover:rounded-lg hover:border-transparent hover:bg-interactive-hover [&+li]:hover:border-transparent"
                  >
                    <StatusAvatar profile={friend} presence={presenceMap} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold leading-5 text-header-primary">
                        {displayName(friend)}
                        {friend.username && (
                          <span className="ml-1.5 text-sm font-normal text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
                        {STATUS_LABEL[presenceMap.get(friend.id) ?? "offline"]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RowAction label="Message" onClick={() => void openDmWithFriend(friend.id)}>
                        <IconMessage />
                      </RowAction>
                      <RowAction
                        label="More"
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
  if (query) {
    return (
      <p className="py-10 text-sm text-text-muted">
        No friends match &ldquo;{query}&rdquo;.
      </p>
    );
  }
  if (totalFriends === 0) {
    return (
      <div className="py-12">
        <IconFriends size={48} className="mb-4 text-text-muted" />
        <h2 className="text-lg font-semibold text-text-normal">No friends yet</h2>
        <p className="mt-1 max-w-sm text-sm text-text-muted">
          Add someone by their username to start sending messages and calls.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          Add Friend
        </button>
      </div>
    );
  }
  return (
    <p className="py-10 text-sm text-text-muted">
      {tab === "online"
        ? "Nobody's online right now."
        : "No friends to show."}
    </p>
  );
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
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <p className="py-10 text-sm text-text-muted">There are no pending friend requests.</p>
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
              {f.requester ? displayName(f.requester) : "Unknown user"}
            </button>
            <p className="text-[13px] text-text-muted">Incoming friend request</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RowAction label="Accept" onClick={() => void onRespond(f.id, true)}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </RowAction>
            <RowAction label="Ignore" onClick={() => void onRespond(f.id, false)}>
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
            <p className="text-[13px] text-text-muted">Outgoing friend request</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RowAction label="Cancel request" onClick={() => void onRespond(f.id, false)}>
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
    <aside className="hidden w-[360px] shrink-0 flex-col overflow-hidden border-l border-divider bg-bg-primary xl:flex">
      <div className="flex shrink-0 items-center px-4 pb-4 pt-4">
        <h2 className="text-[20px] font-extrabold leading-6 text-header-primary">Active Now</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {active.length === 0 ? (
          <div className="pt-2 text-center">
            <p className="text-[16px] font-semibold text-header-primary">It&rsquo;s quiet for now...</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              When a friend starts an activity or comes online, you&rsquo;ll see them here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 pt-1">
            {active.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg border border-bg-secondary bg-bg-secondary px-4 py-3 transition-colors hover:bg-interactive-hover">
                <StatusAvatar profile={f} presence={presenceMap} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-normal">
                    {displayName(f)}
                  </p>
                  <p className="truncate text-[13px] text-text-muted">{STATUS_LABEL[presenceMap.get(f.id) ?? "offline"]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
