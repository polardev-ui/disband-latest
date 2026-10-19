"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { IconCheck, IconSearch, IconSend } from "@/components/icons";
import { displayName } from "@/lib/utils";

interface SendInvitePanelProps {
  inviteUrl: string;
  serverName: string;
}

/** Friends you can DM the invite to. Renders as rows inside a settings card. */
export function SendInvitePanel({ inviteUrl, serverName }: SendInvitePanelProps) {
  const { friends, sendInviteToFriend } = useApp();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => `${displayName(f)} ${f.username ?? ""}`.toLowerCase().includes(q));
  }, [friends, query]);

  async function handleSend(friendId: string) {
    setSendingId(friendId);
    setError(null);
    const err = await sendInviteToFriend(friendId, inviteUrl, serverName);
    if (err) setError(err);
    else setSentIds((prev) => new Set(prev).add(friendId));
    setSendingId(null);
  }

  if (friends.length === 0) {
    return <p className="px-5 py-4 text-[14px] text-text-muted">Add some friends and you can send them invites from here.</p>;
  }

  return (
    <div>
      {friends.length > 6 && (
        <div className="border-b border-divider px-5 py-3">
          <label className="relative block">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends"
              aria-label="Search friends"
              className="h-9 w-full rounded-[3px] border border-transparent bg-bg-tertiary pl-9 pr-3 text-[14px] text-text-normal outline-none placeholder:text-text-muted/80 focus:border-[#00a8fc]"
            />
          </label>
        </div>
      )}
      <ul className="max-h-[320px] overflow-y-auto">
        {shown.map((friend) => {
          const sent = sentIds.has(friend.id);
          const sending = sendingId === friend.id;
          return (
            <li key={friend.id} className="flex items-center gap-3 border-b border-divider px-5 py-2.5 last:border-b-0">
              <Avatar profile={friend} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-text-normal">{displayName(friend)}</p>
                {friend.username && <p className="truncate text-[12.5px] text-text-muted">@{friend.username}</p>}
              </div>
              <button
                type="button"
                disabled={sent || sending}
                onClick={() => void handleSend(friend.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold transition-colors duration-150 disabled:pointer-events-none ${
                  sent ? "text-status-online" : "border border-divider text-text-normal hover:bg-interactive-hover disabled:opacity-50"
                }`}
              >
                {sent ? <IconCheck size={14} /> : <IconSend size={14} />}
                {sent ? "Sent" : sending ? "Sending…" : "Send"}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-5 py-4 text-[14px] text-text-muted">No friends match &ldquo;{query.trim()}&rdquo;.</li>}
      </ul>
      {error && <p className="border-t border-divider px-5 py-3 text-[13px] text-status-dnd">{error}</p>}
    </div>
  );
}
