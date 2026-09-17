"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { closePoll, getPoll, totalVotes, votePoll, type Poll } from "@/lib/poll";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconClose } from "@/components/icons";

export function PollCard({ pollId, currentUserId }: { pollId: string; currentUserId?: string | null }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      setPoll(await getPoll(pollId));
      setError(null);
    } catch {
      setError("This poll could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = getSupabaseClient()
      .channel(`poll:${pollId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${pollId}` },
        () => { if (!inFlight.current) void load(); },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "polls", filter: `id=eq.${pollId}` },
        () => { if (!inFlight.current) void load(); },
      )
      .subscribe();
    return () => { void getSupabaseClient().removeChannel(channel); };
  }, [pollId, load]);

  async function vote(index: number) {
    if (busy || !poll || poll.closed) return;
    setBusy(true);
    inFlight.current = true;
    try {
      setPoll(await votePoll(pollId, index));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record your vote.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function close() {
    if (busy || !poll) return;
    setBusy(true);
    inFlight.current = true;
    try {
      setPoll(await closePoll(pollId));
    } catch {
      setError("Could not close the poll.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-1 w-full max-w-md animate-pulse rounded-xl border border-divider bg-bg-secondary p-4">
        <div className="h-4 w-2/3 rounded bg-bg-accent" />
        <div className="mt-3 h-9 rounded-lg bg-bg-accent" />
        <div className="mt-2 h-9 rounded-lg bg-bg-accent" />
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="mt-1 w-full max-w-md rounded-xl border border-divider bg-bg-secondary p-4 text-sm text-text-muted">
        {error ?? "Poll unavailable"}
      </div>
    );
  }

  const total = totalVotes(poll);
  const leading = Math.max(...poll.counts);
  const isAuthor = !!currentUserId && poll.authorId === currentUserId;

  return (
    <div className="mt-1 w-full max-w-md overflow-hidden rounded-xl border border-divider bg-bg-secondary">
      <div className="flex items-start gap-2 px-4 pb-3 pt-3.5">
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-text-normal">
          {poll.question}
        </p>
        {isAuthor && !poll.closed && (
          <button
            type="button"
            onClick={() => void close()}
            disabled={busy}
            title="Close this poll"
            className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconClose size={14} />
          </button>
        )}
      </div>

      <div className="space-y-1.5 px-3 pb-1">
        {poll.options.map((label, i) => {
          const votes = poll.counts[i] ?? 0;
          const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
          const mine = poll.myVote === i;
          const winning = poll.closed && votes === leading && votes > 0;

          return (
            <button
              key={i}
              type="button"
              disabled={poll.closed || busy}
              onClick={() => void vote(i)}
              title={mine ? "Click again to take your vote back" : undefined}
              className={`relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors ${
                mine
                  ? "border-brand bg-brand/10"
                  : poll.closed
                    ? "border-divider bg-bg-accent"
                    : "border-divider bg-bg-accent hover:border-brand/50"
              } ${poll.closed || busy ? "cursor-default" : "cursor-pointer"}`}
            >
              {}
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ${
                  mine ? "bg-brand/25" : winning ? "bg-status-online/20" : "bg-white/[0.06]"
                }`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    mine ? "border-brand" : "border-text-muted/40"
                  }`}
                >
                  {mine && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-normal">{label}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-text-muted">
                  {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-4 pb-3 pt-2 text-xs text-text-muted">
        {total} {total === 1 ? "vote" : "votes"}
        {poll.myVote !== null ? " · You voted" : ""}
        {poll.closed ? " · Closed" : ""}
      </p>

      {error && <p className="px-4 pb-3 text-xs text-status-dnd">{error}</p>}
    </div>
  );
}
