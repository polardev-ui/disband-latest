"use client";

import { useCallback, useEffect, useState } from "react";
import { getPoll, votePoll, type Poll } from "@/lib/poll";

/**
 * The poll service is unauthenticated and tracks no per-user state, so "have I
 * voted" is remembered locally. Without this a refresh both re-hides the
 * results and lets the same person vote again.
 */
function votedKey(pollId: string) {
  return `disband:poll-voted:${pollId}`;
}

function readVoted(pollId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(votedKey(pollId));
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function PollCard({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    setVoted(readVoted(pollId));
  }, [pollId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPoll(await getPoll(pollId));
    } catch {
      setError("This poll could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function vote(index: number) {
    if (voted !== null || voting || !poll || poll.closed) return;
    setVoting(true);
    setVoted(index);
    try {
      // The vote response already carries the updated tallies.
      const updated = await votePoll(pollId, index);
      setPoll(updated ?? (await getPoll(pollId)));
      window.localStorage.setItem(votedKey(pollId), String(index));
    } catch {
      setVoted(null);
    } finally {
      setVoting(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-1 max-w-md animate-pulse rounded-lg border border-divider bg-bg-secondary p-4">
        <div className="h-4 w-2/3 rounded bg-bg-accent" />
        <div className="mt-3 h-8 rounded bg-bg-accent" />
        <div className="mt-2 h-8 rounded bg-bg-accent" />
      </div>
    );
  }

  if (error || !poll) {
    return (
      <div className="mt-1 max-w-md rounded-lg border border-divider bg-bg-secondary p-4 text-sm text-text-muted">
        {error ?? "Poll unavailable"}
      </div>
    );
  }

  const total = poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0);
  // A closed poll shows its results to everyone, voted or not.
  const revealed = voted !== null || poll.closed;

  return (
    <div className="mt-1 max-w-md rounded-lg border border-divider bg-bg-secondary p-4">
      <p className="mb-3 text-sm font-semibold text-text-normal">{poll.question}</p>
      <div className="space-y-2">
        {poll.options.map((opt, i) => {
          const pct = total > 0 ? Math.round(((opt.votes ?? 0) / total) * 100) : 0;
          const selected = voted === i;
          return (
            <button
              key={i}
              type="button"
              disabled={revealed || voting}
              onClick={() => void vote(i)}
              className="block w-full text-left disabled:cursor-default"
            >
              <div
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                  selected
                    ? "border-brand bg-brand/10"
                    : revealed
                      ? "border-divider bg-bg-accent"
                      : "border-divider bg-bg-accent hover:border-brand/50"
                }`}
              >
                <span className="truncate text-text-normal">{opt.text}</span>
                {revealed && (
                  <span className="shrink-0 text-xs font-medium text-text-muted">{pct}%</span>
                )}
              </div>
              {revealed && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-accent">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-muted">
        {total} {total === 1 ? "vote" : "votes"}
        {voted !== null ? " · You voted" : ""}
        {poll.closed ? " · Closed" : ""}
      </p>
    </div>
  );
}
