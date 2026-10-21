"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  rematchActivity,
  submitBoardMove,
  resignActivity,
  activityDefinition,
  answerTrivia,
  askEightBall,
  getActivity,
  joinActivity,
  submitWordleGuess,
  voteWouldYouRather,
  type ActivitySession,
} from "@/lib/activities";
import { notifyActivityUpdated } from "@/lib/activity-events";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose } from "@/components/icons";
import { BoardGame } from "./BoardGame";
import { ActivityGlyph } from "./ActivityGlyph";
import {
  ActivityLeaderboard,
  EightBallGame,
  TriviaGame,
  WordleGame,
  WouldYouRatherGame,
} from "./ActivityGames";

interface ActivityModalProps {
  activityId: string | null;
  onClose: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

function endLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  if (ms < 86_400_000) return `Ends in ${Math.ceil(ms / 3_600_000)}h`;
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 1) return "Ends within a day";
  return `Ends in ${days} days`;
}

export function ActivityModal({
  activityId: requestedId,
  onClose,
}: ActivityModalProps) {
  const [replay, setReplay] = useState<{
    source: string | null;
    id: string;
  } | null>(null);
  const activityId = replay?.source === requestedId ? replay.id : requestedId;
  const activeId = useRef(activityId);
  activeId.current = activityId;
  const open = activityId !== null;
  const [hydrated, setHydrated] = useState(false);
  const [activity, setActivity] = useState<ActivitySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"play" | "leaderboard">("play");
  const inFlight = useRef(false);

  const { mounted, exiting } = usePresence(open);
  useOverlayDismiss(onClose, open);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    setActivity(null);
    setLoading(true);
    setBusy(false);
    setError(null);
    setTab("play");

    void (async () => {
      try {
        let next = await getActivity(activityId);
        if (!cancelled) setActivity(next);
        if (
          !next.mine.joined &&
          !next.expired &&
          next.participantCount < next.capacity
        ) {
          next = await joinActivity(activityId);
          notifyActivityUpdated(next.id);
        }
        if (!cancelled) setActivity(next);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const refresh = useCallback(async () => {
    if (
      !activityId ||
      inFlight.current ||
      busy ||
      document.visibilityState !== "visible"
    )
      return;
    inFlight.current = true;
    try {
      const next = await getActivity(activityId);
      if (activeId.current !== activityId) return;
      setActivity((current) =>
        current?.id === next.id && current.revision > next.revision
          ? current
          : next,
      );
      setError(null);
    } catch {
      /* Keep the last good board; the next poll can recover. */
    } finally {
      inFlight.current = false;
    }
  }, [activityId, busy]);

  useEffect(() => {
    if (!open || !activityId) return;
    const timer = window.setInterval(
      () => void refresh(),
      activity?.board ? 1500 : 4000,
    );
    return () => window.clearInterval(timer);
  }, [open, activityId, refresh, !!activity?.board]);

  async function run(action: () => Promise<ActivitySession>): Promise<boolean> {
    if (!activityId || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (activeId.current !== activityId) return false;
      setActivity((current) =>
        current?.id === next.id && current.revision > next.revision
          ? current
          : next,
      );
      notifyActivityUpdated(next.id);
      return true;
    } catch (err) {
      if (activeId.current !== activityId) return false;
      setError(errorMessage(err));
      // A conflicting move may have won the race. Recover the authoritative board.
      try {
        const next = await getActivity(activityId);
        if (activeId.current === activityId) setActivity(next);
      } catch {
        /* Keep the last board and error. */
      }
      return false;
    } finally {
      if (activeId.current === activityId) setBusy(false);
    }
  }

  async function join() {
    if (!activityId) return;
    await run(() => joinActivity(activityId));
  }

  if (!mounted || !hydrated) return null;

  const def = activity ? activityDefinition(activity.kind) : null;
  const canJoin =
    !!activity &&
    !activity.mine.joined &&
    !activity.expired &&
    activity.participantCount < activity.capacity;

  return createPortal(
    <div
      className={`fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 overlay-fade${exiting ? " overlay-fade-out" : ""}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={def ? `${def.name} activity` : "Activity"}
        className={`classic-modal${exiting ? " modal-pop-out" : ""} flex max-h-[calc(100dvh-32px)] w-full max-w-[720px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="relative flex items-start gap-4 overflow-hidden p-5"
          style={{
            background: activity
              ? `linear-gradient(120deg, color-mix(in srgb, ${def?.accent ?? "var(--brand)"} 22%, transparent), var(--bg-secondary) 62%)`
              : "var(--bg-secondary)",
          }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: activity ? def?.accent : "var(--divider)" }}
          />
          {activity ? (
            <ActivityGlyph
              kind={activity.kind}
              size={56}
              muted={activity.expired}
            />
          ) : (
            <span className="h-11 w-11 shrink-0 animate-pulse rounded-[4px] bg-bg-accent" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              {activity?.scope === "public" ? "Public game" : "Chat activity"}
              {activity
                ? ` · ${activity.participantCount} ${activity.participantCount === 1 ? "player" : "players"}`
                : ""}
            </p>
            <h2 className="truncate text-[24px] font-semibold leading-7 text-header-primary">
              {def?.name ?? "Loading activity…"}
            </h2>
            <p className="mt-1 truncate text-[13px] leading-5 text-text-muted">
              {def?.tagline ?? "One moment"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
          >
            <IconClose size={20} />
          </button>
        </div>

        {activity && (
          <div
            className="flex items-center gap-1 border-b border-divider px-3"
            role="tablist"
            aria-label="Activity sections"
          >
            {(
              [
                ["play", "Play"],
                ["leaderboard", "Leaderboard"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`relative h-11 px-3 text-[14px] font-medium transition-colors ${
                  tab === value
                    ? "text-header-primary"
                    : "text-interactive-normal hover:text-interactive-active"
                }`}
              >
                {label}
                {tab === value && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="channel-scroll min-h-0 flex-1 overflow-y-auto">
          {error && (
            <div className="border-b border-divider bg-status-dnd/10 px-4 py-2 text-[12px] text-status-dnd">
              {error}
              {canJoin && (
                <button
                  type="button"
                  onClick={() => void join()}
                  className="ml-2 font-semibold underline underline-offset-2"
                >
                  Join now
                </button>
              )}
            </div>
          )}

          {activity?.expired && (
            <div className="border-b border-divider bg-bg-secondary px-4 py-2 text-[12px] text-text-muted">
              This activity has ended. You can still look through the results.
            </div>
          )}

          {loading && !activity && (
            <div className="space-y-3 px-4 py-4">
              <div className="h-6 w-1/3 animate-pulse rounded-[2px] bg-bg-accent" />
              <div className="h-28 animate-pulse rounded-[3px] bg-bg-accent" />
              <div className="h-10 animate-pulse rounded-[3px] bg-bg-accent" />
            </div>
          )}

          {!loading && !activity && (
            <div className="px-4 py-10 text-center">
              <p className="text-[14px] text-text-muted">
                {error ?? "This activity could not be loaded."}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 h-9 rounded-[3px] bg-brand px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Close
              </button>
            </div>
          )}

          {activity && tab === "leaderboard" && (
            <ActivityLeaderboard activity={activity} />
          )}

          {activity && tab === "play" && (
            <>
              {activity.participants.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-divider px-4 py-2">
                  {activity.participants.slice(0, 10).map((player) => (
                    <span
                      key={player.userId}
                      className="flex items-center gap-1"
                      title={player.displayName}
                    >
                      <Avatar
                        profile={{
                          display_name: player.displayName,
                          username: player.username,
                          avatar_url: player.avatarUrl,
                        }}
                        size="sm"
                        className="!h-5 !w-5 !text-[8px]"
                      />
                      {player.won && (
                        <span className="text-[10px] text-status-online">
                          W
                        </span>
                      )}
                    </span>
                  ))}
                  <span className="ml-1 text-[12px] text-text-muted">
                    {activity.participants
                      .map((player) => player.displayName)
                      .slice(0, 2)
                      .join(", ")}
                    {activity.participantCount > 2
                      ? ` +${activity.participantCount - 2}`
                      : ""}
                  </span>
                </div>
              )}

              {canJoin ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[14px] text-text-muted">
                    Join this activity to play.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void join()}
                    className="mt-3 h-9 rounded-[3px] bg-brand px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                  >
                    {busy ? "Joining…" : "Join activity"}
                  </button>
                </div>
              ) : (
                <>
                  {activity.board && (
                    <BoardGame
                      activity={activity}
                      busy={busy}
                      onMove={(move) =>
                        run(() =>
                          submitBoardMove(activity.id, activity.revision, move),
                        )
                      }
                      onResign={() =>
                        run(() =>
                          resignActivity(activity.id, activity.revision),
                        )
                      }
                      onRematch={() => {
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            const next = await rematchActivity(activity.id);
                            if (activeId.current === activity.id)
                              setReplay({ source: requestedId, id: next.id });
                          } catch (error) {
                            setError(errorMessage(error));
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    />
                  )}
                  {!activity.mine.joined &&
                    !activity.board &&
                    !activity.expired && (
                      <p className="px-4 pt-4 text-[14px] text-header-secondary">
                        This room is full. You can watch the results.
                      </p>
                    )}
                  {activity.kind === "wordle" && (
                    <WordleGame
                      activity={activity}
                      busy={busy || !activity.mine.joined}
                      onError={setError}
                      onGuess={(guess) =>
                        run(() => submitWordleGuess(activity.id, guess))
                      }
                    />
                  )}
                  {activity.kind === "eight_ball" && (
                    <EightBallGame
                      activity={activity}
                      busy={busy || !activity.mine.joined}
                      onError={setError}
                      onAsk={(question) =>
                        run(() => askEightBall(activity.id, question))
                      }
                    />
                  )}
                  {activity.kind === "trivia" && (
                    <TriviaGame
                      activity={activity}
                      busy={busy || !activity.mine.joined}
                      onError={setError}
                      onAnswer={(index, choice) =>
                        run(() => answerTrivia(activity.id, index, choice))
                      }
                    />
                  )}
                  {activity.kind === "would_you_rather" && (
                    <WouldYouRatherGame
                      activity={activity}
                      busy={busy || !activity.mine.joined}
                      onError={setError}
                      onVote={(index, choice) =>
                        run(() =>
                          voteWouldYouRather(activity.id, index, choice),
                        )
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>

        {activity && (
          <div className="flex items-center justify-between gap-3 border-t border-divider bg-bg-secondary px-4 py-2 text-[12px] text-text-muted">
            <span className="truncate">{def?.description}</span>
            <span className="shrink-0">{endLabel(activity.expiresAt)}</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
