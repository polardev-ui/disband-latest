"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconFriends, IconSearch, IconClose } from "@/components/icons";
import type { Profile, UserStatus } from "@/lib/supabase/types";

type FriendsTab = "online" | "all" | "pending" | "blocked";

const STATUS_DOT: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

function StatusAvatar({ profile }: { profile: Profile }) {
  return (
    <div className="relative shrink-0">
      <Avatar profile={profile} size="md" />
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-[13px] w-[13px] rounded-full border-[3px] border-bg-primary ${
          STATUS_DOT[profile.status]
        }`}
      />
    </div>
  );
}

/** Circular hover action, matching the message/overflow buttons in the mock. */
function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary text-text-muted transition-colors hover:bg-interactive-selected hover:text-text-normal"
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
  } = useApp();

  const [tab, setTab] = useState<FriendsTab>("online");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const pendingCount = pendingIncoming.length;

  // Blocked rows live on the friendships table; the profile is already joined on.
  const blocked = useMemo(
    () =>
      friendships
        .filter((f) => f.status === "blocked" && blockedUserIds.has(f.addressee_id))
        .map((f) => f.addressee)
        .filter((p): p is Profile => !!p)
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [friendships, blockedUserIds],
  );

  const visible = useMemo(() => {
    const base = tab === "online" ? friends.filter((f) => f.status !== "offline") : friends;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (f) =>
            displayName(f).toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q),
        )
      : base;
    return [...filtered].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [friends, tab, query]);

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
      {/* Header: title, tab strip, and the Add Friend affordance */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <IconFriends size={22} className="shrink-0 text-text-muted" />
        <h1 className="shrink-0 text-[15px] font-semibold text-text-normal">My Friends</h1>

        <span className="mx-1 h-6 w-px shrink-0 bg-divider" />

        <nav className="flex items-center gap-1 overflow-x-auto">
          {(["online", "all", "pending", "blocked"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setAddOpen(false);
              }}
              className={`shrink-0 rounded px-2.5 py-1 text-sm capitalize transition-colors ${
                tab === t && !addOpen
                  ? "bg-interactive-selected text-text-normal"
                  : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
              }`}
            >
              {t}
              {t === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-status-dnd px-1.5 text-[10px] font-bold text-white">
                  {pendingCount}
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
            className={`ml-1 shrink-0 rounded px-2.5 py-1 text-sm font-medium transition-colors ${
              addOpen
                ? "bg-brand-hover text-white"
                : "bg-brand text-white hover:bg-brand-hover"
            }`}
          >
            Add Friend
          </button>
        </nav>
      </header>

      {/* Add-friend form lives in the main pane, not crammed into the sidebar */}
      {addOpen && (
        <div className="shrink-0 border-b border-black/20 px-6 py-5">
          <h2 className="text-[15px] font-semibold text-text-normal">Add a friend</h2>
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
              className="min-w-0 flex-1 rounded-md border border-divider bg-bg-tertiary px-3.5 py-2.5 text-sm text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-brand/60"
            />
            <button
              type="submit"
              disabled={!addValue.trim() || sending}
              className="shrink-0 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send request"}
            </button>
          </form>
          {addError && <p className="mt-2 text-sm text-status-dnd">{addError}</p>}
          {addSuccess && <p className="mt-2 text-sm text-status-online">{addSuccess}</p>}
        </div>
      )}

      {!addOpen && tab !== "pending" && tab !== "blocked" && (
        <div className="shrink-0 px-6 pb-2 pt-4">
          <div className="relative">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "online" ? "Search online friends" : "Search friends"}
              className="w-full rounded-md bg-bg-tertiary py-2.5 pl-9 pr-9 text-sm text-text-normal outline-none placeholder:text-text-muted"
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
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <p className="sticky top-0 z-10 bg-bg-primary py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
            {heading}
          </p>

          {tab === "pending" ? (
            <PendingList
              incoming={pendingIncoming}
              outgoing={pendingOutgoing}
              onRespond={respondFriendRequest}
              onOpenProfile={onOpenProfile}
            />
          ) : tab === "blocked" ? (
            blocked.length === 0 ? (
              <p className="py-10 text-sm text-text-muted">You haven&rsquo;t blocked anyone.</p>
            ) : (
              <ul className="border-t border-divider">
                {blocked.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 border-b border-divider py-2.5"
                  >
                    <Avatar profile={person} size="md" className="opacity-60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-text-normal">
                        {displayName(person)}
                      </p>
                      <p className="truncate text-[13px] text-text-muted">Blocked</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void unblockUser(person.id)}
                      className="shrink-0 rounded-md border border-divider px-3 py-1.5 text-[13px] font-medium text-text-normal transition-colors hover:border-text-muted hover:bg-interactive-hover"
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
                    className="group -mx-3 flex cursor-pointer items-center gap-3 rounded-lg border-b border-divider px-3 py-2.5 transition-colors hover:bg-interactive-hover"
                  >
                    <StatusAvatar profile={friend} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-text-normal">
                        {displayName(friend)}
                        {friend.username && (
                          <span className="ml-1.5 text-sm font-normal text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
                            @{friend.username}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[13px] text-text-muted">
                        {STATUS_LABEL[friend.status]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RowAction label="Message" onClick={() => void openDmWithFriend(friend.id)}>
                        <IconMessage />
                      </RowAction>
                      <RowAction
                        label="More"
                        onClick={() => {
                          const el = document.activeElement as HTMLElement | null;
                          const rect = el?.getBoundingClientRect();
                          onFriendContext(friend, rect ? rect.left : 0, rect ? rect.bottom + 4 : 0);
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
          {f.requester && <StatusAvatar profile={f.requester} />}
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
          {f.addressee && <StatusAvatar profile={f.addressee} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-text-normal">
              {f.addressee ? displayName(f.addressee) : "…"}
            </p>
            <p className="text-[13px] text-text-muted">Outgoing friend request</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Right rail — mirrors the "Active Now" column in the reference layout. */
export function ActiveNowPanel() {
  const { friends, dmListEntries } = useApp();

  const active = useMemo(() => {
    const inDm = new Set(dmListEntries.map((e) => e.friend.id));
    return friends
      .filter((f) => f.status === "online" || f.status === "idle" || f.status === "dnd")
      .sort((a, b) => Number(inDm.has(b.id)) - Number(inDm.has(a.id)))
      .slice(0, 12);
  }, [friends, dmListEntries]);

  return (
    <aside className="hidden w-[22rem] shrink-0 flex-col overflow-hidden border-l border-black/20 bg-bg-primary xl:flex">
      <div className="flex h-12 shrink-0 items-center px-6">
        <h2 className="text-[17px] font-semibold text-text-normal">Active Now</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {active.length === 0 ? (
          <div className="pt-2">
            <p className="text-[15px] font-semibold text-text-normal">It&rsquo;s quiet for now</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              When a friend starts an activity or comes online, you&rsquo;ll see them here.
            </p>
          </div>
        ) : (
          <ul className="space-y-1 pt-1">
            {active.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <StatusAvatar profile={f} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-normal">
                    {displayName(f)}
                  </p>
                  <p className="truncate text-[13px] text-text-muted">{STATUS_LABEL[f.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
