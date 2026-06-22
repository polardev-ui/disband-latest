"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { IconSend } from "@/components/icons";
import { displayName } from "@/lib/utils";

interface SendInvitePanelProps {
  inviteUrl: string;
  serverName: string;
}

export function SendInvitePanel({ inviteUrl, serverName }: SendInvitePanelProps) {
  const { friends, sendInviteToFriend } = useApp();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleSend(friendId: string) {
    setSendingId(friendId);
    setError(null);
    const err = await sendInviteToFriend(friendId, inviteUrl, serverName);
    if (err) setError(err);
    else setSentIds((prev) => new Set(prev).add(friendId));
    setSendingId(null);
  }

  if (friends.length === 0) {
    return (
      <p className="rounded-lg border border-divider bg-bg-secondary p-4 text-sm text-text-muted">
        Add friends first to send invites directly from here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Send the invite link in a DM — no copy/paste needed.</p>
      <ul className="divide-y divide-divider overflow-hidden rounded-lg border border-divider bg-bg-secondary">
        {friends.map((friend) => {
          const sent = sentIds.has(friend.id);
          const sending = sendingId === friend.id;
          return (
            <li key={friend.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar profile={friend} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{displayName(friend)}</p>
                {friend.username && (
                  <p className="truncate text-xs text-text-muted">@{friend.username}</p>
                )}
              </div>
              <button
                type="button"
                disabled={sent || sending}
                onClick={() => void handleSend(friend.id)}
                className="flex shrink-0 items-center gap-1.5 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                <IconSend size={14} />
                {sent ? "Sent" : sending ? "Sending…" : "Send"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-status-dnd">{error}</p>}
    </div>
  );
}
