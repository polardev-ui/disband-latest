"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconFriends, IconGroup, IconPlus } from "@/components/icons";
import { UserPanel } from "./UserPanel";
import { CreateGroupChatModal } from "@/components/modals/CreateGroupChatModal";
import type { GroupChatWithMembers } from "@/lib/supabase/types";

const STATUS_BG = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
} as const;

interface HomePanelProps {
  onOpenSettings: () => void;
  onUserPanelContext?: (e: React.MouseEvent) => void;
  onFriendClick?: (friendId: string) => void;
  onGroupContext?: (group: GroupChatWithMembers, x: number, y: number) => void;
}

export function HomePanel({ onOpenSettings, onUserPanelContext, onFriendClick, onGroupContext }: HomePanelProps) {
  const {
    friends,
    pendingIncoming,
    pendingOutgoing,
    dmThreads,
    groupChats,
    groupCallCounts,
    activeGroupChatId,
    activeDmThreadId,
    viewMode,
    notifications,
    markNotificationsRead,
    sendFriendRequest,
    respondFriendRequest,
    openDmWithFriend,
    selectDmThread,
    selectGroupChat,
  } = useApp();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"friends" | "pending">("friends");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = await sendFriendRequest(username.trim());
    if (err) setError(err);
    else setUsername("");
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden bg-bg-secondary">
      <header className="flex h-12 items-center border-b border-black/20 px-4 shadow-sm">
        <IconFriends className="mr-2 text-text-muted" />
        <span className="flex-1 font-semibold text-text-normal">Friends</span>
        {unreadNotifs > 0 && (
          <button
            type="button"
            onClick={() => void markNotificationsRead()}
            className="text-[11px] font-medium text-brand hover:underline"
            title="Mark all notifications read"
          >
            {unreadNotifs} new
          </button>
        )}
      </header>

      <div className="flex gap-1 px-2 pt-2">
        {(["friends", "pending"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-2 py-1 text-sm capitalize transition-all duration-150 ${
              tab === t ? "bg-interactive-selected text-text-normal" : "text-text-muted hover:bg-interactive-hover"
            }`}
          >
            {t}
            {t === "pending" && pendingIncoming.length > 0 && (
              <span className="ml-1 rounded-full bg-status-dnd px-1.5 text-[10px] text-white">
                {pendingIncoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <form onSubmit={addFriend} className="px-2 py-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Add by username"
          className="w-full rounded bg-bg-accent px-2 py-1.5 text-sm text-text-normal outline-none focus:ring-1 focus:ring-brand"
        />
        {error && <p className="mt-1 text-xs text-status-dnd">{error}</p>}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {tab === "friends" && (
          <>
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-xs font-bold uppercase text-text-muted">Group Chats — {groupChats.length}</p>
              <button
                type="button"
                onClick={() => setCreateGroupOpen(true)}
                title="Create group"
                className="rounded p-0.5 text-text-muted hover:bg-interactive-hover hover:text-text-normal"
              >
                <IconPlus size={16} />
              </button>
            </div>
            {groupChats.map((g) => {
              const inCallCount = groupCallCounts.get(g.id) ?? 0;
              const active = viewMode === "group" && activeGroupChatId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => void selectGroupChat(g.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onGroupContext?.(g, e.clientX, e.clientY);
                  }}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover ${
                    active ? "bg-interactive-selected" : ""
                  }`}
                >
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand">
                    <IconGroup size={16} />
                    {inCallCount > 0 && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary bg-status-online" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">{g.name}</span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {g.members.length} members
                      {inCallCount > 0 ? ` · ${inCallCount} in voice` : ""}
                    </span>
                  </div>
                </button>
              );
            })}

            <p className="mt-3 px-2 py-1 text-xs font-bold uppercase text-text-muted">
              Direct Messages — {dmThreads.length}
            </p>
            {dmThreads.map((t) => {
              const active = viewMode === "dm" && activeDmThreadId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void selectDmThread(t.id)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover ${
                    active ? "bg-interactive-selected" : ""
                  }`}
                >
                <div className="relative">
                  <Avatar profile={t.friend} size="sm" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary ${STATUS_BG[t.friend.status]}`} />
                </div>
                <span className="truncate text-sm">{displayName(t.friend)}</span>
                </button>
              );
            })}

            <p className="mt-3 px-2 py-1 text-xs font-bold uppercase text-text-muted">
              All Friends — {friends.length}
            </p>
            {friends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => (onFriendClick ? onFriendClick(f.id) : void openDmWithFriend(f.id))}
                className="mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover"
              >
                <div className="relative">
                  <Avatar profile={f} size="sm" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary ${STATUS_BG[f.status]}`} />
                </div>
                <span className="truncate text-sm">{displayName(f)}</span>
              </button>
            ))}
          </>
        )}

        {tab === "pending" && (
          <>
            {pendingIncoming.map((f) => (
              <div key={f.id} className="mb-2 rounded bg-bg-accent p-2">
                <div className="flex items-center gap-2">
                  {f.requester && <Avatar profile={f.requester} size="sm" />}
                  <p className="text-sm">{f.requester ? displayName(f.requester) : "Unknown"}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void respondFriendRequest(f.id, true)} className="rounded bg-brand px-2 py-1 text-xs text-white">
                    Accept
                  </button>
                  <button type="button" onClick={() => void respondFriendRequest(f.id, false)} className="rounded bg-interactive-hover px-2 py-1 text-xs">
                    Ignore
                  </button>
                </div>
              </div>
            ))}
            {pendingOutgoing.map((f) => (
              <div key={f.id} className="mb-2 flex items-center gap-2 rounded bg-bg-accent p-2 text-sm text-text-muted">
                {f.addressee && <Avatar profile={f.addressee} size="sm" />}
                Outgoing to {f.addressee ? displayName(f.addressee) : "..."}
              </div>
            ))}
            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
              <p className="px-2 text-sm text-text-muted">No pending requests</p>
            )}
          </>
        )}
      </div>

      <UserPanel onOpenSettings={onOpenSettings} onContextMenu={onUserPanelContext} />
      <CreateGroupChatModal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
    </aside>
  );
}
