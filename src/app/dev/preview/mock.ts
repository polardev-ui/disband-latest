/**
 * Sample data for /dev/preview. Development only — nothing here talks to the
 * backend, and the route 404s in production builds.
 */
import type {
  Channel,
  ChannelCategory,
  DmMessage,
  DmThread,
  Friendship,
  GroupChatWithMembers,
  GroupMessage,
  Message,
  Note,
  Profile,
  Server,
  ServerMember,
  ServerRole,
  UserStatus,
  VoicePresence,
} from "@/lib/supabase/types";
import type { MessageReaction } from "@/lib/messages";

const NOW = Date.now();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function profile(
  id: string,
  username: string,
  display: string,
  status: UserStatus,
  extra: Partial<Profile> = {},
): Profile {
  return {
    id,
    username,
    display_name: display,
    avatar_url: null,
    bio: null,
    status,
    preferred_status: status,
    banner_url: null,
    accent_color: null,
    accent_color_2: null,
    theme: "dark",
    avatar_crop: null,
    show_owner_badge: false,
    show_staff_badge: false,
    show_og_badge: false,
    show_bounty_badge: false,
    created_at: iso(60 * 24 * 400),
    updated_at: iso(60),
    ...extra,
  };
}

export const ME = profile("00000000-0000-4000-8000-000000000001", "polar", "polar", "online", {
  bio: "Software engineer.\nBuilding Disband.",
  pronouns: "they/them",
  accent_color: "#4641d9",
  accent_color_2: "#a855f7",
  status_note: "Shipping the redesign",
  subscription_plan: "aero",
});

export const ELLIOT = profile("00000000-0000-4000-8000-000000000002", "elliot", "Elliot", "online", {
  bio: "A bug is never just a mistake.",
});
export const DARLENE = profile("00000000-0000-4000-8000-000000000003", "darlene", "Darlene", "online");
export const ANGELA = profile("00000000-0000-4000-8000-000000000004", "angela", "Angela", "idle");
export const ROBOT = profile("00000000-0000-4000-8000-000000000005", "mrrobot", "Mr. Robot", "dnd");
export const TYRELL = profile("00000000-0000-4000-8000-000000000006", "tyrell", "Tyrell", "offline");

export const PEOPLE = [ME, ELLIOT, DARLENE, ANGELA, ROBOT, TYRELL];

export const SERVERS: Server[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Robotics Club",
    icon_url: null,
    banner_url: null,
    description: "Build, break, repeat.",
    owner_id: ME.id,
    created_at: iso(60 * 24 * 90),
    verified: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Aurora Writers",
    icon_url: null,
    banner_url: null,
    description: null,
    owner_id: ELLIOT.id,
    created_at: iso(60 * 24 * 60),
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Weekend Gaming",
    icon_url: null,
    banner_url: null,
    description: null,
    owner_id: DARLENE.id,
    created_at: iso(60 * 24 * 30),
  },
];

const S1 = SERVERS[0].id;

export const CATEGORIES: ChannelCategory[] = [
  { id: "20000000-0000-4000-8000-000000000001", server_id: S1, name: "Text Channels", position: 0 },
  { id: "20000000-0000-4000-8000-000000000002", server_id: S1, name: "Testing Zone", position: 1 },
  { id: "20000000-0000-4000-8000-000000000003", server_id: S1, name: "Voice Channels", position: 2 },
];

function channel(id: number, name: string, type: Channel["type"], category: number, position: number, extra: Partial<Channel> = {}): Channel {
  return {
    id: `30000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    server_id: S1,
    category_id: CATEGORIES[category].id,
    name,
    type,
    position,
    created_at: iso(60 * 24 * 80),
    ...extra,
  };
}

export const CHANNELS: Channel[] = [
  channel(1, "general", "text", 0, 0, { topic: "Where the club hangs out", slow_mode_seconds: 10 }),
  channel(2, "news-updates", "text", 0, 1, { read_only: true }),
  channel(3, "memes", "text", 0, 2),
  channel(4, "showcase", "text", 0, 3),
  channel(10, "help-desk", "forum", 0, 4, { topic: "Ask the club anything about builds and parts.", available_tags: ["question", "bug", "idea"] }),
  channel(5, "testing-01", "text", 1, 0),
  channel(6, "testing-02", "text", 1, 1),
  channel(7, "Robo Lounge", "voice", 2, 0),
  channel(8, "Gaming #1", "voice", 2, 1),
  channel(9, "AFK", "voice", 2, 2),
];

export const ROLES: ServerRole[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    server_id: S1,
    name: "@everyone",
    color: "#99aab5",
    permissions: { send_messages: true, add_reactions: true, attach_files: true, create_invites: true },
    position: 0,
    is_default: true,
    created_at: iso(60 * 24 * 90),
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    server_id: S1,
    name: "Builders",
    color: "#a78bfa",
    permissions: { send_messages: true, add_reactions: true, attach_files: true, pin_messages: true },
    position: 1,
    is_default: false,
    created_at: iso(60 * 24 * 90),
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    server_id: S1,
    name: "Mentors",
    color: "#34d399",
    permissions: { send_messages: true, manage_messages: true, timeout_members: true },
    position: 2,
    is_default: false,
    created_at: iso(60 * 24 * 90),
  },
];

export const MEMBERS: (ServerMember & { profile: Profile })[] = PEOPLE.map((p, i) => ({
  server_id: S1,
  user_id: p.id,
  role: i === 0 ? "owner" : "member",
  role_id: i === 0 ? null : i % 2 ? ROLES[1].id : ROLES[2].id,
  role_ids: i === 0 ? [] : [i % 2 ? ROLES[1].id : ROLES[2].id],
  joined_at: iso(60 * 24 * (80 - i)),
  profile: p,
}));

let displayId = 1;
function msg(author: Profile, minutesAgo: number, content: string, extra: Partial<Message> = {}): Message & { author: Profile } {
  return {
    id: `50000000-0000-4000-8000-${String(displayId).padStart(12, "0")}`,
    channel_id: CHANNELS[0].id,
    author_id: author.id,
    content,
    attachment_url: null,
    attachment_type: null,
    attachment_key: null,
    attachment_name: null,
    attachment_size: null,
    reply_to_id: null,
    mentions: [],
    created_at: iso(minutesAgo),
    edited_at: null,
    display_id: displayId++,
    author,
    ...extra,
  };
}

export const MESSAGES: (Message & { author: Profile })[] = [
  msg(ELLIOT, 60 * 26, "Morning everyone — the servo order finally shipped."),
  msg(DARLENE, 60 * 26 - 3, "about time 🎉"),
  msg(ANGELA, 95, "Reminder: build night is **Thursday at 7pm**. Bring your own soldering iron if you have one."),
  msg(ROBOT, 80, "The world is a dangerous place, not because of those who do evil, but because of those who look on and do nothing."),
  msg(ELLIOT, 42, "A bug is never just a mistake. It represents something bigger.\nAn error of thinking that makes you who you are."),
  msg(ME, 38, "Pushed the new arm firmware to `main` — test it on the bench rig before Thursday."),
  msg(DARLENE, 35, "@polar the gripper still overshoots by a few mm, I'll send a clip", { mentions: [ME.id] }),
  msg(TYRELL, 12, "Has anyone tried the new motor drivers?\n> they run cooler than the old ones"),
  msg(ELLIOT, 4, "Yes — about 8°C cooler under load. Graphs in #showcase."),
];

export const MESSAGE_REACTIONS: MessageReaction[] = [
  [MESSAGES[1].id, ELLIOT.id, "🎉"],
  [MESSAGES[1].id, ME.id, "🎉"],
  [MESSAGES[4].id, ME.id, "👍"],
  [MESSAGES[4].id, DARLENE.id, "👌"],
  [MESSAGES[4].id, TYRELL.id, "👍"],
].map(([message_id, user_id, emoji], i) => ({
  id: `a0000000-0000-4000-8000-00000000000${i + 1}`,
  context_type: "channel",
  message_id,
  user_id,
  emoji,
  created_at: iso(30),
}));

export const DM_THREADS: (DmThread & { friend: Profile })[] = [
  { id: "60000000-0000-4000-8000-000000000001", user_a: ME.id, user_b: DARLENE.id, created_at: iso(60 * 24 * 10), friend: DARLENE },
  { id: "60000000-0000-4000-8000-000000000002", user_a: ME.id, user_b: ANGELA.id, created_at: iso(60 * 24 * 20), friend: ANGELA },
  { id: "60000000-0000-4000-8000-000000000003", user_a: ME.id, user_b: ELLIOT.id, created_at: iso(60 * 24 * 30), friend: ELLIOT },
];

function dm(author: Profile, minutesAgo: number, content: string): DmMessage & { author: Profile } {
  return {
    id: `70000000-0000-4000-8000-${String(displayId).padStart(12, "0")}`,
    thread_id: DM_THREADS[0].id,
    author_id: author.id,
    content,
    attachment_url: null,
    attachment_type: null,
    attachment_key: null,
    attachment_name: null,
    attachment_size: null,
    reply_to_id: null,
    mentions: [],
    created_at: iso(minutesAgo),
    edited_at: null,
    display_id: displayId++,
    author,
  };
}

export const DM_MESSAGES: (DmMessage & { author: Profile })[] = [
  dm(DARLENE, 120, "did you see the new layout?"),
  dm(ME, 118, "yes! the sidebar is so much cleaner"),
  dm(DARLENE, 30, "the profile cards are my favourite part"),
];

export const GROUPS: GroupChatWithMembers[] = [
  {
    id: "80000000-0000-4000-8000-000000000001",
    name: "Friend Hangout",
    owner_id: ME.id,
    icon_url: null,
    created_at: iso(60 * 24 * 14),
    last_message_at: iso(90),
    members: [ME, DARLENE, ANGELA, ELLIOT],
  },
  {
    id: "80000000-0000-4000-8000-000000000002",
    name: "Work Chat",
    owner_id: ELLIOT.id,
    icon_url: null,
    created_at: iso(60 * 24 * 40),
    last_message_at: iso(60 * 24 * 3),
    members: [ME, ELLIOT, TYRELL],
  },
];

export const GROUP_MESSAGES: GroupMessage[] = [];
export const NOTES: Note[] = [];

export const FRIENDSHIPS: Friendship[] = [ELLIOT, DARLENE, ANGELA, ROBOT, TYRELL].map((p, i) => ({
  id: `90000000-0000-4000-8000-00000000000${i + 1}`,
  requester_id: ME.id,
  addressee_id: p.id,
  status: "accepted",
  created_at: iso(60 * 24 * 100),
  requester: ME,
  addressee: p,
}));

export const VOICE_PRESENCE: (VoicePresence & { profile: Profile })[] = [
  { channel_id: CHANNELS[6].id, user_id: DARLENE.id, joined_at: iso(25), muted: false, deafened: false, profile: DARLENE },
  { channel_id: CHANNELS[6].id, user_id: ANGELA.id, joined_at: iso(18), muted: true, deafened: false, profile: ANGELA },
];
