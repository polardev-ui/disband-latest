"use client";

import { apiJson } from "@/lib/api";

export const ACTIVITY_KINDS = [
  "wordle",
  "eight_ball",
  "trivia",
  "would_you_rather",
  "four_in_row",
  "reversi",
  "hangman",
  "emoji_riddle",
  "scramble",
  "minesweeper",
  "higher_lower",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Games every player plays against the same puzzle, at their own pace. */
export type ArcadeKind = "hangman" | "emoji_riddle" | "scramble" | "minesweeper" | "higher_lower";

export interface PlayingCard {
  rank: number;
  suit: "♠" | "♥" | "♦" | "♣";
}

/** One player's view of an arcade game; secrets appear only once they're done. */
export type ArcadeView =
  | { kind: "hangman"; category: string; pattern: (string | null)[]; guessed: string[]; misses: number; lives: number; answer: string | null }
  | { kind: "emoji_riddle"; current: number; rounds: { emoji: string | null; category: string; options: string[]; choice: number | null; answer: number | null }[] }
  | { kind: "scramble"; current: number; triesLeft: number; lastWrong: boolean; words: { scrambled: string | null; hint: string | null; solved: boolean | null; answer: string | null }[] }
  | { kind: "minesweeper"; size: number; mineCount: number; cells: (number | "flag" | "mine" | null)[]; exploded: number | null }
  | { kind: "higher_lower"; shown: PlayingCard[]; remaining: number; streak: number; busted: boolean };

/** How long a game stays open before only its results remain. */
export const ACTIVITY_LIFETIME_MS = 24 * 3600_000;

export const ACTIVITY_SCOPES = ["channel", "dm", "group", "public"] as const;
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];

export interface ActivityDefinition {
  kind: ActivityKind;
  name: string;
  tagline: string;
  description: string;
  players: string;
  accent: string;
  /** A short line shown under the title on a chat card. */
  cardNote: string;
  /** Shelf in the game library. */
  genre: "Versus" | "Puzzle" | "Party" | "Quiz";
  /** A second colour for the cover art. */
  accent2: string;
}

export const ACTIVITIES: ActivityDefinition[] = [
  {
    kind: "four_in_row",
    name: "Four in a Row",
    tagline: "Make your next move count",
    description:
      "Take turns dropping counters. Connect four horizontally, vertically or diagonally to win.",
    players: "2 players",
    accent: "var(--brand)",
    cardNote: "A head-to-head game of strategy.",
    genre: "Versus",
    accent2: "#3c45a5",
  },
  {
    kind: "reversi",
    name: "Reversi",
    tagline: "Turn the board your way",
    description:
      "Bracket your opponent’s discs to flip them. The most discs at the end wins; turns pass automatically when no move is available.",
    players: "2 players",
    accent: "var(--status-online)",
    cardNote: "Claim the corners. Control the board.",
    genre: "Versus",
    accent2: "#1a6334",
  },
  {
    kind: "wordle",
    name: "Wordle",
    tagline: "Race to the word",
    description:
      "Everyone gets the same five-letter word and six guesses. First to solve it takes the bragging rights.",
    players: "1–20 players",
    accent: "#3ba55d",
    cardNote: "Six guesses. One word. Everyone racing.",
    genre: "Puzzle",
    accent2: "#1f5c33",
  },
  {
    kind: "eight_ball",
    name: "Magic 8-Ball",
    tagline: "Ask the ball anything",
    description:
      "A shared 8-Ball for the conversation. Ask a question, shake, and let the answer land in the chat.",
    players: "1–20 players",
    accent: "#5865f2",
    cardNote: "Ask a question and see what the ball says.",
    genre: "Party",
    accent2: "#1e1f22",
  },
  {
    kind: "trivia",
    name: "Trivia",
    tagline: "Five quick questions",
    description:
      "Five multiple-choice questions, one score. Perfect for a quiet channel that needs a spark.",
    players: "1–20 players",
    accent: "#f0b232",
    cardNote: "Five questions. Keep your score.",
    genre: "Quiz",
    accent2: "#a26b05",
  },
  {
    kind: "would_you_rather",
    name: "Would You Rather",
    tagline: "Pick a side",
    description:
      "Five impossible choices. Vote, then see how the rest of the chat split.",
    players: "1–20 players",
    accent: "#eb459e",
    cardNote: "Five choices. No wrong answers.",
    genre: "Party",
    accent2: "#8c1f5c",
  },
  {
    kind: "minesweeper",
    name: "Minesweeper",
    tagline: "Clear the field, don't blow up",
    description: "Everyone gets the same minefield. Open squares, flag the mines, clear the board. Most squares cleared wins.",
    players: "1–20 players",
    accent: "#38bdf8",
    cardNote: "Same field for everyone. Who clears it?",
    genre: "Puzzle",
    accent2: "#0c4a6e",
  },
  {
    kind: "hangman",
    name: "Hangman",
    tagline: "Guess the word letter by letter",
    description: "One hidden word, six lives. Everyone guesses on their own board; fewer misses scores more.",
    players: "1–20 players",
    accent: "#f97316",
    cardNote: "Six lives. One word. Don't swing.",
    genre: "Puzzle",
    accent2: "#7c2d12",
  },
  {
    kind: "emoji_riddle",
    name: "Emoji Riddles",
    tagline: "Films, games and phrases in emoji",
    description: "Six riddles told only in emoji. Pick the answer before your friends do.",
    players: "1–20 players",
    accent: "#facc15",
    cardNote: "Six emoji riddles. How many can you crack?",
    genre: "Quiz",
    accent2: "#854d0e",
  },
  {
    kind: "scramble",
    name: "Word Scramble",
    tagline: "Unscramble five words",
    description: "Five jumbled words with a hint each. Three tries per word, then it moves on.",
    players: "1–20 players",
    accent: "#a78bfa",
    cardNote: "Five jumbled words. Three tries each.",
    genre: "Puzzle",
    accent2: "#4c1d95",
  },
  {
    kind: "higher_lower",
    name: "Higher or Lower",
    tagline: "How long can your streak go?",
    description: "The same deck for everyone. Call whether the next card is higher or lower. One wrong call ends your run.",
    players: "1–20 players",
    accent: "#f43f5e",
    cardNote: "One deck. One wrong call and you're out.",
    genre: "Party",
    accent2: "#881337",
  },
];

export function activityDefinition(kind: ActivityKind): ActivityDefinition {
  return ACTIVITIES.find((item) => item.kind === kind) ?? ACTIVITIES[0]!;
}

export interface ActivityParticipant {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  score: number;
  finished: boolean;
  won: boolean;
  joinedAt: string;
  isHost: boolean;
  isMe: boolean;
}

export interface ActivityLeaderboardRow {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  plays: number;
  wins: number;
  points: number;
  best: number;
  isMe: boolean;
}

export interface ActivityMine {
  joined: boolean;
  finished: boolean;
  won: boolean;
  score: number;
}

export type WordleMark = "correct" | "present" | "absent";

export interface WordleGuessRow {
  word: string;
  marks: WordleMark[];
}

export interface WordleActivity {
  maxGuesses: number;
  guesses: WordleGuessRow[];
  answer: string | null;
  solvedBy: string[];
  finishedCount: number;
}

export interface EightBallEntry {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  question: string;
  answer: string;
  createdAt: string;
}

export interface EightBallActivity {
  feed: EightBallEntry[];
  asked: number;
  maxAsks: number;
}

export interface TriviaQuestion {
  index: number;
  question: string;
  options: string[];
}

export interface TriviaAnswer {
  index: number;
  choice: number;
  correct: boolean;
  answer: number;
}

export interface TriviaActivity {
  questions: TriviaQuestion[];
  answers: TriviaAnswer[];
  score: number;
  total: number;
}

export interface WouldYouRatherPrompt {
  index: number;
  a: string;
  b: string;
  counts: [number, number];
  myChoice: 0 | 1 | null;
}

export interface WouldYouRatherActivity {
  prompts: WouldYouRatherPrompt[];
  voted: number;
  total: number;
}

export interface ActivityRoom {
  id: string;
  kind: ActivityKind;
  hostName: string;
  participantCount: number;
  capacity: number;
  createdAt: string;
}

export interface ActivitySession {
  revision: number;
  capacity: number;
  board?: import("./activity-board").BoardState & {
    seats: string[];
    legalMoves: number[];
  };
  id: string;
  kind: ActivityKind;
  scope: ActivityScope;
  scopeId: string;
  hostId: string;
  status: "open" | "closed";
  expired: boolean;
  createdAt: string;
  expiresAt: string;
  participantCount: number;
  participants: ActivityParticipant[];
  leaderboard: ActivityLeaderboardRow[];
  mine: ActivityMine;
  wordle?: WordleActivity;
  eightBall?: EightBallActivity;
  trivia?: TriviaActivity;
  wouldYouRather?: WouldYouRatherActivity;
  arcade?: ArcadeView;
}

interface ErrorPayload {
  error?: string;
}

function unwrap<T>(value: T | ErrorPayload): T {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    throw new Error(value.error);
  }
  return value as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function createActivity(
  kind: ActivityKind,
  scope: ActivityScope,
  scopeId: string,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      "/api/activities",
      jsonInit("POST", { kind, scope, scopeId }),
    ),
  );
}

export async function getActivity(id: string): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(`/api/activities/${encodeURIComponent(id)}`),
  );
}

export async function joinActivity(id: string): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/join`,
      jsonInit("POST", {}),
    ),
  );
}

export async function submitWordleGuess(
  id: string,
  guess: string,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { action: "wordle_guess", guess }),
    ),
  );
}

export async function askEightBall(
  id: string,
  question: string,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { action: "eight_ball_ask", question }),
    ),
  );
}

export async function answerTrivia(
  id: string,
  index: number,
  choice: number,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { action: "trivia_answer", index, choice }),
    ),
  );
}

export async function voteWouldYouRather(
  id: string,
  index: number,
  choice: 0 | 1,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { action: "wyr_vote", index, choice }),
    ),
  );
}

export async function listPublicActivities(): Promise<ActivityRoom[]> {
  return unwrap<ActivityRoom[]>(
    await apiJson<ActivityRoom[]>("/api/activities"),
  );
}
export async function submitBoardMove(
  id: string,
  revision: number,
  move: number,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { action: "board_move", revision, move }),
    ),
  );
}
export async function resignActivity(
  id: string,
  revision: number,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { action: "resign", revision }),
    ),
  );
}
export async function rematchActivity(id: string): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/rematch`,
      jsonInit("POST", {}),
    ),
  );
}

/** One move in an arcade game: a letter, an answer, a square, a call. */
export async function arcadeMove(
  id: string,
  move: Record<string, unknown>,
): Promise<ActivitySession> {
  return unwrap<ActivitySession>(
    await apiJson<ActivitySession>(
      `/api/activities/${encodeURIComponent(id)}/action`,
      jsonInit("POST", { ...move, action: "arcade_move" }),
    ),
  );
}
