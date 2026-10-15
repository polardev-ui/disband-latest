// Shapes follow Disband's real data model (src/lib/supabase/types.ts):
// profiles with pronouns, a status note and an accent colour; spaces with
// categories of text and voice channels; DMs and group DMs; messages with
// replies, reactions, attachments and an edited timestamp.

export type Presence = "online" | "idle" | "dnd" | "offline";

export interface Person {
  id: string;
  name: string;
  username: string;
  pronouns?: string;
  bio?: string;
  /** Custom status note, e.g. "Headphones on until 3". */
  note?: string;
  presence: Presence;
  /** Profile accent colour. Disband profiles carry one. */
  accent: string;
  joined: string;
  /** Deleted or suspended account. Its old messages remain. */
  unavailable?: boolean;
}

export interface Channel {
  id: string;
  spaceId: string;
  name: string;
  kind: "text" | "voice";
  topic?: string;
  /** Read-only channels exist in Disband (e.g. announcements). */
  readOnly?: boolean;
  /** People currently connected to a voice channel. */
  inVoice?: string[];
}

export interface Category {
  id: string;
  name: string;
  channelIds: string[];
}

export interface Space {
  id: string;
  name: string;
  initials: string;
  color: string;
  description: string;
  ownerId: string;
  memberIds: string[];
  /** Display role per member id. */
  roles: Record<string, string>;
  categories: Category[];
  inviteCode: string;
}

export type Conversation =
  | { id: string; kind: "dm"; personId: string }
  | { id: string; kind: "group"; name: string; memberIds: string[] }
  | { id: string; kind: "channel"; spaceId: string; channelId: string };

export type Attachment =
  | { kind: "file"; name: string; size: number }
  | { kind: "link"; url: string; host: string; title: string; description: string };

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  convId: string;
  authorId: string;
  text: string;
  at: number;
  editedAt?: number;
  replyToId?: string;
  reactions: Reaction[];
  attachments?: Attachment[];
  /** Created in this browser tab. Only these can be edited or deleted. */
  local?: boolean;
  /** Simulated send failure (Offline state). */
  failed?: boolean;
}

export type DesignKey = "quiet" | "social" | "space";
export type Scenario = "normal" | "new" | "loading" | "offline";
export type ThemePref = "system" | "light" | "dark";
export type MotionPref = "system" | "full" | "reduced";
