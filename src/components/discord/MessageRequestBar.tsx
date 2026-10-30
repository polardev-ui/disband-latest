"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

/**
 * Sits above the composer in a DM that is still a message request
 * (migration 0193). The recipient can accept, ignore or block; replying
 * accepts too. The sender just sees that their message went as a request.
 */
export function MessageRequestBar({ threadId, friend }: { threadId: string; friend: Profile }) {
  const { isIncomingRequest, isOutgoingRequest, respondMessageRequest, blockUser, setViewHome } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(friend);

  if (isOutgoingRequest(threadId)) {
    return (
      <p className="mx-4 mb-2 text-[13px] leading-5 text-text-muted">
        You&apos;re not friends with {name}, so your messages arrive as a message request until they reply or accept.
      </p>
    );
  }
  if (!isIncomingRequest(threadId)) return null;

  async function run(action: () => Promise<string | null>, leave: boolean) {
    setBusy(true);
    setError(null);
    const err = await action();
    setBusy(false);
    if (err) return setError(err);
    if (leave) setViewHome();
  }

  return (
    <div className="mx-4 mb-2 rounded-lg border border-divider bg-bg-secondary px-4 py-3">
      <p className="text-[14px] font-semibold text-text-normal">{name} wants to message you</p>
      <p className="mt-0.5 text-[13px] leading-5 text-text-muted">
        You&apos;re not friends, but you share a space. They won&apos;t know you&apos;ve seen this unless you reply.
        Replying or accepting moves the conversation to your Direct Messages.
      </p>
      {error && <p className="mt-2 text-[13px] text-status-dnd">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => respondMessageRequest(threadId, "accept"), false)}
          className="rounded-[3px] bg-brand px-4 py-1.5 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => respondMessageRequest(threadId, "ignore"), true)}
          className="rounded-[3px] bg-button-secondary px-4 py-1.5 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:opacity-50"
        >
          Ignore
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => blockUser(friend.id), true)}
          className="rounded-[3px] px-4 py-1.5 text-[14px] font-medium text-status-dnd transition-colors hover:bg-status-dnd/10 disabled:opacity-50"
        >
          Block
        </button>
      </div>
    </div>
  );
}
