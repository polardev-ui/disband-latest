"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { activityDefinition, type ActivitySession, type ArcadeView, type PlayingCard } from "@/lib/activities";

type Move = (move: Record<string, unknown>) => Promise<boolean>;
type View<K extends ArcadeView["kind"]> = Extract<ArcadeView, { kind: K }>;

/** The five arcade games, plus the results podium they share. */
export function ArcadeGame({ activity, busy, onMove }: { activity: ActivitySession; busy: boolean; onMove: Move }) {
  const view = activity.arcade;
  if (!view) return null;
  const locked = busy || !activity.mine.joined || activity.mine.finished || activity.expired;
  return (
    <div className="space-y-5 px-5 py-5">
      {view.kind === "hangman" && <Hangman view={view} locked={locked} onMove={onMove} />}
      {view.kind === "emoji_riddle" && <EmojiRiddles view={view} locked={locked} onMove={onMove} />}
      {view.kind === "scramble" && <Scramble view={view} locked={locked} onMove={onMove} />}
      {view.kind === "minesweeper" && <Minesweeper view={view} locked={locked} onMove={onMove} />}
      {view.kind === "higher_lower" && <HigherLower view={view} locked={locked} onMove={onMove} />}
      {(activity.mine.finished || activity.expired) && <Results activity={activity} />}
    </div>
  );
}

// ------------------------------------------------------------------ Results

export function Results({ activity }: { activity: ActivitySession }) {
  const def = activityDefinition(activity.kind);
  const ranked = [...activity.participants].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const heights = [72, 96, 56];
  const medals = ["#c0c4cc", "#f5c242", "#cd7f45"];
  const waiting = activity.participants.filter((p) => !p.finished).length;
  return (
    <section aria-label="Results" className="rounded-xl bg-bg-secondary p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[16px] font-bold text-header-primary">{activity.expired ? "Final results" : "Results so far"}</h3>
        <span className="text-[13px] text-text-muted">
          {activity.expired ? "This game is closed" : waiting > 0 ? `Waiting on ${waiting} ${waiting === 1 ? "player" : "players"}` : "Everyone's done"}
        </span>
      </div>
      {activity.mine.joined && (
        <p className="mt-1 text-[14px] text-text-normal">
          You scored <span className="font-bold" style={{ color: def.accent }}>{activity.mine.score}</span>
          {activity.mine.won ? " and cleared it." : "."}
        </p>
      )}
      <div className="mt-5 flex items-end justify-center gap-3">
        {order.map((p, i) => p ? (
          <div key={p.userId} className="flex w-[110px] flex-col items-center gap-2">
            <Avatar profile={{ display_name: p.displayName, username: p.username, avatar_url: p.avatarUrl }} size={i === 1 ? "lg" : "md"} />
            <span className="max-w-full truncate text-[13px] font-semibold text-header-primary">{p.displayName}</span>
            <div className="flex w-full flex-col items-center justify-start rounded-t-lg pt-2" style={{ height: heights[i], background: `linear-gradient(180deg, ${medals[i]}55, transparent)`, borderTop: `3px solid ${medals[i]}` }}>
              <span className="text-[18px] font-black tabular-nums text-header-primary">{p.score}</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{i === 1 ? "1st" : i === 0 ? "2nd" : "3rd"}</span>
            </div>
          </div>
        ) : <div key={i} className="w-[110px]" />)}
      </div>
      {ranked.length > 3 && (
        <ol start={4} className="mt-4 space-y-1 border-t border-divider pt-3 text-[13px]">
          {ranked.slice(3, 10).map((p, i) => (
            <li key={p.userId} className="flex justify-between text-text-normal"><span>{i + 4}. {p.displayName}</span><span className="tabular-nums text-text-muted">{p.score}</span></li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Hangman

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function Hangman({ view, locked, onMove }: { view: View<"hangman">; locked: boolean; onMove: Move }) {
  const stage = view.misses;
  const word = new Set(view.pattern.filter(Boolean) as string[]);
  useKeys((k) => { if (!locked && /^[a-z]$/i.test(k) && !view.guessed.includes(k.toUpperCase())) void onMove({ letter: k.toUpperCase() }); });
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full items-center justify-between text-[13px]">
        <span className="rounded-full bg-[#f97316]/15 px-3 py-1 font-semibold text-[#fdba74]">{view.category}</span>
        <span aria-label={`${view.lives - view.misses} lives left`} className="flex gap-1">
          {Array.from({ length: view.lives }, (_, i) => (
            <svg key={i} width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7.5-4.6-9.5-9.4C1.2 8.4 3.3 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.5 0 5.6 3.4 4.3 6.6C19.5 16.4 12 21 12 21Z" fill={i < view.lives - view.misses ? "#f43f5e" : "var(--bg-accent)"} /></svg>
          ))}
        </span>
      </div>
      <svg width="170" height="150" viewBox="0 0 170 150" role="img" aria-label={`Hangman, ${stage} of ${view.lives} drawn`} className="text-header-primary">
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M20 140h90M45 140V12h70v18" opacity=".9" />
          {stage > 0 && <circle cx="115" cy="45" r="14" />}
          {stage > 1 && <path d="M115 59v40" />}
          {stage > 2 && <path d="M115 70l-20 16" />}
          {stage > 3 && <path d="M115 70l20 16" />}
          {stage > 4 && <path d="M115 99l-17 26" />}
          {stage > 5 && <path d="M115 99l17 26" />}
        </g>
      </svg>
      <div className="flex flex-wrap justify-center gap-1.5">
        {view.pattern.map((l, i) => (
          <span key={i} className={`flex h-12 w-9 items-end justify-center border-b-[3px] pb-1 text-[26px] font-black ${view.answer && !view.guessed.includes(l ?? "") ? "border-status-dnd text-status-dnd" : "border-header-primary text-header-primary"}`}>{l ?? ""}</span>
        ))}
      </div>
      <div className="flex w-full max-w-[520px] flex-col items-center gap-1.5">
        {KEY_ROWS.map((row) => (
          <div key={row} className="flex gap-1.5">
            {row.split("").map((k) => {
              const used = view.guessed.includes(k);
              const hit = used && word.has(k);
              return (
                <button key={k} type="button" disabled={locked || used} onClick={() => void onMove({ letter: k })}
                  className={`h-11 w-9 rounded-md text-[15px] font-bold transition-[transform,background-color] active:scale-95 sm:w-10 ${hit ? "bg-status-online text-white" : used ? "bg-bg-tertiary text-text-muted/50" : "bg-bg-accent text-header-primary hover:bg-[#f97316] hover:text-white"} disabled:cursor-default`}>
                  {k}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Emoji riddles

function EmojiRiddles({ view, locked, onMove }: { view: View<"emoji_riddle">; locked: boolean; onMove: Move }) {
  const round = view.rounds[view.current];
  const done = view.current >= view.rounds.length;
  const last = view.current > 0 ? view.rounds[view.current - 1] : null;
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex gap-1.5" aria-label={`Riddle ${Math.min(view.current + 1, view.rounds.length)} of ${view.rounds.length}`}>
        {view.rounds.map((r, i) => (
          <span key={i} className={`h-2 w-8 rounded-full ${r.choice === null ? (i === view.current ? "bg-[#facc15]" : "bg-bg-accent") : r.choice === r.answer ? "bg-status-online" : "bg-status-dnd"}`} />
        ))}
      </div>
      {last && !done && (
        <p className={`text-[13px] font-semibold ${last.choice === last.answer ? "text-status-online" : "text-status-dnd"}`}>
          {last.choice === last.answer ? "Correct!" : `It was ${last.options[last.answer ?? 0]}`}
        </p>
      )}
      {round && !done ? (
        <>
          <div className="flex h-40 w-full max-w-[440px] flex-col items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_50%_30%,#facc1533,transparent_70%)] ring-1 ring-[#facc15]/30">
            <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#fde68a]">{round.category}</span>
            <span className="mt-2 text-[64px] leading-none">{round.emoji}</span>
          </div>
          <div className="grid w-full max-w-[440px] grid-cols-2 gap-2">
            {round.options.map((o, i) => (
              <button key={o} type="button" disabled={locked} onClick={() => void onMove({ choice: i })}
                className="min-h-[52px] rounded-xl bg-bg-accent px-3 py-2 text-[15px] font-semibold text-header-primary transition-[transform,background-color] hover:bg-[#facc15] hover:text-[#1c1300] active:scale-[.98] disabled:opacity-60">
                {o}
              </button>
            ))}
          </div>
        </>
      ) : (
        <ul className="grid w-full max-w-[520px] grid-cols-2 gap-2">
          {view.rounds.map((r, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-xl p-3 ${r.choice === r.answer ? "bg-status-online/15" : "bg-status-dnd/10"}`}>
              <span className="text-[28px]">{r.emoji}</span>
              <span className="min-w-0 text-[13px] text-text-normal">{r.answer !== null ? r.options[r.answer] : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Scramble

function Scramble({ view, locked, onMove }: { view: View<"scramble">; locked: boolean; onMove: Move }) {
  const word = view.words[view.current];
  const done = view.current >= view.words.length;
  const [guess, setGuess] = useState("");
  useEffect(() => setGuess(""), [view.current]);
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex gap-1.5">
        {view.words.map((w, i) => (
          <span key={i} className={`h-2 w-10 rounded-full ${w.solved === null ? (i === view.current ? "bg-[#a78bfa]" : "bg-bg-accent") : w.solved ? "bg-status-online" : "bg-status-dnd"}`} />
        ))}
      </div>
      {!done && word?.scrambled ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {word.scrambled.split("").map((l, i) => (
              <span key={i} className="flex h-14 w-12 items-center justify-center rounded-xl bg-gradient-to-b from-white to-[#e9e3ff] text-[26px] font-black text-[#4c1d95] shadow-[0_4px_0_#7c5cc4]" style={{ transform: `rotate(${((i * 37) % 9) - 4}deg)` }}>{l}</span>
            ))}
          </div>
          <p className="text-[14px] text-text-muted">Hint: <span className="font-semibold text-header-primary">{word.hint}</span></p>
          <form onSubmit={(e) => { e.preventDefault(); if (guess.trim()) void onMove({ guess }).then((ok) => ok && setGuess("")); }} className="flex w-full max-w-[400px] gap-2">
            <input value={guess} onChange={(e) => setGuess(e.target.value.toUpperCase())} disabled={locked} maxLength={12} autoFocus aria-label="Your answer"
              className={`h-12 min-w-0 flex-1 rounded-xl bg-bg-tertiary px-4 text-center text-[20px] font-bold tracking-[0.2em] text-header-primary outline-none focus:ring-2 focus:ring-[#a78bfa] ${view.lastWrong ? "ring-2 ring-status-dnd" : ""}`} />
            <button type="submit" disabled={locked || !guess.trim()} className="h-12 rounded-xl bg-[#8b5cf6] px-5 font-bold text-white disabled:opacity-50">Go</button>
          </form>
          <div className="flex items-center gap-4 text-[13px] text-text-muted">
            <span>{view.triesLeft} {view.triesLeft === 1 ? "try" : "tries"} left</span>
            <button type="button" disabled={locked} onClick={() => void onMove({ skip: true })} className="font-semibold text-text-link hover:underline disabled:opacity-50">Skip word</button>
          </div>
        </>
      ) : (
        <ul className="w-full max-w-[420px] space-y-1.5">
          {view.words.map((w, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-bg-secondary px-3 py-2 text-[14px]">
              <span className="font-mono tracking-widest text-text-muted">{w.scrambled}</span>
              <span className={`font-bold ${w.solved ? "text-status-online" : "text-status-dnd"}`}>{w.answer}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -------------------------------------------------------------- Minesweeper

const NUMBER_COLOURS = ["", "#60a5fa", "#4ade80", "#f87171", "#a78bfa", "#fb923c", "#22d3ee", "#e5e7eb", "#9ca3af"];

function Minesweeper({ view, locked, onMove }: { view: View<"minesweeper">; locked: boolean; onMove: Move }) {
  const [flagMode, setFlagMode] = useState(false);
  const flags = view.cells.filter((c) => c === "flag").length;
  const opened = view.cells.filter((c) => typeof c === "number").length;
  const safe = view.size * view.size - view.mineCount;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[420px] items-center justify-between">
        <span className="rounded-lg bg-bg-tertiary px-3 py-1.5 font-mono text-[15px] font-bold text-status-dnd" aria-label="Mines left">💣 {Math.max(0, view.mineCount - flags)}</span>
        <button type="button" aria-pressed={flagMode} onClick={() => setFlagMode((v) => !v)}
          className={`rounded-lg px-3 py-1.5 text-[14px] font-semibold ${flagMode ? "bg-status-dnd text-white" : "bg-bg-accent text-header-primary"}`}>
          {flagMode ? "Flagging" : "Flag mode"}
        </button>
        <span className="rounded-lg bg-bg-tertiary px-3 py-1.5 font-mono text-[15px] font-bold text-[#7dd3fc]" aria-label="Squares cleared">{opened}/{safe}</span>
      </div>
      <div role="grid" aria-label="Minefield" className="grid gap-[3px] rounded-xl bg-[#0c3b57] p-2" style={{ gridTemplateColumns: `repeat(${view.size}, minmax(0, 1fr))` }}>
        {view.cells.map((c, i) => {
          const open = typeof c === "number";
          return (
            <button key={i} type="button" role="gridcell" disabled={locked || open}
              aria-label={open ? `${c} nearby` : c === "flag" ? "Flagged" : c === "mine" ? "Mine" : "Hidden square"}
              onClick={() => void onMove({ action: flagMode ? "flag" : "reveal", cell: i })}
              onContextMenu={(e) => { e.preventDefault(); if (!locked && !open) void onMove({ action: "flag", cell: i }); }}
              className={`flex h-9 w-9 items-center justify-center rounded-[5px] text-[16px] font-black transition-transform sm:h-10 sm:w-10 ${
                c === "mine" ? (view.exploded === i ? "bg-status-dnd" : "bg-[#1e293b]")
                  : open ? "bg-[#0a2a3d]"
                  : "bg-gradient-to-b from-[#7dd3fc] to-[#38bdf8] shadow-[inset_0_-3px_0_#0284c7] hover:brightness-110 active:scale-95"
              }`}
              style={open && c ? { color: NUMBER_COLOURS[c] } : undefined}>
              {c === "flag" ? "🚩" : c === "mine" ? "💣" : open && c ? c : ""}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-text-muted">Right-click (or Flag mode) to mark a mine. The middle is always safe.</p>
    </div>
  );
}

// ---------------------------------------------------------- Higher or lower

const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function Card({ card, small = false }: { card: PlayingCard; small?: boolean }) {
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <span className={`relative flex shrink-0 flex-col justify-between rounded-xl bg-white shadow-[0_6px_16px_rgba(0,0,0,.35)] ${small ? "h-16 w-11 p-1" : "h-44 w-32 p-3"}`} style={{ color: red ? "#e11d48" : "#111827" }}>
      <span className={`font-black leading-none ${small ? "text-[13px]" : "text-[24px]"}`}>{RANK[card.rank]}<br />{card.suit}</span>
      {!small && <span className="absolute inset-0 flex items-center justify-center text-[56px]">{card.suit}</span>}
      {!small && <span className="rotate-180 self-end text-[24px] font-black leading-none">{RANK[card.rank]}<br />{card.suit}</span>}
    </span>
  );
}

function HigherLower({ view, locked, onMove }: { view: View<"higher_lower">; locked: boolean; onMove: Move }) {
  const current = view.shown[view.shown.length - 1]!;
  const history = view.shown.slice(0, -1).slice(-8);
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-text-muted">Streak</p>
          <p className="text-[44px] font-black leading-none text-[#fb7185] tabular-nums">{view.streak}</p>
        </div>
        <Card card={current} />
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-text-muted">Cards left</p>
          <p className="text-[44px] font-black leading-none text-header-primary tabular-nums">{view.remaining}</p>
        </div>
      </div>
      {view.busted ? (
        <p className="text-[15px] font-bold text-status-dnd">Wrong call. Your run ends at {view.streak}.</p>
      ) : (
        <div className="flex gap-3">
          <button type="button" disabled={locked} onClick={() => void onMove({ guess: "higher" })} className="flex h-14 w-40 items-center justify-center gap-2 rounded-2xl bg-status-online text-[17px] font-black text-white shadow-[0_4px_0_#15803d] transition-transform active:translate-y-0.5 disabled:opacity-50">▲ Higher</button>
          <button type="button" disabled={locked} onClick={() => void onMove({ guess: "lower" })} className="flex h-14 w-40 items-center justify-center gap-2 rounded-2xl bg-[#f43f5e] text-[17px] font-black text-white shadow-[0_4px_0_#9f1239] transition-transform active:translate-y-0.5 disabled:opacity-50">▼ Lower</button>
        </div>
      )}
      {history.length > 0 && (
        <div className="flex items-center gap-1.5" aria-label="Previous cards">
          {history.map((c, i) => <Card key={i} card={c} small />)}
        </div>
      )}
      <p className="text-[12px] text-text-muted">A tie counts as a correct call.</p>
    </div>
  );
}

function useKeys(handler: (key: string) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
