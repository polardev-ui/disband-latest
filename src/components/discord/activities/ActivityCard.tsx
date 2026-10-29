"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  activityDefinition,
  getActivity,
  type ActivitySession,
} from "@/lib/activities";
import { subscribeActivityUpdated } from "@/lib/activity-events";
import { Avatar } from "@/components/ui/Avatar";
import { ActivityGlyph } from "./ActivityGlyph";

interface ActivityCardProps {
  activityId: string;
  onOpen: (activityId: string) => void;
}

function WordlePreview({ activity }: { activity: ActivitySession }) {
  const row = activity.wordle?.guesses.at(-1);
  if (!row)
    return (
      <p className="mt-1 text-[13px] leading-[18px] text-text-muted">
        Six guesses. One shared word.
      </p>
    );
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1" aria-hidden>
        {row.word.split("").map((letter, index) => {
          const mark = row.marks[index] ?? "absent";
          return (
            <span
              key={`${letter}-${index}`}
              className="flex h-6 w-6 items-center justify-center rounded-[2px] text-[10px] font-bold uppercase text-white"
              style={{
                background:
                  mark === "correct"
                    ? "#3ba55d"
                    : mark === "present"
                      ? "#c99a2e"
                      : "#4f545c",
              }}
            >
              {letter}
            </span>
          );
        })}
      </div>
      <span className="text-[12px] text-text-muted">
        {activity.mine.finished
          ? activity.mine.won
            ? "Solved"
            : "Out of guesses"
          : `Guess ${activity.wordle?.guesses.length ?? 0}/${activity.wordle?.maxGuesses ?? 6}`}
      </span>
    </div>
  );
}

function EightBallPreview({ activity }: { activity: ActivitySession }) {
  const latest = activity.eightBall?.feed[0];
  if (!latest)
    return (
      <p className="mt-1 text-[13px] leading-[18px] text-text-muted">
        Ask the ball anything.
      </p>
    );
  return (
    <div className="mt-2 border-l-2 border-[#5865f2]/60 pl-2.5">
      <p className="line-clamp-1 text-[12px] font-medium text-text-normal">
        “{latest.question}”
      </p>
      <p className="line-clamp-1 text-[12px] text-text-muted">
        {latest.answer}
      </p>
    </div>
  );
}

function TriviaPreview({ activity }: { activity: ActivitySession }) {
  const trivia = activity.trivia;
  if (!trivia) return null;
  return (
    <p className="mt-1 text-[13px] leading-[18px] text-text-muted">
      {activity.mine.joined
        ? `${trivia.answers.length}/${trivia.total} answered · ${activity.mine.score} correct`
        : "Five quick questions. One score."}
    </p>
  );
}

function WouldYouRatherPreview({ activity }: { activity: ActivitySession }) {
  const prompt = activity.wouldYouRather?.prompts[0];
  if (!prompt) return null;
  const total = prompt.counts[0] + prompt.counts[1];
  return (
    <div className="mt-2 space-y-1">
      <p className="line-clamp-1 text-[12px] text-text-normal">
        {prompt.a} <span className="text-text-muted">or</span> {prompt.b}
      </p>
      <p className="text-[12px] text-text-muted">
        {activity.mine.joined && activity.wouldYouRather
          ? `${activity.wouldYouRather.voted}/${activity.wouldYouRather.total} choices`
          : `${total} ${total === 1 ? "vote" : "votes"} so far`}
      </p>
    </div>
  );
}

export function ActivityCard({ activityId, onOpen }: ActivityCardProps) {
  const [activity, setActivity] = useState<ActivitySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setActivity(await getActivity(activityId));
      setError(null);
    } catch {
      setError("This activity could not be loaded.");
    } finally {
      inFlight.current = false;
    }
  }, [activityId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    const unsubscribe = subscribeActivityUpdated((id) => {
      if (!id || id === activityId) void load();
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [load]);

  if (error && !activity) {
    return (
      <div className="mt-1 w-full max-w-[480px] rounded-[4px] bg-bg-secondary p-3 text-[14px] text-text-muted">
        {error}
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="mt-1 w-full max-w-[480px] animate-pulse rounded-[4px] bg-bg-secondary p-3">
        <div className="flex gap-3">
          <div className="h-10 w-10 rounded-[4px] bg-bg-accent" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 rounded-[2px] bg-bg-accent" />
            <div className="h-4 w-2/3 rounded-[2px] bg-bg-accent" />
            <div className="h-3 w-1/2 rounded-[2px] bg-bg-accent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ActivityCardContent activity={activity} error={error} onOpen={onOpen} />
  );
}

function ArcadePreview({ activity }: { activity: ActivitySession }) {
  const view = activity.arcade;
  if (!view) return null;
  if (!activity.mine.joined) {
    return <p className="mt-1 text-[13px] text-text-muted">{activityDefinition(activity.kind).cardNote}</p>;
  }
  const line =
    view.kind === "hangman" ? `${view.pattern.map((l) => l ?? "_").join(" ")} · ${view.lives - view.misses} lives`
    : view.kind === "emoji_riddle" ? `Riddle ${Math.min(view.current + 1, view.rounds.length)} of ${view.rounds.length}`
    : view.kind === "scramble" ? `Word ${Math.min(view.current + 1, view.words.length)} of ${view.words.length}`
    : view.kind === "minesweeper" ? `${view.cells.filter((c) => typeof c === "number").length} squares cleared`
    : `Streak ${view.streak}`;
  return (
    <p className="mt-1 truncate font-mono text-[13px] text-header-secondary">
      {activity.mine.finished ? `Done · ${activity.mine.score} points` : line}
    </p>
  );
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  return ms < 3_600_000 ? `${Math.max(1, Math.ceil(ms / 60_000))}m left` : `${Math.ceil(ms / 3_600_000)}h left`;
}

export function ActivityCardContent({
  activity,
  error = null,
  onOpen,
}: {
  activity: ActivitySession;
  error?: string | null;
  onOpen: (id: string) => void;
}) {
  const def = activityDefinition(activity.kind);
  const actionLabel = activity.expired
    ? "Results"
    : activity.participantCount >= activity.capacity && !activity.mine.joined
      ? "Watch"
      : activity.mine.joined
        ? activity.mine.finished
          ? "Results"
          : "Play"
        : "Join";
  const visiblePlayers = activity.participants.slice(0, 5);
  const leader = activity.expired || activity.participants.every((p) => p.finished)
    ? [...activity.participants].sort((a, b) => b.score - a.score)[0]
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${def.name}`}
      onClick={() => onOpen(activity.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(activity.id);
        }
      }}
      className="group/activity mt-1 w-full max-w-[460px] cursor-pointer overflow-hidden rounded-xl bg-bg-secondary text-left ring-1 ring-divider transition-[box-shadow,transform] hover:ring-[color:var(--interactive-normal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-center gap-4 p-3.5">
        <span className="transition-transform group-hover/activity:scale-[1.03]">
          <ActivityGlyph kind={activity.kind} size={84} radius={20} muted={activity.expired} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${activity.expired ? "bg-bg-accent text-text-muted" : "bg-status-online/15 text-status-online"}`}>
              {!activity.expired && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-online" />}
              {activity.expired ? "Closed" : `Live · ${timeLeft(activity.expiresAt)}`}
            </span>
            <span className="truncate text-[12px] text-text-muted">{def.genre}</span>
          </div>
          <p className="mt-1 truncate text-[18px] font-extrabold leading-6 text-header-primary">{def.name}</p>
          {leader && leader.score > 0 ? (
            <p className="mt-1 truncate text-[13px] text-header-secondary">🏆 {leader.displayName} won with {leader.score}</p>
          ) : activity.board ? (
            <p className="mt-1 truncate text-[13px] text-header-secondary">
              {activity.participantCount < 2
                ? "An open seat is waiting for you"
                : `${activity.participants.find((p) => p.userId === activity.board!.seats[activity.board!.turn - 1])?.displayName ?? "Opponent"}'s turn`}
            </p>
          ) : activity.arcade ? (
            <ArcadePreview activity={activity} />
          ) : activity.kind === "wordle" ? (
            <WordlePreview activity={activity} />
          ) : activity.kind === "eight_ball" ? (
            <EightBallPreview activity={activity} />
          ) : activity.kind === "trivia" ? (
            <TriviaPreview activity={activity} />
          ) : (
            <WouldYouRatherPreview activity={activity} />
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="flex">
              {visiblePlayers.map((player, i) => (
                <span key={player.userId} className="rounded-full ring-2 ring-bg-secondary" style={{ marginLeft: i ? -6 : 0 }}>
                  <Avatar
                    profile={{ display_name: player.displayName, username: player.username, avatar_url: player.avatarUrl }}
                    size="sm"
                    className="!h-6 !w-6 !text-[10px]"
                  />
                </span>
              ))}
            </span>
            <span className="truncate text-[12px] text-text-muted">
              {activity.participantCount} {activity.participantCount === 1 ? "player" : "players"}
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label={`${actionLabel}: ${def.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(activity.id);
          }}
          className="h-10 shrink-0 self-center rounded-xl px-4 text-[14px] font-extrabold text-white shadow-[0_3px_0_rgba(0,0,0,.35)] transition-transform hover:-translate-y-px active:translate-y-0.5"
          style={{ background: activity.expired ? "var(--button-secondary)" : `linear-gradient(180deg, ${def.accent}, ${def.accent2})` }}
        >
          {actionLabel}
        </button>
      </div>
      {error && <p className="px-4 pb-3 text-[12px] text-status-dnd">{error}</p>}
    </div>
  );
}
