"use client";

import { apiJson } from "@/lib/api";

export const ACTIVITY_KINDS = [
  "wordle",
  "eight_ball",
  "trivia",
  "would_you_rather",
  "four_in_row",
  "reversi",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

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
