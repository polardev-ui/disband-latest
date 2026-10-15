import { CHANNELS, ME, SPACES } from "../data/seed";
import type { Channel, Conversation, Message, Person, Presence, Space } from "../data/types";
import type { ChatState } from "./store";

export interface ConvInfo {
  id: string;
  conv: Conversation;
  title: string;
  /** Who you are talking to, for DMs. */
  person?: Person;
  /** Everyone except you, for groups. */
  members?: Person[];
  space?: Space;
  channel?: Channel;
}

export function convInfo(state: ChatState, convId: string): ConvInfo | null {
  const conv = state.conversations[convId];
  if (!conv) return null;
  if (conv.kind === "dm") {
    const person = state.people[conv.personId];
    return { id: convId, conv, title: person?.name ?? "Unknown", person };
  }
  if (conv.kind === "group") {
    const members = conv.memberIds.filter((id) => id !== ME).map((id) => state.people[id]).filter(Boolean);
    return { id: convId, conv, title: conv.name, members };
  }
  const channel = CHANNELS[conv.channelId];
  return { id: convId, conv, title: channel.name, channel, space: SPACES[conv.spaceId] };
}

export function messagesOf(state: ChatState, convId: string): Message[] {
  return state.messages[convId] ?? [];
}

export function lastMessage(state: ChatState, convId: string): Message | undefined {
  const list = state.messages[convId];
  return list && list.length ? list[list.length - 1] : undefined;
}

export interface RecentItem {
  info: ConvInfo;
  last?: Message;
  unread: number;
  mention: boolean;
  muted: boolean;
}

export function recentConversations(state: ChatState): RecentItem[] {
  const now = Date.now();
  return state.recent
    .map((id) => convInfo(state, id))
    .filter((x): x is ConvInfo => !!x)
    .map((info) => ({
      info,
      last: lastMessage(state, info.id),
      unread: state.unread[info.id] ?? 0,
      mention: !!state.mentions[info.id],
      muted: state.muted.includes(info.id),
    }))
    .sort((a, b) => (b.last?.at ?? now) - (a.last?.at ?? now));
}

export function plainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function previewText(state: ChatState, msg: Message | undefined, opts: { group?: boolean } = {}): string {
  if (!msg) return "No messages yet";
  let body = plainText(msg.text);
  if (!body && msg.attachments?.length) {
    const a = msg.attachments[0];
    body = a.kind === "file" ? `Shared ${a.name}` : a.title;
  }
  if (msg.authorId === ME) return `You: ${body}`;
  if (opts.group) return `${firstName(state.people[msg.authorId])}: ${body}`;
  return body;
}

export function firstName(p?: Person): string {
  if (!p) return "Someone";
  if (p.unavailable) return p.name;
  return p.name.split(" ")[0];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function spaceChannels(space: Space): Channel[] {
  return space.categories.flatMap((c) => c.channelIds.map((id) => CHANNELS[id]));
}

export function firstTextChannel(space: Space): string {
  return spaceChannels(space).find((c) => c.kind === "text")!.id;
}

export function spaceUnread(state: ChatState, spaceId: string): { count: number; mention: boolean } {
  const space = SPACES[spaceId];
  let count = 0;
  let mention = false;
  for (const ch of spaceChannels(space)) {
    count += state.unread[ch.id] ?? 0;
    mention = mention || !!state.mentions[ch.id];
  }
  return { count, mention };
}

export function dmUnread(state: ChatState): number {
  return state.recent.reduce((n, id) => n + (state.unread[id] ?? 0), 0);
}

export function mutualSpaces(state: ChatState, personId: string): Space[] {
  return state.spaces.map((id) => SPACES[id]).filter((s) => s.memberIds.includes(personId));
}

export function roleIn(space: Space | undefined, personId: string): string | undefined {
  return space?.roles[personId];
}

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  idle: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};

export function effectivePresence(state: ChatState, person: Person): Presence {
  if (person.id === ME && state.prefs.appearOffline) return "offline";
  if (state.scenario === "offline" && person.id !== ME) return "offline";
  return person.presence;
}

// ── Time ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysAgo(ts: number): number {
  return Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(ts: number): string {
  const n = daysAgo(ts);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return new Date(ts).toLocaleDateString([], { weekday: "long" });
  return new Date(ts).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/** Compact time for conversation lists. */
export function listTime(ts: number): string {
  const n = daysAgo(ts);
  if (n <= 0) return clock(ts);
  if (n === 1) return "Yesterday";
  if (n < 7) return new Date(ts).toLocaleDateString([], { weekday: "short" });
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Natural phrasing: "just now", "12 min ago", "Yesterday at 6:42 PM". */
export function naturalTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff >= 0 && diff < 60_000) return "just now";
  if (diff >= 0 && diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} min ago`;
  const n = daysAgo(ts);
  if (n <= 0) return clock(ts);
  if (n === 1) return `Yesterday at ${clock(ts)}`;
  if (n < 7) return `${new Date(ts).toLocaleDateString([], { weekday: "long" })} at ${clock(ts)}`;
  return `${new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })} at ${clock(ts)}`;
}

export function fullTime(ts: number): string {
  return new Date(ts).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Message grouping ────────────────────────────────────────────────────

export type Row =
  | { type: "day"; key: string; label: string }
  | { type: "msg"; key: string; msg: Message; first: boolean; last: boolean };

const GROUP_GAP = 7 * 60_000;

function joins(prev: Message | undefined, m: Message): boolean {
  return (
    !!prev &&
    prev.authorId === m.authorId &&
    m.at - prev.at < GROUP_GAP &&
    startOfDay(prev.at) === startOfDay(m.at) &&
    !m.replyToId &&
    !prev.failed
  );
}

export function groupMessages(list: Message[]): Row[] {
  const rows: Row[] = [];
  let prevDay = -1;
  list.forEach((m, i) => {
    const day = startOfDay(m.at);
    if (day !== prevDay) {
      rows.push({ type: "day", key: `day-${day}`, label: dayLabel(m.at) });
      prevDay = day;
    }
    const prev = list[i - 1];
    const next = list[i + 1];
    rows.push({ type: "msg", key: m.id, msg: m, first: !joins(prev, m), last: !next || !joins(m, next) });
  });
  return rows;
}

// ── Search ──────────────────────────────────────────────────────────────

export type SearchHit =
  | { kind: "person"; key: string; person: Person; detail: string }
  | { kind: "place"; key: string; convId?: string; spaceId?: string; title: string; detail: string; icon: "dm" | "group" | "channel" | "space" }
  | { kind: "message"; key: string; msg: Message; where: string };

export interface SearchGroups {
  people: SearchHit[];
  places: SearchHit[];
  messages: SearchHit[];
}

function knownPeople(state: ChatState): string[] {
  const ids = new Set<string>(state.friends);
  for (const id of state.recent) {
    const c = state.conversations[id];
    if (c?.kind === "dm") ids.add(c.personId);
    if (c?.kind === "group") c.memberIds.forEach((m) => ids.add(m));
  }
  for (const s of state.spaces) SPACES[s].memberIds.forEach((m) => ids.add(m));
  ids.delete(ME);
  return [...ids].filter((id) => !state.people[id]?.unavailable && !state.blocked.includes(id));
}

function reachableConvs(state: ChatState): string[] {
  const ids = [...state.recent];
  for (const s of state.spaces) for (const ch of spaceChannels(SPACES[s])) if (ch.kind === "text") ids.push(ch.id);
  return ids;
}

export function search(state: ChatState, raw: string): SearchGroups {
  const q = raw.trim().toLowerCase();
  if (!q) return { people: [], places: [], messages: [] };
  const has = (s: string | undefined) => !!s && s.toLowerCase().includes(q);

  const people: SearchHit[] = knownPeople(state)
    .map((id) => state.people[id])
    .filter((p) => has(p.name) || has(p.username))
    .slice(0, 5)
    .map((p) => ({ kind: "person", key: `p-${p.id}`, person: p, detail: `@${p.username}` }));

  const places: SearchHit[] = [];
  for (const id of state.recent) {
    const info = convInfo(state, id);
    if (info?.conv.kind === "group" && has(info.title)) {
      places.push({ kind: "place", key: `c-${id}`, convId: id, title: info.title, detail: `Group · ${info.members!.length + 1} people`, icon: "group" });
    }
  }
  for (const s of state.spaces) {
    const space = SPACES[s];
    if (has(space.name)) places.push({ kind: "place", key: `s-${s}`, spaceId: s, title: space.name, detail: `Space · ${space.memberIds.length} members`, icon: "space" });
    for (const ch of spaceChannels(space)) {
      if (ch.kind === "text" && has(ch.name)) places.push({ kind: "place", key: `c-${ch.id}`, convId: ch.id, title: ch.name, detail: space.name, icon: "channel" });
    }
  }

  const messages: SearchHit[] = [];
  for (const id of reachableConvs(state)) {
    const info = convInfo(state, id);
    if (!info) continue;
    for (const m of messagesOf(state, id)) {
      if (has(plainText(m.text))) {
        const where = info.conv.kind === "channel" ? `#${info.title} · ${info.space!.name}` : info.title;
        messages.push({ kind: "message", key: `m-${m.id}`, msg: m, where });
      }
    }
  }
  messages.sort((a, b) => (b as { msg: Message }).msg.at - (a as { msg: Message }).msg.at);

  return { people, places: places.slice(0, 6), messages: messages.slice(0, 8) };
}

export { SPACES, CHANNELS };
