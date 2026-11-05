import "server-only";

import { randomInt } from "node:crypto";
import type { ArcadeKind, ArcadeView, PlayingCard } from "@/lib/activities";

/*
 The arcade: five games everyone in a chat plays against the same puzzle,
 each at their own pace, for the leaderboard. All rules run here. The session
 holds the secret (the word, the mines, the deck); each player's row holds
 only their own progress, and arcadeView() hands a player nothing they
 haven't earned yet.
*/

export const ARCADE_KINDS: ArcadeKind[] = ["hangman", "emoji_riddle", "scramble", "minesweeper", "higher_lower"];

export function isArcadeKind(kind: string): kind is ArcadeKind {
  return (ARCADE_KINDS as string[]).includes(kind);
}

export class ArcadeError extends Error {}

type State = Record<string, unknown>;
const pick = <T,>(items: readonly T[]) => items[randomInt(items.length)]!;
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------------------------------------------------------------- Hangman

const HANGMAN: { word: string; category: string }[] = [
  { word: "SPACESHIP", category: "Sci-fi" }, { word: "VOLCANO", category: "Nature" }, { word: "PINEAPPLE", category: "Food" },
  { word: "SKATEBOARD", category: "Sport" }, { word: "LIGHTHOUSE", category: "Places" }, { word: "SAXOPHONE", category: "Music" },
  { word: "DRAGONFLY", category: "Animals" }, { word: "AVALANCHE", category: "Nature" }, { word: "KEYBOARD", category: "Tech" },
  { word: "CROISSANT", category: "Food" }, { word: "TELESCOPE", category: "Science" }, { word: "WATERFALL", category: "Nature" },
  { word: "HEADPHONES", category: "Tech" }, { word: "PENGUIN", category: "Animals" }, { word: "LABYRINTH", category: "Places" },
  { word: "JELLYFISH", category: "Animals" }, { word: "THUNDERSTORM", category: "Weather" }, { word: "CHAMPIONSHIP", category: "Sport" },
  { word: "MARSHMALLOW", category: "Food" }, { word: "SUBMARINE", category: "Vehicles" }, { word: "WEREWOLF", category: "Spooky" },
  { word: "CEMETERY", category: "Spooky" }, { word: "PUMPKIN", category: "Spooky" }, { word: "ASTRONAUT", category: "Space" },
  { word: "GALAXY", category: "Space" }, { word: "BLUEPRINT", category: "Things" }, { word: "TREASURE", category: "Adventure" },
  { word: "CHAMELEON", category: "Animals" }, { word: "SANDCASTLE", category: "Places" }, { word: "FIREWORKS", category: "Things" },
];
const HANGMAN_LIVES = 6;

// ---------------------------------------------------------- Emoji riddles

const RIDDLES: { emoji: string; answer: string; wrong: string[]; category: string }[] = [
  { emoji: "🦁👑", answer: "The Lion King", wrong: ["Madagascar", "Jungle Book", "Tarzan"], category: "Film" },
  { emoji: "🕷️🧑", answer: "Spider-Man", wrong: ["Ant-Man", "Batman", "Venom"], category: "Film" },
  { emoji: "❄️👸", answer: "Frozen", wrong: ["Tangled", "Moana", "Brave"], category: "Film" },
  { emoji: "🚢🧊💔", answer: "Titanic", wrong: ["Jaws", "Poseidon", "Life of Pi"], category: "Film" },
  { emoji: "🦖🏝️", answer: "Jurassic Park", wrong: ["King Kong", "Godzilla", "Lost World of Oz"], category: "Film" },
  { emoji: "🧙‍♂️💍🌋", answer: "The Lord of the Rings", wrong: ["Harry Potter", "The Hobbit Kitchen", "Narnia"], category: "Film" },
  { emoji: "👻🚫", answer: "Ghostbusters", wrong: ["Casper", "Beetlejuice", "Poltergeist"], category: "Film" },
  { emoji: "🐠🔍", answer: "Finding Nemo", wrong: ["Shark Tale", "The Little Mermaid", "Aquaman"], category: "Film" },
  { emoji: "⛏️🟩🧱", answer: "Minecraft", wrong: ["Roblox", "Terraria", "Fortnite"], category: "Game" },
  { emoji: "🍄👨‍🔧", answer: "Super Mario", wrong: ["Zelda", "Sonic", "Pac-Man"], category: "Game" },
  { emoji: "🔫🪂🏝️", answer: "Fortnite", wrong: ["Call of Duty", "Rust", "Minecraft"], category: "Game" },
  { emoji: "👾🟡", answer: "Pac-Man", wrong: ["Space Invaders", "Tetris", "Galaga"], category: "Game" },
  { emoji: "🌧️☔🎶", answer: "Singin' in the Rain", wrong: ["Purple Rain", "Umbrella", "Rainbow"], category: "Music" },
  { emoji: "🌍🔥", answer: "Global warming", wrong: ["Earthquake", "Wildfire", "Sunrise"], category: "Phrase" },
  { emoji: "🐝🦵", answer: "The bee's knees", wrong: ["Busy bee", "Honey legs", "Spelling bee"], category: "Phrase" },
  { emoji: "☁️9️⃣", answer: "Cloud nine", wrong: ["Ninth sky", "Cloudy day", "Nine lives"], category: "Phrase" },
  { emoji: "🍎👁️", answer: "Apple of my eye", wrong: ["Big Apple", "Eye candy", "Bad apple"], category: "Phrase" },
  { emoji: "🔥🦊", answer: "Firefox", wrong: ["Chrome", "Safari", "Edge"], category: "Tech" },
  { emoji: "🐦🔵", answer: "Twitter", wrong: ["Bluesky", "Facebook", "Telegram"], category: "Tech" },
  { emoji: "🏠✨🧹", answer: "Spring cleaning", wrong: ["Home sweet home", "Magic house", "Housewarming"], category: "Phrase" },
];
const RIDDLE_ROUNDS = 6;

// ----------------------------------------------------------- Word scramble

const SCRAMBLE: { word: string; hint: string }[] = [
  { word: "PLANET", hint: "Orbits a star" }, { word: "GUITAR", hint: "Six strings" }, { word: "CASTLE", hint: "Kings live here" },
  { word: "ROCKET", hint: "Leaves the atmosphere" }, { word: "PIRATE", hint: "Arr" }, { word: "WIZARD", hint: "Casts spells" },
  { word: "JUNGLE", hint: "Dense and green" }, { word: "PUZZLE", hint: "You're doing one" }, { word: "SUMMER", hint: "Warmest season" },
  { word: "CAMERA", hint: "Takes pictures" }, { word: "DRAGON", hint: "Breathes fire" }, { word: "MONKEY", hint: "Loves bananas" },
  { word: "COFFEE", hint: "Morning fuel" }, { word: "TROPHY", hint: "Winners lift it" }, { word: "FOREST", hint: "Lots of trees" },
  { word: "SPIDER", hint: "Eight legs" }, { word: "WINTER", hint: "Coldest season" }, { word: "BRIDGE", hint: "Crosses a river" },
  { word: "GHOSTS", hint: "Boo" }, { word: "STREAM", hint: "Live on a channel" }, { word: "SERVER", hint: "Hosts the game" },
  { word: "EMOJIS", hint: "Tiny faces" }, { word: "LEGEND", hint: "Larger than life" }, { word: "QUESTS", hint: "Adventures to finish" },
];
const SCRAMBLE_ROUNDS = 5;
const SCRAMBLE_TRIES = 3;

function scrambleWord(word: string): string {
  for (let i = 0; i < 10; i++) {
    const s = shuffle(word.split("")).join("");
    if (s !== word) return s;
  }
  return word.split("").reverse().join("");
}

// ------------------------------------------------------------- Minesweeper

const MINE_SIZE = 9;
const MINE_COUNT = 10;
const CENTER = Math.floor((MINE_SIZE * MINE_SIZE) / 2);

function neighbours(cell: number): number[] {
  const r = Math.floor(cell / MINE_SIZE), c = cell % MINE_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < MINE_SIZE && nc >= 0 && nc < MINE_SIZE) out.push(nr * MINE_SIZE + nc);
  }
  return out;
}
const countAround = (cell: number, mines: Set<number>) => neighbours(cell).filter((n) => mines.has(n)).length;

/** Reveal from a cell, opening every connected zero. */
function flood(start: number, mines: Set<number>, revealed: Set<number>) {
  const stack = [start];
  while (stack.length) {
    const cell = stack.pop()!;
    if (revealed.has(cell) || mines.has(cell)) continue;
    revealed.add(cell);
    if (countAround(cell, mines) === 0) stack.push(...neighbours(cell));
  }
}

// ---------------------------------------------------------- Higher or lower

const SUITS = ["♠", "♥", "♦", "♣"] as const;
const DECK_LENGTH = 20;

// -------------------------------------------------------------------- API

/** The shared secret for a new game. Everyone plays the same puzzle. */
export function arcadeInitialState(kind: ArcadeKind): State {
  switch (kind) {
    case "hangman":
      return { ...pick(HANGMAN), lives: HANGMAN_LIVES };
    case "emoji_riddle":
      return {
        rounds: shuffle(RIDDLES).slice(0, RIDDLE_ROUNDS).map((r) => {
          const options = shuffle([r.answer, ...r.wrong]);
          return { emoji: r.emoji, category: r.category, options, answer: options.indexOf(r.answer) };
        }),
      };
    case "scramble":
      return { words: shuffle(SCRAMBLE).slice(0, SCRAMBLE_ROUNDS).map((w) => ({ ...w, scrambled: scrambleWord(w.word) })) };
    case "minesweeper": {
      const safe = new Set([CENTER, ...neighbours(CENTER)]);
      const cells = shuffle([...Array(MINE_SIZE * MINE_SIZE).keys()].filter((c) => !safe.has(c)));
      return { size: MINE_SIZE, mines: cells.slice(0, MINE_COUNT) };
    }
    case "higher_lower":
      return { deck: Array.from({ length: DECK_LENGTH }, () => ({ rank: 1 + randomInt(13), suit: pick(SUITS) })) };
  }
}

export interface ArcadeOutcome {
  state: State;
  score: number;
  finished: boolean;
  won: boolean;
}

/** Apply one move. Throws ArcadeError with a message meant for the player. */
export function arcadeMove(kind: ArcadeKind, session: State, mine: State, body: Record<string, unknown>): ArcadeOutcome {
  switch (kind) {
    case "hangman": {
      const word = String(session.word);
      const letter = typeof body.letter === "string" ? body.letter.trim().toUpperCase() : "";
      if (!/^[A-Z]$/.test(letter)) throw new ArcadeError("Pick a letter.");
      const guessed = Array.isArray(mine.guessed) ? (mine.guessed as string[]) : [];
      if (guessed.includes(letter)) throw new ArcadeError("You've tried that letter.");
      const next = [...guessed, letter];
      const misses = next.filter((l) => !word.includes(l)).length;
      const solved = word.split("").every((l) => next.includes(l));
      const lost = misses >= HANGMAN_LIVES;
      return { state: { guessed: next }, score: solved ? 10 + (HANGMAN_LIVES - misses) * 15 : 0, finished: solved || lost, won: solved };
    }
    case "emoji_riddle": {
      const rounds = session.rounds as { answer: number; options: string[] }[];
      const answers = Array.isArray(mine.answers) ? (mine.answers as { choice: number; correct: boolean }[]) : [];
      const choice = Number(body.choice);
      if (answers.length >= rounds.length) throw new ArcadeError("You've answered them all.");
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new ArcadeError("Pick an answer.");
      const round = rounds[answers.length]!;
      const next = [...answers, { choice, correct: choice === round.answer }];
      const correct = next.filter((a) => a.correct).length;
      const done = next.length >= rounds.length;
      return { state: { answers: next }, score: correct * 20, finished: done, won: done && correct === rounds.length };
    }
    case "scramble": {
      const words = session.words as { word: string }[];
      const results = Array.isArray(mine.results) ? (mine.results as boolean[]) : [];
      const tries = Number(mine.tries) || 0;
      if (results.length >= words.length) throw new ArcadeError("You've finished every word.");
      const target = words[results.length]!.word;
      const skip = body.skip === true;
      const guess = typeof body.guess === "string" ? body.guess.trim().toUpperCase() : "";
      if (!skip && !/^[A-Z]{2,12}$/.test(guess)) throw new ArcadeError("Type a word.");
      let nextResults = results, nextTries = tries;
      if (!skip && guess === target) { nextResults = [...results, true]; nextTries = 0; }
      else if (skip || tries + 1 >= SCRAMBLE_TRIES) { nextResults = [...results, false]; nextTries = 0; }
      else nextTries = tries + 1;
      const solved = nextResults.filter(Boolean).length;
      const done = nextResults.length >= words.length;
      return { state: { results: nextResults, tries: nextTries, lastWrong: !skip && guess !== target && nextResults === results }, score: solved * 20, finished: done, won: done && solved === words.length };
    }
    case "minesweeper": {
      const mines = new Set(session.mines as number[]);
      const total = MINE_SIZE * MINE_SIZE;
      const revealed = new Set(Array.isArray(mine.revealed) ? (mine.revealed as number[]) : []);
      if (revealed.size === 0) flood(CENTER, mines, revealed);
      const flags = new Set(Array.isArray(mine.flags) ? (mine.flags as number[]) : []);
      const cell = Number(body.cell);
      if (!Number.isInteger(cell) || cell < 0 || cell >= total) throw new ArcadeError("Pick a square.");
      let boom = false;
      if (body.action === "flag") {
        if (revealed.has(cell)) throw new ArcadeError("That square is already open.");
        if (flags.has(cell)) flags.delete(cell); else flags.add(cell);
      } else {
        if (flags.has(cell)) throw new ArcadeError("Unflag it first.");
        if (mines.has(cell)) boom = true;
        else flood(cell, mines, revealed);
      }
      const cleared = revealed.size === total - mines.size;
      const score = revealed.size + (cleared ? 50 : 0);
      return {
        state: { revealed: [...revealed], flags: [...flags], exploded: boom ? cell : null },
        score, finished: boom || cleared, won: cleared,
      };
    }
    case "higher_lower": {
      const deck = session.deck as PlayingCard[];
      const pos = Number(mine.pos) || 0;
      const guess = body.guess;
      if (guess !== "higher" && guess !== "lower") throw new ArcadeError("Higher or lower?");
      if (pos >= deck.length - 1) throw new ArcadeError("You've reached the end of the deck.");
      const current = deck[pos]!.rank, next = deck[pos + 1]!.rank;
      const right = next === current || (guess === "higher" ? next > current : next < current);
      const streak = right ? pos + 1 : pos;
      const end = !right || pos + 1 >= deck.length - 1;
      return { state: { pos: pos + 1, streak, busted: !right }, score: streak * 10, finished: end, won: right && end };
    }
  }
}

/** What one player may see right now. Secrets only once they're done or the game has closed. */
export function arcadeView(kind: ArcadeKind, session: State, mine: State, done: boolean): ArcadeView {
  switch (kind) {
    case "hangman": {
      const word = String(session.word);
      const guessed = Array.isArray(mine.guessed) ? (mine.guessed as string[]) : [];
      return {
        kind,
        category: String(session.category),
        pattern: word.split("").map((l) => (guessed.includes(l) || done ? l : null)),
        guessed,
        misses: guessed.filter((l) => !word.includes(l)).length,
        lives: HANGMAN_LIVES,
        answer: done ? word : null,
      };
    }
    case "emoji_riddle": {
      const rounds = session.rounds as { emoji: string; category: string; options: string[]; answer: number }[];
      const answers = Array.isArray(mine.answers) ? (mine.answers as { choice: number; correct: boolean }[]) : [];
      return {
        kind,
        rounds: rounds.map((r, i) => ({
          emoji: i <= answers.length || done ? r.emoji : null,
          category: r.category,
          options: i <= answers.length || done ? r.options : [],
          choice: answers[i]?.choice ?? null,
          answer: answers[i] || done ? r.answer : null,
        })),
        current: Math.min(answers.length, rounds.length),
      };
    }
    case "scramble": {
      const words = session.words as { word: string; hint: string; scrambled: string }[];
      const results = Array.isArray(mine.results) ? (mine.results as boolean[]) : [];
      return {
        kind,
        words: words.map((w, i) => ({
          scrambled: i <= results.length || done ? w.scrambled : null,
          hint: i <= results.length || done ? w.hint : null,
          solved: results[i] ?? null,
          answer: results[i] !== undefined || done ? w.word : null,
        })),
        current: Math.min(results.length, words.length),
        triesLeft: SCRAMBLE_TRIES - (Number(mine.tries) || 0),
        lastWrong: !!mine.lastWrong,
      };
    }
    case "minesweeper": {
      const mines = new Set(session.mines as number[]);
      const revealed = new Set(Array.isArray(mine.revealed) ? (mine.revealed as number[]) : []);
      if (revealed.size === 0) flood(CENTER, mines, revealed);
      const flags = new Set(Array.isArray(mine.flags) ? (mine.flags as number[]) : []);
      const exploded = typeof mine.exploded === "number" ? mine.exploded : null;
      return {
        kind,
        size: MINE_SIZE,
        mineCount: mines.size,
        // number = open (0–8), "flag", "mine" (only once done), null = hidden
        cells: Array.from({ length: MINE_SIZE * MINE_SIZE }, (_, c) =>
          revealed.has(c) ? countAround(c, mines)
            : done && mines.has(c) ? "mine"
            : flags.has(c) ? "flag" : null),
        exploded,
      };
    }
    case "higher_lower": {
      const deck = session.deck as PlayingCard[];
      const pos = Number(mine.pos) || 0;
      return {
        kind,
        shown: deck.slice(0, pos + 1),
        remaining: deck.length - 1 - pos,
        streak: Number(mine.streak) || 0,
        busted: !!mine.busted,
      };
    }
  }
}
