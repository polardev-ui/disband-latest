"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { closePoll, getPoll, totalVotes, votePoll, type Poll } from "@/lib/poll";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconClose } from "@/components/icons";

/*
 Polls wear the same flat card as every other attachment: 4px corners, a
 muted header, square-ish option rows with a plain percentage fill, and a
 quiet footer. No floating pills or brand-coloured glow.
*/
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
      <div className="mt-1 w-full max-w-[520px] animate-pulse rounded-[4px] border border-divider bg-bg-secondary p-3">
        <div className="h-3 w-16 rounded-[2px] bg-bg-accent" />
        <div className="mt-2 h-4 w-3/4 rounded-[2px] bg-bg-accent" />
        <div className="mt-3 h-9 rounded-[3px] bg-bg-accent" />
        <div className="mt-1.5 h-9 rounded-[3px] bg-bg-accent" />
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="mt-1 w-full max-w-[520px] rounded-[4px] border border-divider bg-bg-secondary p-3 text-[14px] text-text-muted">
        {error ?? "Poll unavailable"}
      </div>
    );
  }

  const total = totalVotes(poll);
  const leading = Math.max(...poll.counts);
  const isAuthor = !!currentUserId && poll.authorId === currentUserId;

  return (
    <div className="mt-1 w-full max-w-[520px] overflow-hidden rounded-[4px] border border-divider bg-bg-secondary">
      <div className="flex items-start gap-3 border-b border-divider px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-text-muted">Poll</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-text-normal">
            {poll.question}
          </p>
        </div>
        {isAuthor && !poll.closed && (
          <button
            type="button"
            onClick={() => void close()}
            disabled={busy}
            title="Close this poll"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconClose size={14} />
          </button>
        )}
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
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
              className={`relative block w-full overflow-hidden rounded-[3px] border px-3 py-2 text-left transition-colors ${
                mine
                  ? "border-brand bg-[#5865f2]/15"
                  : poll.closed
                    ? "border-divider bg-bg-accent"
                    : "border-divider bg-bg-accent hover:border-[#4f545c] hover:bg-bg-secondary-alt"
              } ${poll.closed || busy ? "cursor-default" : "cursor-pointer"}`}
            >
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 transition-[width] duration-200 ease-out ${
                  mine ? "bg-[#5865f2]/25" : winning ? "bg-status-online/15" : "bg-text-normal/[0.055]"
                }`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    mine ? "border-brand" : "border-[#72767d]"
                  }`}
                >
                  {mine && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-text-normal">{label}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-text-muted">
                  {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-divider px-3.5 py-2 text-[12px] text-text-muted">
        <span>
          {total} {total === 1 ? "vote" : "votes"}
          {poll.myVote !== null ? " · You voted" : ""}
        </span>
        <span>{poll.closed ? "Poll closed" : "Select one option"}</span>
      </div>

      {error && <p className="border-t border-divider px-3.5 py-2 text-[12px] text-status-dnd">{error}</p>}
    </div>
  );
}
