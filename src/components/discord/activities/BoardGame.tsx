"use client";
import { useState } from "react";
import type { ActivitySession } from "@/lib/activities";
import { Avatar } from "@/components/ui/Avatar";

export function BoardGame({
  activity,
  busy,
  onMove,
  onResign,
  onRematch,
}: {
  activity: ActivitySession;
  busy: boolean;
  onMove: (move: number) => Promise<boolean>;
  onResign: () => Promise<boolean>;
  onRematch: () => void;
}) {
  const [confirmResign, setConfirmResign] = useState(false);
  const board = activity.board;
  if (!board) return null;
  const reversi = activity.kind === "reversi",
    width = reversi ? 8 : 7;
  const me = activity.participants.find((p) => p.isMe);
  const seat = me ? board.seats.indexOf(me.userId) + 1 : 0;
  const active = activity.participants.find(
    (p) => p.userId === board.seats[board.turn - 1],
  );
  const winner = board.winner
    ? activity.participants.find(
        (p) => p.userId === board.seats[board.winner! - 1],
      )
    : null;
  const waiting = board.seats.length < 2;
  const playable =
    !busy &&
    !activity.expired &&
    !waiting &&
    seat === board.turn &&
    board.winner === null;
  const message =
    board.winner === 0
      ? "A draw — well played!"
      : winner
        ? `${winner.displayName} wins!`
        : activity.expired
          ? "This game has ended."
          : waiting
            ? "Waiting for an opponent…"
            : playable
              ? "Your turn"
              : `${active?.displayName ?? "Your opponent"}’s turn`;
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => {
          const p = activity.participants.find(
            (p) => p.userId === board.seats[i],
          );
          return (
            <div
              key={i}
              className={`flex min-w-0 items-center gap-2 rounded-[4px] border-2 p-2 ${board.turn === i + 1 && !activity.expired ? "border-brand bg-bg-secondary" : "border-transparent bg-bg-secondary"}`}
            >
              <span
                aria-hidden
                className={`h-3 w-3 shrink-0 rounded-full ${i === 0 ? "bg-brand" : "bg-header-primary"}`}
              />
              {p && (
                <Avatar
                  profile={{
                    display_name: p.displayName,
                    avatar_url: p.avatarUrl,
                  }}
                  size="sm"
                  className="!h-6 !w-6"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-header-primary">
                {p ? `${p.displayName}${p.isMe ? " (you)" : ""}` : "Open seat"}
              </span>
              {reversi && (
                <span className="text-[14px] tabular-nums text-header-secondary">
                  {board.cells.filter((v) => v === i + 1).length}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p
        role="status"
        className="text-center text-[16px] font-semibold text-header-primary"
      >
        {message}
      </p>
      {!reversi && (
        <div className="mx-auto grid max-w-[420px] grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, col) => (
            <button
              key={col}
              aria-label={`Drop counter in column ${col + 1}`}
              disabled={!playable || !board.legalMoves.includes(col)}
              onClick={() => void onMove(col)}
              className="h-8 rounded-[3px] bg-button-secondary text-white hover:bg-brand disabled:opacity-30"
            >
              ↓
            </button>
          ))}
        </div>
      )}
      <div
        role="group"
        aria-label={reversi ? "Reversi board" : "Four in a Row board"}
        className="mx-auto grid max-w-[420px] gap-1 rounded-[4px] bg-bg-tertiary p-2"
        style={{ gridTemplateColumns: `repeat(${width},minmax(0,1fr))` }}
      >
        {board.cells.map((disc, index) => {
          const legal = reversi && board.legalMoves.includes(index);
          const label = `Row ${Math.floor(index / width) + 1}, column ${(index % width) + 1}: ${disc ? `player ${disc}` : legal ? "available move" : "empty"}`;
          const content = (
            <span
              aria-hidden
              className={`relative flex h-full w-full items-center justify-center rounded-full ${disc === 1 ? "bg-brand" : disc === 2 ? "bg-header-primary" : "bg-bg-secondary"} ${board.lastMove === index ? "ring-2 ring-status-online ring-offset-2 ring-offset-bg-tertiary" : ""}`}
            >
              {disc ? (
                <span
                  className={`text-[12px] font-bold ${disc === 1 ? "text-white" : "text-bg-primary"}`}
                >
                  {disc}
                </span>
              ) : legal && playable ? (
                <span className="h-2 w-2 rounded-full bg-text-muted" />
              ) : null}
            </span>
          );
          return reversi ? (
            <button
              key={index}
              aria-label={label}
              disabled={!playable || !legal}
              onClick={() => void onMove(index)}
              className="aspect-square min-w-0 rounded-[3px] p-1 enabled:hover:bg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              {content}
            </button>
          ) : (
            <div
              key={index}
              aria-label={label}
              role="img"
              className="aspect-square p-1"
            >
              {content}
            </div>
          );
        })}
      </div>
      {board.passed && !activity.expired && (
        <p className="text-center text-[13px] text-header-secondary">
          No legal moves for the other player. The turn passes automatically.
        </p>
      )}
      <p className="text-center text-[12px] text-text-muted">
        {!seat ? "You’re watching this match. " : ""}
        {activity.scope === "public" && waiting
          ? "Your room is listed in Public games. Anyone signed in can join."
          : reversi
            ? "Flip discs by bracketing them. The most discs wins."
            : "Connect four in any direction. Each player takes one turn."}
      </p>
      <div className="flex items-center justify-center gap-3">
        {activity.expired && seat > 0 ? (
          <button
            onClick={onRematch}
            disabled={busy}
            className="h-9 rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            Play again
          </button>
        ) : seat > 0 && !waiting ? (
          <>
            {confirmResign && (
              <button
                onClick={() => setConfirmResign(false)}
                className="text-[13px] text-header-secondary"
              >
                Cancel
              </button>
            )}
            <button
              disabled={busy}
              onClick={() =>
                confirmResign ? void onResign() : setConfirmResign(true)
              }
              className="rounded-[3px] px-3 py-2 text-[13px] text-status-dnd hover:bg-interactive-hover disabled:opacity-50"
            >
              {confirmResign ? "Confirm resignation" : "Resign"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
