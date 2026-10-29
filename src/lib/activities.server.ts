import "server-only";

import {
  initialBoard,
  isBoardKind,
  legalBoardMoves,
  moveBoard,
  type BoardState,
} from "@/lib/activity-board";
import { randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ArcadeError, arcadeInitialState, arcadeMove, arcadeView, isArcadeKind } from "@/lib/activity-arcade.server";
import type {
  ActivityRoom,
  ActivityKind,
  ActivityLeaderboardRow,
  ActivityParticipant,
  ActivityScope,
  ActivitySession,
  EightBallEntry,
  TriviaAnswer,
  TriviaQuestion,
  WordleGuessRow,
  WordleMark,
  WouldYouRatherPrompt,
} from "@/lib/activities";

export class ActivityError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ActivityError";
    this.status = status;
  }
}

const KINDS: ActivityKind[] = [
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
];

/** Every game is open for a day; after that only its results can be viewed. */
const LIFETIME_MS = 24 * 3600_000;
const SCOPES: ActivityScope[] = ["channel", "dm", "group", "public"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && (KINDS as string[]).includes(value);
}

export function isActivityScope(value: unknown): value is ActivityScope {
  return typeof value === "string" && (SCOPES as string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

const WORDLE_ANSWERS = [
  "about",
  "above",
  "actor",
  "acute",
  "adopt",
  "adult",
  "after",
  "again",
  "agent",
  "agree",
  "ahead",
  "alarm",
  "album",
  "alert",
  "alike",
  "alive",
  "allow",
  "alone",
  "along",
  "alter",
  "among",
  "anger",
  "angle",
  "angry",
  "apart",
  "apple",
  "apply",
  "arena",
  "argue",
  "arise",
  "array",
  "aside",
  "asset",
  "audio",
  "audit",
  "avoid",
  "award",
  "aware",
  "badly",
  "baker",
  "basic",
  "beach",
  "began",
  "begin",
  "being",
  "below",
  "bench",
  "birth",
  "black",
  "blame",
  "blind",
  "block",
  "blood",
  "board",
  "boost",
  "booth",
  "bound",
  "brain",
  "brand",
  "bread",
  "break",
  "breed",
  "brief",
  "bring",
  "broad",
  "broke",
  "brown",
  "build",
  "built",
  "buyer",
  "cable",
  "carry",
  "catch",
  "cause",
  "chain",
  "chair",
  "chart",
  "chase",
  "cheap",
  "check",
  "chest",
  "chief",
  "child",
  "chose",
  "civil",
  "claim",
  "class",
  "clean",
  "clear",
  "click",
  "clock",
  "close",
  "coach",
  "coast",
  "could",
  "count",
  "court",
  "cover",
  "craft",
  "crash",
  "cream",
  "crime",
  "cross",
  "crowd",
  "crown",
  "curve",
  "cycle",
  "daily",
  "dance",
  "dealt",
  "death",
  "debut",
  "delay",
  "depth",
  "doing",
  "doubt",
  "dozen",
  "draft",
  "drama",
  "drawn",
  "dream",
  "dress",
  "drill",
  "drink",
  "drive",
  "drove",
  "dying",
  "eager",
  "early",
  "earth",
  "eight",
  "elite",
  "empty",
  "enemy",
  "enjoy",
  "enter",
  "entry",
  "equal",
  "error",
  "event",
  "every",
  "exact",
  "exist",
  "extra",
  "faith",
  "false",
  "fault",
  "fiber",
  "field",
  "fifth",
  "fifty",
  "fight",
  "final",
  "first",
  "fixed",
  "flash",
  "fleet",
  "floor",
  "focus",
  "force",
  "forth",
  "forty",
  "forum",
  "found",
  "frame",
  "frank",
  "fraud",
  "fresh",
  "front",
  "fruit",
  "fully",
  "funny",
  "giant",
  "given",
  "glass",
  "globe",
  "going",
  "grace",
  "grade",
  "grand",
  "grant",
  "grass",
  "great",
  "green",
  "gross",
  "group",
  "grown",
  "guard",
  "guess",
  "guest",
  "guide",
  "happy",
  "harsh",
  "heart",
  "heavy",
  "hence",
  "horse",
  "hotel",
  "house",
  "human",
  "ideal",
  "image",
  "index",
  "inner",
  "input",
  "issue",
  "joint",
  "judge",
  "known",
  "label",
  "large",
  "laser",
  "later",
  "laugh",
  "layer",
  "learn",
  "lease",
  "least",
  "leave",
  "legal",
  "level",
  "light",
  "limit",
  "lives",
  "local",
  "logic",
  "loose",
  "lower",
  "lucky",
  "lunch",
  "lying",
  "magic",
  "major",
  "maker",
  "march",
  "match",
  "maybe",
  "mayor",
  "meant",
  "media",
  "metal",
  "might",
  "minor",
  "minus",
  "mixed",
  "model",
  "money",
  "month",
  "moral",
  "motor",
  "mount",
  "mouse",
  "mouth",
  "movie",
  "music",
  "needs",
  "never",
  "newly",
  "night",
  "noise",
  "north",
  "novel",
  "nurse",
  "occur",
  "ocean",
  "offer",
  "often",
  "order",
  "other",
  "ought",
  "outer",
  "owner",
  "paint",
  "panel",
  "paper",
  "party",
  "peace",
  "phase",
  "phone",
  "photo",
  "piece",
  "pilot",
  "pitch",
  "place",
  "plain",
  "plane",
  "plant",
  "plate",
  "point",
  "pound",
  "power",
  "press",
  "price",
  "pride",
  "prime",
  "print",
  "prior",
  "prize",
  "proof",
  "proud",
  "prove",
  "queen",
  "quick",
  "quiet",
  "radio",
  "raise",
  "range",
  "rapid",
  "ratio",
  "reach",
  "ready",
  "realm",
  "rebel",
  "refer",
  "relax",
  "repay",
  "reply",
  "right",
  "rigid",
  "rival",
  "river",
  "robin",
  "roman",
  "rough",
  "round",
  "route",
  "royal",
  "rural",
  "scale",
  "scene",
  "scope",
  "score",
  "sense",
  "serve",
  "seven",
  "shade",
  "shake",
  "shall",
  "shape",
  "share",
  "sharp",
  "sheet",
  "shelf",
  "shell",
  "shift",
  "shine",
  "shirt",
  "shock",
  "shoot",
  "short",
  "shown",
  "sight",
  "since",
  "sixth",
  "sixty",
  "sized",
  "skill",
  "sleep",
  "slide",
  "small",
  "smart",
  "smile",
  "smoke",
  "solid",
  "solve",
  "sorry",
  "sound",
  "south",
  "space",
  "spare",
  "speak",
  "speed",
  "spend",
  "spent",
  "split",
  "spoke",
  "sport",
  "staff",
  "stage",
  "stake",
  "stand",
  "start",
  "state",
  "steam",
  "steel",
  "stick",
  "still",
  "stock",
  "stone",
  "stood",
  "store",
  "storm",
  "story",
  "strip",
  "stuck",
  "study",
  "stuff",
  "style",
  "sugar",
  "suite",
  "super",
  "sweet",
  "table",
  "taken",
  "taste",
  "taxes",
  "teach",
  "teeth",
  "terry",
  "texas",
  "thank",
  "theft",
  "their",
  "theme",
  "there",
  "these",
  "thick",
  "thing",
  "think",
  "third",
  "those",
  "three",
  "throw",
  "tight",
  "times",
  "tired",
  "title",
  "today",
  "topic",
  "total",
  "touch",
  "tough",
  "tower",
  "track",
  "trade",
  "train",
  "treat",
  "trend",
  "trial",
  "tried",
  "tries",
  "truck",
  "truly",
  "trust",
  "truth",
  "twice",
  "under",
  "undue",
  "union",
  "unity",
  "until",
  "upper",
  "upset",
  "urban",
  "usage",
  "usual",
  "valid",
  "value",
  "video",
  "virus",
  "visit",
  "vital",
  "voice",
  "waste",
  "watch",
  "water",
  "wheel",
  "where",
  "which",
  "while",
  "white",
  "whole",
  "whose",
  "woman",
  "women",
  "world",
  "worry",
  "worse",
  "worst",
  "worth",
  "would",
  "wound",
  "write",
  "wrong",
  "wrote",
  "yield",
  "young",
  "youth",
  "zebra",
].filter((word) => word.length === 5);

const EIGHT_BALL_ANSWERS = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes, definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
];

interface TriviaBankQuestion {
  question: string;
  options: string[];
  answer: number;
}

const TRIVIA_BANK: TriviaBankQuestion[] = [
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Mars", "Venus", "Jupiter", "Mercury"],
    answer: 0,
  },
  {
    question: "What is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Pacific", "Arctic"],
    answer: 2,
  },
  {
    question: "How many sides does a hexagon have?",
    options: ["5", "6", "7", "8"],
    answer: 1,
  },
  {
    question: "Which language has the most native speakers?",
    options: ["English", "Spanish", "Hindi", "Mandarin Chinese"],
    answer: 3,
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    answer: 2,
  },
  {
    question: "Which artist painted the Mona Lisa?",
    options: ["Van Gogh", "Da Vinci", "Picasso", "Monet"],
    answer: 1,
  },
  {
    question: "What is the capital of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Perth"],
    answer: 2,
  },
  {
    question: "Which instrument has 88 keys?",
    options: ["Guitar", "Piano", "Violin", "Flute"],
    answer: 1,
  },
  {
    question: "How many minutes are in a full day?",
    options: ["1440", "1200", "1800", "960"],
    answer: 0,
  },
  {
    question: "Which animal is known as the ship of the desert?",
    options: ["Horse", "Camel", "Elephant", "Donkey"],
    answer: 1,
  },
  {
    question: "What does CPU stand for?",
    options: [
      "Central Processing Unit",
      "Computer Personal Unit",
      "Central Program Utility",
      "Control Processing Unit",
    ],
    answer: 0,
  },
  {
    question: "Which country invented paper?",
    options: ["Egypt", "China", "Greece", "India"],
    answer: 1,
  },
  {
    question: "What is the tallest mountain above sea level?",
    options: ["K2", "Everest", "Kangchenjunga", "Makalu"],
    answer: 1,
  },
  {
    question: "Which gas do plants absorb from the air?",
    options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
    answer: 2,
  },
  {
    question: "How many players are on a football pitch per team?",
    options: ["9", "10", "11", "12"],
    answer: 2,
  },
  {
    question: "Which planet has the most moons?",
    options: ["Earth", "Mars", "Jupiter", "Saturn"],
    answer: 3,
  },
  {
    question: "What is the smallest prime number?",
    options: ["0", "1", "2", "3"],
    answer: 2,
  },
  {
    question: "Which year did the first iPhone launch?",
    options: ["2005", "2006", "2007", "2008"],
    answer: 2,
  },
  {
    question: "What is the main ingredient in guacamole?",
    options: ["Tomato", "Avocado", "Pepper", "Lime"],
    answer: 1,
  },
  {
    question: "Which sea creature has three hearts?",
    options: ["Octopus", "Shark", "Dolphin", "Jellyfish"],
    answer: 0,
  },
  {
    question: "What does 'www' stand for?",
    options: [
      "World Wide Web",
      "Wide World Web",
      "Web World Wide",
      "World Web Wide",
    ],
    answer: 0,
  },
  {
    question: "Which colour is at the top of a rainbow?",
    options: ["Blue", "Red", "Green", "Violet"],
    answer: 1,
  },
  {
    question: "How many strings does a standard violin have?",
    options: ["4", "5", "6", "7"],
    answer: 0,
  },
  {
    question: "Which city is home to the Colosseum?",
    options: ["Athens", "Rome", "Cairo", "Istanbul"],
    answer: 1,
  },
  {
    question: "What is the hardest natural substance on Earth?",
    options: ["Gold", "Iron", "Diamond", "Quartz"],
    answer: 2,
  },
  {
    question: "Which month has 28 or 29 days?",
    options: ["January", "February", "March", "April"],
    answer: 1,
  },
];

const WOULD_YOU_RATHER_BANK: { a: string; b: string }[] = [
  { a: "Have the ability to fly", b: "Be invisible whenever you want" },
  { a: "Always be 10 minutes late", b: "Always be 20 minutes early" },
  { a: "Live without music", b: "Live without films" },
  { a: "Have unlimited coffee", b: "Have unlimited tea" },
  { a: "Explore space", b: "Explore the deep sea" },
  { a: "Talk to animals", b: "Speak every human language" },
  { a: "Always have perfect weather", b: "Never wait in a queue again" },
  { a: "Have a personal chef", b: "Have a personal driver" },
  { a: "Know every song lyric", b: "Never forget a name" },
  { a: "Live in a treehouse", b: "Live on a houseboat" },
  { a: "Only play games from the 1990s", b: "Only play games from the 2010s" },
  { a: "Have a photographic memory", b: "Have infinite willpower" },
  {
    a: "Be the funniest person in the room",
    b: "Be the smartest person in the room",
  },
  { a: "Take the window seat", b: "Take the aisle seat" },
  { a: "Have a rewind button for life", b: "Have a pause button for life" },
  { a: "Only communicate in memes", b: "Only communicate in song lyrics" },
  { a: "Have a dragon as a pet", b: "Have a phoenix as a pet" },
  { a: "Never lose your keys again", b: "Never lose your phone again" },
  {
    a: "Live somewhere it always snows",
    b: "Live somewhere it is always sunny",
  },
  { a: "Have a personal cinema", b: "Have a personal library" },
];

interface RawSession {
  revision: number;
  id: string;
  kind: ActivityKind;
  scope: ActivityScope;
  scope_id: string;
  host_id: string;
  state: Record<string, unknown>;
  status: "open" | "closed";
  created_at: string;
  expires_at: string;
}

interface RawPlayer {
  user_id: string;
  state: Record<string, unknown>;
  score: number;
  finished: boolean;
  won: boolean;
  joined_at: string;
}

interface ProfileLite {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface WordleSessionState {
  answer: string;
  maxGuesses: number;
}

interface WordlePlayerState {
  guesses?: WordleGuessRow[];
}

interface EightBallSessionState {
  feed?: EightBallEntry[];
}

interface EightBallPlayerState {
  asked?: number;
}

interface TriviaSessionState {
  questions?: TriviaBankQuestion[];
}

interface TriviaPlayerState {
  answers?: TriviaAnswer[];
}

interface WyrSessionState {
  prompts?: { a: string; b: string }[];
}

interface WyrPlayerState {
  voted?: number;
}

function pickOne<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]!;
}

function pickMany<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(randomInt(pool.length), 1)[0]!);
  }
  return out;
}

function wordleMarks(guess: string, answer: string): WordleMark[] {
  const marks: WordleMark[] = [
    "absent",
    "absent",
    "absent",
    "absent",
    "absent",
  ];
  const remaining: (string | null)[] = answer.split("");
  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      marks[i] = "correct";
      remaining[i] = null;
    }
  }
  for (let i = 0; i < 5; i += 1) {
    if (marks[i] === "correct") continue;
    const found = remaining.indexOf(guess[i]!);
    if (found >= 0) {
      marks[i] = "present";
      remaining[found] = null;
    }
  }
  return marks;
}

function profileName(profile: ProfileLite | undefined): string {
  return (
    profile?.display_name?.trim() || profile?.username?.trim() || "Someone"
  );
}

async function loadProfiles(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, ProfileLite>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await service
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", unique);
  if (error) throw new ActivityError("Couldn't load the players.", 500);
  return new Map(
    ((data ?? []) as ProfileLite[]).map((profile) => [profile.id, profile]),
  );
}

async function canAccess(
  service: SupabaseClient,
  scope: ActivityScope,
  scopeId: string,
  userId: string,
): Promise<boolean> {
  if (scope === "public") return true;
  if (scope === "channel") {
    const { data, error } = await service.rpc("channel_permission_for", {
      p_actor: userId,
      p_channel_id: scopeId,
      p_permission: "view",
    });
    return !error && data === true;
  }
  if (scope === "dm") {
    const { data: thread } = await service
      .from("dm_threads")
      .select("user_a, user_b")
      .eq("id", scopeId)
      .maybeSingle();
    return !!thread && (thread.user_a === userId || thread.user_b === userId);
  }
  if (scope === "group") {
    const { data: member } = await service
      .from("group_chat_members")
      .select("group_id")
      .eq("group_id", scopeId)
      .eq("user_id", userId)
      .maybeSingle();
    return !!member;
  }
  return false;
}

interface PlayerUpdate {
  userId: string;
  state: unknown;
  score: number;
  finished: boolean;
  won: boolean;
}
interface ScoreUpdate {
  userId: string;
  plays: number;
  wins: number;
  points: number;
  best: number;
}
async function commitMove(
  service: SupabaseClient,
  raw: RawSession,
  actor: string,
  players: PlayerUpdate[],
  scores: ScoreUpdate[] = [],
  state: unknown = raw.state,
  vote: unknown = null,
  close = false,
) {
  const { error } = await service.rpc("activity_commit", {
    p_id: raw.id,
    p_actor: actor,
    p_revision: raw.revision,
    p_state: state,
    p_players: players,
    p_scores: scores,
    p_vote: vote,
    p_close: close,
  });
  if (error)
    throw new ActivityError(
      // P0001 carries a message written for players ("The game changed…",
      // "That activity has ended."). The stale-move check used to raise 40001,
      // which PostgREST retried in a loop until it timed out.
      error.code === "P0001"
        ? error.message
        : error.code === "40001"
          ? "The game changed. Refresh and try your move again."
          : "Couldn't save your move. Try again.",
      error.code === "40001" || error.code === "P0001" ? 409 : 500,
    );
}

async function loadLeaderboard(
  service: SupabaseClient,
  kind: ActivityKind,
  userId: string,
): Promise<ActivityLeaderboardRow[]> {
  const { data, error } = await service
    .from("activity_scores")
    .select("user_id, plays, wins, points, best")
    .eq("kind", kind)
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("best", { ascending: false })
    .limit(10);
  if (error) throw new ActivityError("Couldn't load the leaderboard.", 500);
  const rows = (data ?? []) as {
    user_id: string;
    plays: number;
    wins: number;
    points: number;
    best: number;
  }[];
  const profiles = await loadProfiles(
    service,
    rows.map((row) => row.user_id),
  );
  return rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      userId: row.user_id,
      displayName: profileName(profile),
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      plays: row.plays,
      wins: row.wins,
      points: row.points,
      best: row.best,
      isMe: row.user_id === userId,
    };
  });
}

function requireService(): SupabaseClient {
  const service = getServiceSupabase();
  if (!service)
    throw new ActivityError("Activities are unavailable right now.", 503);
  return service;
}

async function loadSession(
  service: SupabaseClient,
  id: string,
  userId: string,
): Promise<RawSession> {
  if (!isUuid(id))
    throw new ActivityError("That activity no longer exists.", 404);
  const { data, error } = await service
    .from("activity_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ActivityError("Couldn't load that activity.", 500);
  if (!data) throw new ActivityError("That activity no longer exists.", 404);
  const session = data as RawSession;
  if (!(await canAccess(service, session.scope, session.scope_id, userId))) {
    throw new ActivityError("You don't have access to this conversation.", 403);
  }
  return session;
}

function isExpired(session: RawSession): boolean {
  return (
    session.status !== "open" ||
    new Date(session.expires_at).getTime() <= Date.now()
  );
}

async function loadPlayers(
  service: SupabaseClient,
  id: string,
): Promise<RawPlayer[]> {
  const { data, error } = await service
    .from("activity_players")
    .select("user_id, state, score, finished, won, joined_at")
    .eq("activity_id", id)
    .order("joined_at", { ascending: true })
    .order("user_id", { ascending: true });
  if (error) throw new ActivityError("Couldn't load the players.", 500);
  return (data ?? []) as RawPlayer[];
}

export async function getActivityById(
  id: string,
  userId: string,
): Promise<ActivitySession> {
  const service = requireService();
  const raw = await loadSession(service, id, userId);
  const expired = isExpired(raw);
  const players = await loadPlayers(service, raw.id);
  const profiles = await loadProfiles(service, [
    raw.host_id,
    ...players.map((player) => player.user_id),
  ]);
  const myRow = players.find((player) => player.user_id === userId);

  const participants: ActivityParticipant[] = players.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      userId: row.user_id,
      displayName: profileName(profile),
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      score: row.score ?? 0,
      finished: !!row.finished,
      won: !!row.won,
      joinedAt: row.joined_at,
      isHost: row.user_id === raw.host_id,
      isMe: row.user_id === userId,
    };
  });

  const base: ActivitySession = {
    revision: raw.revision,
    capacity: isBoardKind(raw.kind) ? 2 : 20,
    id: raw.id,
    kind: raw.kind,
    scope: raw.scope,
    scopeId: raw.scope_id,
    hostId: raw.host_id,
    status: raw.status,
    expired,
    createdAt: raw.created_at,
    expiresAt: raw.expires_at,
    participantCount: participants.length,
    participants,
    leaderboard: await loadLeaderboard(service, raw.kind, userId),
    mine: {
      joined: !!myRow,
      finished: !!myRow?.finished,
      won: !!myRow?.won,
      score: myRow?.score ?? 0,
    },
  };

  if (isArcadeKind(raw.kind)) {
    base.arcade = arcadeView(raw.kind, raw.state, (myRow?.state ?? {}) as Record<string, unknown>, !!myRow?.finished || expired);
  } else if (isBoardKind(raw.kind)) {
    const board = raw.state as unknown as BoardState;
    base.board = {
      ...board,
      seats: players.map((p) => p.user_id),
      legalMoves: legalBoardMoves(raw.kind, board),
    };
  } else if (raw.kind === "wordle") {
    const state = raw.state as unknown as WordleSessionState;
    const mine = (myRow?.state ?? {}) as WordlePlayerState;
    const guesses = Array.isArray(mine.guesses) ? mine.guesses : [];
    base.wordle = {
      maxGuesses: Number(state.maxGuesses) || 6,
      guesses,
      answer: myRow?.finished || expired ? (state.answer ?? null) : null,
      solvedBy: players
        .filter((player) => player.won)
        .map((player) => player.user_id),
      finishedCount: players.filter((player) => player.finished).length,
    };
  } else if (raw.kind === "eight_ball") {
    const state = raw.state as unknown as EightBallSessionState;
    const mine = (myRow?.state ?? {}) as EightBallPlayerState;
    base.eightBall = {
      feed: Array.isArray(state.feed) ? state.feed : [],
      asked: Number(mine.asked) || 0,
      maxAsks: 10,
    };
  } else if (raw.kind === "trivia") {
    const state = raw.state as unknown as TriviaSessionState;
    const mine = (myRow?.state ?? {}) as TriviaPlayerState;
    const questions: TriviaQuestion[] = (state.questions ?? []).map(
      (question, index) => ({
        index,
        question: question.question,
        options: question.options,
      }),
    );
    base.trivia = {
      questions,
      answers: Array.isArray(mine.answers) ? mine.answers : [],
      score: myRow?.score ?? 0,
      total: questions.length,
    };
  } else if (raw.kind === "would_you_rather") {
    const state = raw.state as unknown as WyrSessionState;
    const mine = (myRow?.state ?? {}) as WyrPlayerState;
    const { data: voteRows, error: voteError } = await service
      .from("activity_votes")
      .select("user_id, prompt_index, choice")
      .eq("activity_id", raw.id);
    if (voteError) throw new ActivityError("Couldn't load the votes.", 500);
    const votes = (voteRows ?? []) as {
      user_id: string;
      prompt_index: number;
      choice: number;
    }[];
    const prompts: WouldYouRatherPrompt[] = (state.prompts ?? []).map(
      (prompt, index) => {
        const forPrompt = votes.filter((vote) => vote.prompt_index === index);
        const myVote = forPrompt.find((vote) => vote.user_id === userId);
        return {
          index,
          a: prompt.a,
          b: prompt.b,
          counts: [
            forPrompt.filter((vote) => vote.choice === 0).length,
            forPrompt.filter((vote) => vote.choice === 1).length,
          ],
          myChoice: myVote ? (myVote.choice as 0 | 1) : null,
        };
      },
    );
    base.wouldYouRather = {
      prompts,
      voted:
        Number(mine.voted) ||
        prompts.filter((prompt) => prompt.myChoice !== null).length,
      total: prompts.length,
    };
  }

  return base;
}

export async function createActivity(
  userId: string,
  kindValue: unknown,
  scopeValue: unknown,
  scopeIdValue: unknown,
): Promise<ActivitySession> {
  if (!isActivityKind(kindValue))
    throw new ActivityError("Choose a valid activity.", 400);
  if (!isActivityScope(scopeValue))
    throw new ActivityError("Activities can't be started here.", 400);
  if (scopeValue === "public")
    scopeIdValue = "00000000-0000-0000-0000-000000000000";
  if (!isUuid(scopeIdValue))
    throw new ActivityError("That conversation no longer exists.", 400);
  const service = requireService();
  if (!(await canAccess(service, scopeValue, scopeIdValue, userId))) {
    throw new ActivityError("You don't have access to this conversation.", 403);
  }

  let state: Record<string, unknown>;
  if (isArcadeKind(kindValue)) {
    state = arcadeInitialState(kindValue);
  } else if (isBoardKind(kindValue)) {
    state = { ...initialBoard(kindValue) };
  } else if (kindValue === "wordle") {
    state = { answer: pickOne(WORDLE_ANSWERS), maxGuesses: 6 };
  } else if (kindValue === "eight_ball") {
    state = { feed: [] };
  } else if (kindValue === "trivia") {
    state = { questions: pickMany(TRIVIA_BANK, 5) };
  } else {
    state = { prompts: pickMany(WOULD_YOU_RATHER_BANK, 5) };
  }

  const { data, error } = await service
    .from("activity_sessions")
    .insert({
      kind: kindValue,
      scope: scopeValue,
      scope_id: scopeIdValue,
      host_id: userId,
      state,
      expires_at: new Date(Date.now() + LIFETIME_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data?.id)
    throw new ActivityError("Couldn't start that activity.", 500);

  const { error: playerError } = await service.from("activity_players").insert({
    activity_id: data.id,
    user_id: userId,
  });
  if (playerError) {
    await service.from("activity_sessions").delete().eq("id", data.id);
    throw new ActivityError("Couldn't start that activity.", 500);
  }

  return getActivityById(data.id, userId);
}

export async function joinActivity(
  id: string,
  userId: string,
): Promise<ActivitySession> {
  const service = requireService();
  const raw = await loadSession(service, id, userId);
  if (isExpired(raw)) throw new ActivityError("That activity has ended.", 409);
  const { error } = await service.rpc("activity_join", {
    p_id: raw.id,
    p_user: userId,
  });
  if (error)
    throw new ActivityError(
      error.code === "P0001" ? error.message : "Couldn't join that activity.",
      error.code === "P0001" ? 409 : 500,
    );
  return getActivityById(raw.id, userId);
}

async function requirePlayer(
  service: SupabaseClient,
  activityId: string,
  userId: string,
): Promise<RawPlayer> {
  const { data, error } = await service
    .from("activity_players")
    .select("user_id, state, score, finished, won, joined_at")
    .eq("activity_id", activityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ActivityError("Couldn't load your game.", 500);
  if (!data) throw new ActivityError("Join the activity before you play.", 409);
  return data as RawPlayer;
}

async function playWordle(
  service: SupabaseClient,
  raw: RawSession,
  userId: string,
  body: Record<string, unknown>,
): Promise<ActivitySession> {
  const guess =
    typeof body.guess === "string" ? body.guess.trim().toLowerCase() : "";
  if (!/^[a-z]{5}$/.test(guess))
    throw new ActivityError("Enter a five-letter word.", 400);
  const player = await requirePlayer(service, raw.id, userId);
  if (player.finished)
    throw new ActivityError("You've already finished this word.", 409);

  const state = raw.state as unknown as WordleSessionState;
  const mine = player.state as WordlePlayerState;
  const previous = Array.isArray(mine.guesses) ? mine.guesses : [];
  const maxGuesses = Number(state.maxGuesses) || 6;
  if (previous.length >= maxGuesses)
    throw new ActivityError("You've used all your guesses.", 409);

  const row: WordleGuessRow = {
    word: guess,
    marks: wordleMarks(guess, state.answer),
  };
  const guesses = [...previous, row];
  const solved = guess === state.answer;
  const finished = solved || guesses.length >= maxGuesses;
  const score = solved
    ? Math.max(10, 70 - (guesses.length - 1) * 10)
    : player.score;

  await commitMove(
    service,
    raw,
    userId,
    [{ userId, state: { ...mine, guesses }, score, finished, won: solved }],
    finished
      ? [{ userId, plays: 1, wins: solved ? 1 : 0, points: score, best: score }]
      : [],
  );

  return getActivityById(raw.id, userId);
}

async function askEightBall(
  service: SupabaseClient,
  raw: RawSession,
  userId: string,
  body: Record<string, unknown>,
): Promise<ActivitySession> {
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 2)
    throw new ActivityError("Ask the ball a question first.", 400);
  if (question.length > 200)
    throw new ActivityError("Keep the question under 200 characters.", 400);

  const player = await requirePlayer(service, raw.id, userId);
  if (player.finished)
    throw new ActivityError("You've asked the ball enough for now.", 409);
  const mine = player.state as EightBallPlayerState;
  const asked = Number(mine.asked) || 0;
  const maxAsks = 10;
  if (asked >= maxAsks)
    throw new ActivityError("You've asked the ball enough for now.", 409);

  const profiles = await loadProfiles(service, [userId]);
  const profile = profiles.get(userId);
  const state = raw.state as unknown as EightBallSessionState;
  const entry: EightBallEntry = {
    id: randomUUID(),
    userId,
    displayName: profileName(profile),
    avatarUrl: profile?.avatar_url ?? null,
    question,
    answer: pickOne(EIGHT_BALL_ANSWERS),
    createdAt: new Date().toISOString(),
  };
  const feed = [entry, ...(Array.isArray(state.feed) ? state.feed : [])].slice(
    0,
    50,
  );

  const nextAsked = asked + 1;
  await commitMove(
    service,
    raw,
    userId,
    [
      {
        userId,
        state: { ...mine, asked: nextAsked },
        score: (player.score ?? 0) + 2,
        finished: nextAsked >= maxAsks,
        won: false,
      },
    ],
    [{ userId, plays: asked === 0 ? 1 : 0, wins: 0, points: 2, best: 0 }],
    { ...state, feed },
  );
  return getActivityById(raw.id, userId);
}

async function answerTriviaQuestion(
  service: SupabaseClient,
  raw: RawSession,
  userId: string,
  body: Record<string, unknown>,
): Promise<ActivitySession> {
  const index = typeof body.index === "number" ? body.index : Number.NaN;
  const choice = typeof body.choice === "number" ? body.choice : Number.NaN;
  const state = raw.state as unknown as TriviaSessionState;
  const questions = state.questions ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
    throw new ActivityError("That question isn't part of this game.", 400);
  }
  const question = questions[index]!;
  if (
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= question.options.length
  ) {
    throw new ActivityError("Pick one of the answers.", 400);
  }

  const player = await requirePlayer(service, raw.id, userId);
  if (player.finished)
    throw new ActivityError("You've finished this round.", 409);
  const mine = player.state as TriviaPlayerState;
  const answers = Array.isArray(mine.answers) ? mine.answers : [];
  if (answers.some((answer) => answer.index === index)) {
    throw new ActivityError("You've already answered that one.", 409);
  }

  const correct = question.answer === choice;
  const answer: TriviaAnswer = {
    index,
    choice,
    correct,
    answer: question.answer,
  };
  const nextAnswers = [...answers, answer];
  const score = (player.score ?? 0) + (correct ? 1 : 0);
  const finished = nextAnswers.length >= questions.length;
  const won = finished && score === questions.length;

  await commitMove(
    service,
    raw,
    userId,
    [
      {
        userId,
        state: { ...mine, answers: nextAnswers },
        score,
        finished,
        won,
      },
    ],
    finished
      ? [
          {
            userId,
            plays: 1,
            wins: won ? 1 : 0,
            points: score * 20,
            best: score * 20,
          },
        ]
      : [],
  );

  return getActivityById(raw.id, userId);
}

async function voteWouldYouRather(
  service: SupabaseClient,
  raw: RawSession,
  userId: string,
  body: Record<string, unknown>,
): Promise<ActivitySession> {
  const index = typeof body.index === "number" ? body.index : Number.NaN;
  const choice = typeof body.choice === "number" ? body.choice : Number.NaN;
  const state = raw.state as unknown as WyrSessionState;
  const prompts = state.prompts ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= prompts.length) {
    throw new ActivityError("That choice isn't part of this game.", 400);
  }
  if (choice !== 0 && choice !== 1)
    throw new ActivityError("Pick a side.", 400);

  const player = await requirePlayer(service, raw.id, userId);
  if (player.finished)
    throw new ActivityError("You've made all your choices.", 409);
  const mine = player.state as WyrPlayerState;

  const { data: existing } = await service
    .from("activity_votes")
    .select("choice")
    .eq("activity_id", raw.id)
    .eq("user_id", userId)
    .eq("prompt_index", index)
    .maybeSingle();
  if (existing)
    throw new ActivityError("You've already voted on this one.", 409);

  const voted = (Number(mine.voted) || 0) + 1;
  const finished = voted >= prompts.length;
  await commitMove(
    service,
    raw,
    userId,
    [
      {
        userId,
        state: { ...mine, voted },
        score: (player.score ?? 0) + 2,
        finished,
        won: false,
      },
    ],
    [{ userId, plays: voted === 1 ? 1 : 0, wins: 0, points: 2, best: 0 }],
    raw.state,
    { index, choice },
  );
  return getActivityById(raw.id, userId);
}

export async function performActivityAction(
  userId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ActivitySession> {
  const service = requireService();
  const raw = await loadSession(service, id, userId);
  if (isExpired(raw)) throw new ActivityError("That activity has ended.", 409);

  if (isBoardKind(raw.kind)) {
    if (body.revision !== raw.revision)
      throw new ActivityError("The board changed. Refresh and try again.", 409);
    const players = await loadPlayers(service, raw.id);
    const seat = players.findIndex((p) => p.user_id === userId);
    if (seat < 0)
      throw new ActivityError("Join the match before playing.", 403);
    if (players.length !== 2)
      throw new ActivityError("Waiting for an opponent.", 409);
    const board = raw.state as unknown as BoardState;
    let next: BoardState;
    if (body.action === "resign")
      next = { ...board, winner: seat === 0 ? 2 : 1 };
    else if (body.action === "board_move" && typeof body.move === "number") {
      try {
        next = moveBoard(raw.kind, board, (seat + 1) as 1 | 2, body.move);
      } catch (error) {
        throw new ActivityError(
          error instanceof Error ? error.message : "Invalid move.",
          409,
        );
      }
    } else throw new ActivityError("Choose a move.", 400);
    const finished = next.winner !== null;
    const updates = players.map((p, i) => ({
      userId: p.user_id,
      state: p.state,
      finished,
      won: next.winner === i + 1,
      score: finished
        ? next.winner === 0
          ? 25
          : next.winner === i + 1
            ? 100
            : 0
        : 0,
    }));
    await commitMove(
      service,
      raw,
      userId,
      updates,
      finished
        ? updates.map((p) => ({
            userId: p.userId,
            plays: 1,
            wins: p.won ? 1 : 0,
            points: p.score,
            best: p.score,
          }))
        : [],
      next,
      null,
      finished,
    );
    return getActivityById(raw.id, userId);
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (isArcadeKind(raw.kind) && action === "arcade_move") {
    const player = await requirePlayer(service, raw.id, userId);
    if (player.finished) throw new ActivityError("You've finished this one. Check the results.", 409);
    let outcome;
    try {
      outcome = arcadeMove(raw.kind, raw.state, (player.state ?? {}) as Record<string, unknown>, body);
    } catch (error) {
      if (error instanceof ArcadeError) throw new ActivityError(error.message, 400);
      throw error;
    }
    const { state, score, finished, won } = outcome;
    await commitMove(
      service,
      raw,
      userId,
      [{ userId, state, score, finished, won }],
      finished ? [{ userId, plays: 1, wins: won ? 1 : 0, points: score, best: score }] : [],
    );
    await closeIfEveryoneFinished(service, raw.id);
    return getActivityById(raw.id, userId);
  }
  if (raw.kind === "wordle" && action === "wordle_guess")
    return closeAfter(service, raw.id, userId, playWordle(service, raw, userId, body));
  if (raw.kind === "eight_ball" && action === "eight_ball_ask")
    return askEightBall(service, raw, userId, body);
  if (raw.kind === "trivia" && action === "trivia_answer")
    return closeAfter(service, raw.id, userId, answerTriviaQuestion(service, raw, userId, body));
  if (raw.kind === "would_you_rather" && action === "wyr_vote") {
    return closeAfter(service, raw.id, userId, voteWouldYouRather(service, raw, userId, body));
  }
  throw new ActivityError("That action isn't available in this activity.", 400);
}

/**
 * A game ends once everyone who joined has finished; it can't wait a full
 * day for players who are done. Its results stay viewable.
 */
async function closeIfEveryoneFinished(service: SupabaseClient, id: string): Promise<boolean> {
  const players = await loadPlayers(service, id);
  if (players.length === 0 || players.some((p) => !p.finished)) return false;
  await service.from("activity_sessions").update({ status: "closed" }).eq("id", id).eq("status", "open");
  return true;
}

async function closeAfter(
  service: SupabaseClient,
  id: string,
  userId: string,
  move: Promise<ActivitySession>,
): Promise<ActivitySession> {
  const result = await move;
  return (await closeIfEveryoneFinished(service, id)) ? getActivityById(id, userId) : result;
}

export async function getActivityLeaderboard(
  userId: string,
  kindValue: unknown,
): Promise<ActivityLeaderboardRow[]> {
  if (!isActivityKind(kindValue))
    throw new ActivityError("Choose a valid activity.", 400);
  return loadLeaderboard(requireService(), kindValue, userId);
}

export async function listPublicActivities(
  userId: string,
): Promise<ActivityRoom[]> {
  const service = requireService();
  const { data, error } = await service
    .from("activity_sessions")
    .select("id,kind,host_id,created_at,activity_players(user_id)")
    .eq("scope", "public")
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new ActivityError("Couldn't load public games.", 500);
  const rows = data ?? [];
  const profiles = await loadProfiles(
    service,
    rows.map((r) => r.host_id),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as ActivityKind,
    hostName: profileName(profiles.get(row.host_id)),
    participantCount: row.activity_players.length,
    capacity: isBoardKind(row.kind) ? 2 : 20,
    createdAt: row.created_at,
  }));
}

export async function rematchActivity(
  id: string,
  userId: string,
): Promise<ActivitySession> {
  const service = requireService();
  const raw = await loadSession(service, id, userId);
  if (!isBoardKind(raw.kind))
    throw new ActivityError("This game doesn't support rematches.", 400);
  const { data, error } = await service.rpc("activity_rematch", {
    p_id: id,
    p_actor: userId,
    p_state: initialBoard(raw.kind),
  });
  if (error || typeof data !== "string")
    throw new ActivityError(
      error?.code === "P0001" ? error.message : "Couldn't start the rematch.",
      409,
    );
  return getActivityById(data, userId);
}
