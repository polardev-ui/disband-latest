"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  ActivitySession,
  TriviaAnswer,
  WordleMark,
} from "@/lib/activities";
import { Avatar } from "@/components/ui/Avatar";
import { IconSend } from "@/components/icons";
import { ActivityGlyph } from "./ActivityGlyph";

interface BaseGameProps {
  activity: ActivitySession;
  busy: boolean;
  onError: (message: string) => void;
}

function playerProfile(player: {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  return {
    display_name: player.displayName,
    username: player.username,
    avatar_url: player.avatarUrl,
  };
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const TILE_COLOURS: Record<WordleMark, string> = {
  correct: "#3ba55d",
  present: "#c99a2e",
  absent: "#4f545c",
};

function WordleTile({
  letter,
  mark,
  draft,
}: {
  letter?: string;
  mark?: WordleMark;
  draft?: boolean;
}) {
  return (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-[3px] border text-[20px] font-bold uppercase leading-none ${
        mark
          ? "border-transparent text-white"
          : draft
            ? "border-[#6d6f78] bg-transparent text-text-normal"
            : "border-divider bg-bg-accent/40 text-text-normal"
      }`}
      style={mark ? { backgroundColor: TILE_COLOURS[mark] } : undefined}
    >
      {letter ?? ""}
    </span>
  );
}

export function WordleGame({
  activity,
  busy,
  onError,
  onGuess,
}: BaseGameProps & { onGuess: (guess: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const wordle = activity.wordle;
  const guesses = wordle?.guesses ?? [];
  const maxGuesses = wordle?.maxGuesses ?? 6;
  const finished = activity.mine.finished || activity.expired;
  const currentRow = Math.min(guesses.length, maxGuesses - 1);

  const keyboard = useMemo(() => {
    const marks: Record<string, WordleMark> = {};
    for (const row of guesses) {
      row.word.split("").forEach((letter, index) => {
        const next = row.marks[index] ?? "absent";
        const previous = marks[letter];
        if (previous === "correct") return;
        if (next === "correct" || previous !== "present") marks[letter] = next;
      });
    }
    return marks;
  }, [guesses]);

  async function submit() {
    if (busy || finished) return;
    const word = draft.toLowerCase();
    if (word.length !== 5) {
      setNotice("Not enough letters");
      return;
    }
    setNotice(null);
    const ok = await onGuess(word);
    if (ok) setDraft("");
  }

  useEffect(() => {
    if (finished) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab")
        return;
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setNotice(null);
        setDraft((value) => value.slice(0, -1));
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        setNotice(null);
        setDraft((value) =>
          value.length < 5 ? `${value}${event.key.toLowerCase()}` : value,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function press(letter: string) {
    if (busy || finished) return;
    setNotice(null);
    setDraft((value) => (value.length < 5 ? `${value}${letter}` : value));
  }

  const rows = Array.from({ length: maxGuesses }, (_, index) => {
    const played = guesses[index];
    const isDraft = !played && index === currentRow && !finished;
    const letters = isDraft ? draft.split("") : (played?.word.split("") ?? []);
    return { played, isDraft, letters };
  });

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Shared word
          </p>
          <p className="text-[13px] text-text-normal">
            {activity.participantCount}{" "}
            {activity.participantCount === 1 ? "player" : "players"} ·{" "}
            {wordle?.solvedBy.length ?? 0} solved
          </p>
        </div>
        <span className="rounded-[3px] bg-bg-accent px-2 py-1 text-[11px] text-text-muted">
          {guesses.length}/{maxGuesses} guesses
        </span>
      </div>

      <div className="flex flex-col items-center">
        <div className="grid gap-1.5" aria-label="Wordle board">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((col) => (
                <WordleTile
                  key={col}
                  letter={row.letters[col]}
                  mark={row.played?.marks[col]}
                  draft={row.isDraft}
                />
              ))}
            </div>
          ))}
        </div>

        {finished ? (
          <div className="mt-4 w-full max-w-[360px] rounded-[3px] border border-divider bg-bg-secondary px-3 py-2.5 text-center">
            <p className="text-[14px] font-semibold text-text-normal">
              {activity.mine.won
                ? `Solved in ${guesses.length}`
                : activity.expired
                  ? "This activity has ended"
                  : "Out of guesses"}
            </p>
            {wordle?.answer && (
              <p className="mt-0.5 text-[13px] text-text-muted">
                The word was{" "}
                <span className="font-semibold uppercase tracking-[0.08em] text-text-normal">
                  {wordle.answer}
                </span>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 flex w-full max-w-[330px] flex-col gap-1.5">
              {["qwertyuiop", "asdfghjkl", "zxcvbnm"].map(
                (letters, rowIndex) => (
                  <div
                    key={letters}
                    className={`flex justify-center gap-1 ${rowIndex === 2 ? "px-4" : ""}`}
                  >
                    {rowIndex === 2 && (
                      <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={busy}
                        className="h-9 min-w-[48px] rounded-[3px] bg-bg-accent px-2 text-[10px] font-semibold uppercase text-text-normal transition-colors hover:bg-interactive-hover disabled:opacity-50"
                      >
                        Enter
                      </button>
                    )}
                    {letters.split("").map((letter) => {
                      const mark = keyboard[letter];
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => press(letter)}
                          disabled={busy}
                          className="flex h-9 min-w-[25px] flex-1 items-center justify-center rounded-[3px] text-[12px] font-bold uppercase text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
                          style={{
                            backgroundColor: mark
                              ? TILE_COLOURS[mark]
                              : "#4f545c",
                          }}
                        >
                          {letter}
                        </button>
                      );
                    })}
                    {rowIndex === 2 && (
                      <button
                        type="button"
                        onClick={() => setDraft((value) => value.slice(0, -1))}
                        disabled={busy}
                        className="h-9 min-w-[42px] rounded-[3px] bg-bg-accent px-2 text-[10px] font-semibold uppercase text-text-normal transition-colors hover:bg-interactive-hover disabled:opacity-50"
                      >
                        Del
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
            <p
              className={`mt-2 h-4 text-[12px] ${notice ? "text-status-dnd" : "text-text-muted"}`}
            >
              {notice ?? "Type a five-letter word, then press Enter."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function EightBallGame({
  activity,
  busy,
  onError,
  onAsk,
}: BaseGameProps & { onAsk: (question: string) => Promise<boolean> }) {
  const [question, setQuestion] = useState("");
  const ball = activity.eightBall;
  const maxAsks = ball?.maxAsks ?? 10;
  const asked = ball?.asked ?? 0;
  const disabled =
    busy || activity.expired || activity.mine.finished || asked >= maxAsks;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const text = question.trim();
    if (text.length < 2) {
      onError("Ask the ball a question first.");
      return;
    }
    const ok = await onAsk(text);
    if (ok) setQuestion("");
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Ask the ball
          </p>
          <p className="text-[13px] text-text-normal">
            Everyone sees every answer in this chat.
          </p>
        </div>
        <span className="rounded-[3px] bg-bg-accent px-2 py-1 text-[11px] text-text-muted">
          {asked}/{maxAsks} asks
        </span>
      </div>

      <div className="max-h-[44vh] min-h-[160px] space-y-2 overflow-y-auto pr-1 channel-scroll">
        {ball?.feed.length ? (
          ball.feed.map((entry) => (
            <div
              key={entry.id}
              className="rounded-[3px] border border-divider bg-bg-secondary px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Avatar
                  profile={{
                    display_name: entry.displayName,
                    avatar_url: entry.avatarUrl,
                  }}
                  size="sm"
                  className="!h-5 !w-5 !text-[8px]"
                />
                <span className="text-[12px] font-semibold text-header-primary">
                  {entry.displayName}
                </span>
                <span className="text-[10px] text-text-muted">
                  {timeLabel(entry.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-text-normal">
                “{entry.question}”
              </p>
              <p className="mt-1 border-l-2 border-[#5865f2] pl-2 text-[13px] font-medium text-[#b9bbff]">
                {entry.answer}
              </p>
            </div>
          ))
        ) : (
          <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#111214] text-[24px] font-black text-white shadow-[inset_0_0_0_2px_#2e2f34]">
              8
            </span>
            <p className="mt-3 text-[14px] font-semibold text-text-normal">
              The ball is ready.
            </p>
            <p className="mt-1 max-w-[260px] text-[12px] leading-[17px] text-text-muted">
              Ask a yes-or-no question and shake it. The answer lands here for
              everyone to see.
            </p>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => void submit(event)}
        className="mt-3 flex gap-2"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={200}
          disabled={disabled}
          placeholder={
            activity.expired
              ? "This activity has ended"
              : "Will I pass my driving test?"
          }
          aria-label="Your question for the Magic 8-Ball"
          className="h-9 min-w-0 flex-1 rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted/80 focus:border-[#00a8fc] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !question.trim()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[3px] bg-brand px-3 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconSend size={14} />
          Ask
        </button>
      </form>
      {activity.mine.finished && (
        <p className="mt-2 text-[12px] text-text-muted">
          You have used all {maxAsks} asks.
        </p>
      )}
    </div>
  );
}

function TriviaReview({ activity }: { activity: ActivitySession }) {
  const trivia = activity.trivia;
  if (!trivia) return null;
  return (
    <div className="px-4 py-4">
      <div className="rounded-[4px] border border-divider bg-bg-secondary px-4 py-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
          Round complete
        </p>
        <p className="mt-1 text-[30px] font-bold leading-none text-header-primary">
          {activity.mine.score}
          <span className="text-[18px] text-text-muted">/{trivia.total}</span>
        </p>
        <p className="mt-1 text-[13px] text-text-muted">correct answers</p>
      </div>
      <div className="mt-3 space-y-2">
        {trivia.questions.map((question) => {
          const answer = trivia.answers.find(
            (item) => item.index === question.index,
          );
          return (
            <div
              key={question.index}
              className="rounded-[3px] border border-divider bg-bg-secondary px-3 py-2.5"
            >
              <p className="text-[13px] font-medium text-text-normal">
                {question.question}
              </p>
              <p
                className={`mt-1 text-[12px] ${answer?.correct ? "text-status-online" : "text-status-dnd"}`}
              >
                Your answer: {answer ? question.options[answer.choice] : "—"}
              </p>
              {!answer?.correct && (
                <p className="mt-0.5 text-[12px] text-text-muted">
                  Correct: {question.options[answer?.answer ?? 0]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TriviaGame({
  activity,
  busy,
  onAnswer,
}: BaseGameProps & {
  onAnswer: (index: number, choice: number) => Promise<boolean>;
}) {
  const trivia = activity.trivia;
  if (!trivia) return null;
  if (activity.mine.finished || activity.expired)
    return <TriviaReview activity={activity} />;

  const currentIndex = trivia.questions.findIndex(
    (question) =>
      !trivia.answers.some((answer) => answer.index === question.index),
  );
  const current = trivia.questions[currentIndex];
  if (!current) return <TriviaReview activity={activity} />;
  const lastIndex = trivia.answers.length - 1;
  const last: TriviaAnswer | undefined =
    lastIndex >= 0 ? trivia.answers[lastIndex] : undefined;
  const lastQuestion = last ? trivia.questions[last.index] : undefined;

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Question {currentIndex + 1} of {trivia.total}
          </p>
          <p className="text-[13px] text-text-normal">
            Score {activity.mine.score}/{trivia.total}
          </p>
        </div>
        <div className="flex gap-1" aria-hidden>
          {trivia.questions.map((question) => {
            const answer = trivia.answers.find(
              (item) => item.index === question.index,
            );
            return (
              <span
                key={question.index}
                className={`h-1.5 w-6 rounded-full ${answer ? (answer.correct ? "bg-status-online" : "bg-status-dnd") : "bg-bg-accent"}`}
              />
            );
          })}
        </div>
      </div>

      {last && lastQuestion && (
        <p
          className={`mb-2 text-[12px] ${last.correct ? "text-status-online" : "text-status-dnd"}`}
        >
          {last.correct
            ? "Correct."
            : `Not quite — the answer was ${lastQuestion.options[last.answer]}.`}
        </p>
      )}

      <div className="rounded-[4px] border border-divider bg-bg-secondary p-4">
        <p className="text-[17px] font-semibold leading-snug text-header-primary">
          {current.question}
        </p>
        <div className="mt-3 space-y-1.5">
          {current.options.map((option, index) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => void onAnswer(current.index, index)}
              className="flex w-full items-center gap-2.5 rounded-[3px] border border-divider bg-bg-accent px-3 py-2 text-left text-[14px] text-text-normal transition-colors hover:border-[#4f545c] hover:bg-bg-secondary-alt disabled:cursor-wait disabled:opacity-60"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border border-[#72767d] text-[10px] font-bold text-text-muted">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="min-w-0 flex-1">{option}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        Answers lock in one at a time. Everyone gets the same five questions.
      </p>
    </div>
  );
}

function PercentBar({ pct, selected }: { pct: number; selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${selected ? "bg-[#eb459e]/25" : "bg-text-normal/[0.055]"}`}
      style={{ width: `${pct}%` }}
    />
  );
}

export function WouldYouRatherGame({
  activity,
  busy,
  onVote,
}: BaseGameProps & {
  onVote: (index: number, choice: 0 | 1) => Promise<boolean>;
}) {
  const wyr = activity.wouldYouRather;
  if (!wyr) return null;

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Pick a side
          </p>
          <p className="text-[13px] text-text-normal">
            {wyr.voted}/{wyr.total} choices locked in
          </p>
        </div>
        {activity.mine.finished && (
          <span className="text-[12px] text-status-online">All done</span>
        )}
      </div>

      <div className="space-y-3">
        {wyr.prompts.map((prompt) => {
          const total = prompt.counts[0] + prompt.counts[1];
          const pctA = total ? Math.round((prompt.counts[0] / total) * 100) : 0;
          const pctB = total ? 100 - pctA : 0;
          const selected = prompt.myChoice;
          const options: {
            label: string;
            count: number;
            pct: number;
            choice: 0 | 1;
          }[] = [
            { label: prompt.a, count: prompt.counts[0], pct: pctA, choice: 0 },
            { label: prompt.b, count: prompt.counts[1], pct: pctB, choice: 1 },
          ];
          return (
            <div
              key={prompt.index}
              className="rounded-[4px] border border-divider bg-bg-secondary p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                  Would you rather
                </p>
                <p className="text-[10px] text-text-muted">
                  {total} {total === 1 ? "vote" : "votes"}
                </p>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {options.map((option) => {
                  const mine = selected === option.choice;
                  return (
                    <button
                      key={option.choice}
                      type="button"
                      disabled={busy || selected !== null || activity.expired}
                      onClick={() => void onVote(prompt.index, option.choice)}
                      className={`relative overflow-hidden rounded-[3px] border px-3 py-2.5 text-left transition-colors ${
                        mine
                          ? "border-[#eb459e]"
                          : "border-divider hover:border-[#4f545c]"
                      } bg-bg-accent disabled:cursor-default disabled:hover:border-divider`}
                    >
                      {selected !== null && (
                        <PercentBar pct={option.pct} selected={mine} />
                      )}
                      <span className="relative flex items-center justify-between gap-2">
                        <span className="text-[13px] leading-[18px] text-text-normal">
                          {option.label}
                        </span>
                        {selected !== null ? (
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-text-muted">
                            {option.pct}%
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-text-muted/70">
                            Vote
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selected !== null && (
                <p className="mt-1.5 text-[11px] text-text-muted">
                  You chose{" "}
                  {selected === 0 ? "the first option" : "the second option"}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActivityLeaderboard({
  activity,
}: {
  activity: ActivitySession;
}) {
  const session = [...activity.participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (Number(b.won) !== Number(a.won)) return Number(b.won) - Number(a.won);
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-header-secondary">
            This activity
          </h3>
          <span className="text-[11px] text-text-muted">
            {activity.participantCount} playing
          </span>
        </div>
        {session.length === 0 ? (
          <p className="rounded-[3px] border border-divider bg-bg-secondary px-3 py-4 text-[13px] text-text-muted">
            No one has joined yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[4px] border border-divider">
            {session.map((player, index) => (
              <div
                key={player.userId}
                className={`flex items-center gap-2.5 px-3 py-2 ${player.isMe ? "bg-brand/10" : "bg-bg-secondary"} ${index > 0 ? "border-t border-divider" : ""}`}
              >
                <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-text-muted">
                  {index + 1}
                </span>
                <Avatar
                  profile={playerProfile(player)}
                  size="sm"
                  className="!h-6 !w-6 !text-[9px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-normal">
                    {player.displayName}
                    {player.isMe ? " (you)" : ""}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {player.isHost ? "Host · " : ""}
                    {player.won
                      ? "Won"
                      : player.finished
                        ? "Finished"
                        : "Playing"}
                  </p>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-header-primary">
                  {player.score}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-header-secondary">
            All-time leaderboard
          </h3>
          <span className="text-[11px] text-text-muted">Top 10</span>
        </div>
        {activity.leaderboard.length === 0 ? (
          <p className="rounded-[3px] border border-divider bg-bg-secondary px-3 py-4 text-[13px] text-text-muted">
            No scores yet. Finish a round to take the first spot.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[4px] border border-divider">
            {activity.leaderboard.map((player, index) => (
              <div
                key={player.userId}
                className={`flex items-center gap-2.5 px-3 py-2 ${player.isMe ? "bg-brand/10" : "bg-bg-secondary"} ${index > 0 ? "border-t border-divider" : ""}`}
              >
                <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-text-muted">
                  {index + 1}
                </span>
                <Avatar
                  profile={playerProfile(player)}
                  size="sm"
                  className="!h-6 !w-6 !text-[9px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-normal">
                    {player.displayName}
                    {player.isMe ? " (you)" : ""}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {player.plays} plays · {player.wins} wins
                  </p>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-header-primary">
                  {player.points} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
