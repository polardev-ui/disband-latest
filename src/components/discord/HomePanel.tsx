"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { displayName } from "@/lib/utils";
import { IconFriends } from "@/components/icons";

const STATUS_BG = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
} as const;

export function HomePanel() {
  const {
    friends,
    pendingIncoming,
    pendingOutgoing,
    dmThreads,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    openDmWithFriend,
    selectDmThread,
  } = useApp();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"friends" | "pending">("friends");

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = await sendFriendRequest(username.trim());
    if (err) setError(err);
    else setUsername("");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-bg-secondary">
      <header className="flex h-12 items-center border-b border-black/20 px-4 shadow-sm">
        <IconFriends className="mr-2 text-text-muted" />
        <span className="font-semibold text-text-normal">Friends</span>
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

      <div className="flex-1 overflow-y-auto px-2">
        {tab === "friends" && (
          <>
            <p className="px-2 py-1 text-xs font-bold uppercase text-text-muted">
              Direct Messages — {dmThreads.length}
            </p>
            {dmThreads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void selectDmThread(t.id)}
                className="mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {displayName(t.friend).charAt(0)}
                </div>
                <span className="truncate text-sm">{displayName(t.friend)}</span>
              </button>
            ))}

            <p className="mt-3 px-2 py-1 text-xs font-bold uppercase text-text-muted">
              All Friends — {friends.length}
            </p>
            {friends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => void openDmWithFriend(f.id)}
                className="mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover"
              >
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/80 text-xs font-bold text-white">
                    {displayName(f).charAt(0)}
                  </div>
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
                <p className="text-sm">{f.requester ? displayName(f.requester) : "Unknown"}</p>
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
              <div key={f.id} className="mb-2 rounded bg-bg-accent p-2 text-sm text-text-muted">
                Outgoing to {f.addressee ? displayName(f.addressee) : "..."}
              </div>
            ))}
            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
              <p className="px-2 text-sm text-text-muted">No pending requests</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
