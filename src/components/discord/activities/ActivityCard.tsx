"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  activityDefinition,
  getActivity,
  type ActivitySession,
} from "@/lib/activities";
import { subscribeActivityUpdated } from "@/lib/activity-events";
import { Avatar } from "@/components/ui/Avatar";
import { IconChevron } from "@/components/icons";
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
  const actionLabel =
    activity.participantCount >= activity.capacity && !activity.mine.joined
      ? "Watch"
      : activity.expired
        ? "View results"
        : activity.mine.joined
          ? activity.mine.finished
            ? "View results"
            : "Play"
          : "Join";
  const visiblePlayers = activity.participants.slice(0, 5);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${def.name} activity`}
      onClick={() => onOpen(activity.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(activity.id);
        }
      }}
      className="group/activity mt-1 w-full max-w-[480px] cursor-pointer overflow-hidden rounded-[4px] border border-divider bg-bg-secondary text-left transition-colors hover:border-[#4f545c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: def.accent,
        backgroundImage: `linear-gradient(115deg, color-mix(in srgb, ${def.accent} 16%, transparent), transparent 46%)`,
      }}
    >
      <div className="flex items-start gap-4 p-4">
        <ActivityGlyph
          kind={activity.kind}
          size={52}
          muted={activity.expired}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.02em] text-text-muted">
            <span>Activity</span>
            <span aria-hidden>·</span>
            <span>
              {activity.participantCount}{" "}
              {activity.participantCount === 1 ? "player" : "players"}
            </span>
            {activity.expired && (
              <span className="text-status-dnd">· Ended</span>
            )}
          </div>
          <p className="mt-1 text-[20px] font-semibold leading-6 text-header-primary">
            {def.name}
          </p>
          {activity.board && (
            <p className="mt-2 text-[14px] text-header-secondary">
              {activity.expired
                ? activity.board.winner === 0
                  ? "A draw — play again?"
                  : "Match finished. View the results."
                : activity.participantCount < 2
                  ? "An open seat is waiting for you."
                  : `${activity.participants.find((p) => p.userId === activity.board!.seats[activity.board!.turn - 1])?.displayName ?? "Opponent"}’s turn`}
            </p>
          )}
          {activity.kind === "wordle" && <WordlePreview activity={activity} />}
          {activity.kind === "eight_ball" && (
            <EightBallPreview activity={activity} />
          )}
          {activity.kind === "trivia" && <TriviaPreview activity={activity} />}
          {activity.kind === "would_you_rather" && (
            <WouldYouRatherPreview activity={activity} />
          )}
          {visiblePlayers.length > 0 && (
            <div className="mt-2 flex items-center gap-1">
              {visiblePlayers.map((player) => (
                <Avatar
                  key={player.userId}
                  profile={{
                    display_name: player.displayName,
                    username: player.username,
                    avatar_url: player.avatarUrl,
                  }}
                  size="sm"
                  className="!h-6 !w-6 !text-[10px]"
                />
              ))}
              <span className="ml-1 truncate text-[12px] text-text-muted">
                {visiblePlayers
                  .map((player) => player.displayName)
                  .slice(0, 2)
                  .join(", ")}
                {activity.participantCount > 2
                  ? ` and ${activity.participantCount - 2} more`
                  : ""}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={`${actionLabel} ${def.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(activity.id);
          }}
          className="mt-1 flex h-8 shrink-0 items-center gap-1 rounded-[3px] px-3 text-[13px] font-semibold transition-[filter] hover:brightness-110"
          style={{
            backgroundColor: def.accent,
            color: def.accent === "#f0b232" ? "#111214" : "#ffffff",
          }}
        >
          {actionLabel}
          <IconChevron size={12} className="-rotate-90" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 bg-bg-secondary-alt px-4 py-2.5 text-[12px] text-text-muted">
        <span className="truncate">{def.cardNote}</span>
        <span className="shrink-0">
          {activity.board
            ? "2-player match"
            : activity.kind === "wordle" && activity.wordle
              ? `${activity.wordle.solvedBy.length} solved`
              : activity.kind === "eight_ball"
                ? "The ball is listening"
                : activity.kind === "trivia"
                  ? `${activity.trivia?.total ?? 0} questions`
                  : "Pick a side"}
        </span>
      </div>
      {error && (
        <p className="bg-bg-secondary-alt px-4 py-2.5 text-[12px] text-status-dnd">
          {error}
        </p>
      )}
    </div>
  );
}
