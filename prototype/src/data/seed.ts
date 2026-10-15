import type { Channel, Conversation, Message, Person, Space } from "./types";

// Deterministic sample data. Clock times are fixed; only the calendar day
// follows the viewer's date, so "Today" and "Yesterday" always read right.

export const ME = "me";

function at(daysAgo: number, hour: number, minute: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export const PEOPLE: Record<string, Person> = {
  me: {
    id: "me", name: "Polar", username: "polar", presence: "online", accent: "#3655c9",
    note: "Shipping 2.33 this week", bio: "Building Disband. Ask me about the iPad layout.", joined: "January 2025",
  },
  nova: {
    id: "nova", name: "Nova Reyes", username: "nova", pronouns: "she/her", presence: "online", accent: "#c2410c",
    note: "Headphones on until 3", bio: "iOS engineer. Making the iPad build feel native.", joined: "February 2025",
  },
  theo: {
    id: "theo", name: "Theo Marsh", username: "theo.m", pronouns: "he/him", presence: "online", accent: "#2f7d6d",
    bio: "Product design. Mostly layouts, sometimes type.", joined: "February 2025",
  },
  mila: {
    id: "mila", name: "Mila Oduya", username: "mila", pronouns: "she/her", presence: "online", accent: "#9a3b7a",
    bio: "Runs Demo HQ. Will remind you about the check-in.", joined: "January 2025",
  },
  iris: {
    id: "iris", name: "Iris Bennet", username: "irisb", pronouns: "they/them", presence: "idle", accent: "#4f6bd8",
    bio: "Icons, illustration, small details.", joined: "March 2025",
  },
  kai: {
    id: "kai", name: "Kai Tanaka", username: "kai", pronouns: "he/him", presence: "dnd", accent: "#334155",
    note: "Heads down on notifications", bio: "Notifications, sync, the parts that have to just work.", joined: "April 2025",
  },
  sam: {
    id: "sam", name: "Sam Whitfield", username: "samw", presence: "offline", accent: "#a16207",
    bio: "Breaking builds professionally.", joined: "May 2025",
  },
  leo: {
    id: "leo", name: "Leo Park", username: "leopark", pronouns: "he/him", presence: "online", accent: "#0e7490",
    bio: "Release tooling and CI.", joined: "June 2025",
  },
  ada: {
    id: "ada", name: "Ada Quinn", username: "ada", pronouns: "she/her", presence: "online", accent: "#b4233c",
    bio: "Keeps the lights on.", joined: "June 2025",
  },
  priya: {
    id: "priya", name: "Priya Nair", username: "priya", pronouns: "she/her", presence: "online", accent: "#be185d",
    note: "Booking ramen", bio: "Film nights, board games, extremely organised group chats.", joined: "March 2025",
  },
  jonah: {
    id: "jonah", name: "Jonah Weiss", username: "jonahw", presence: "offline", accent: "#475569",
    bio: "Self-hosts everything. Yes, even that.", joined: "July 2025",
  },
  bea: {
    id: "bea", name: "Bea Lindqvist", username: "bea", pronouns: "she/her", presence: "idle", accent: "#15803d",
    bio: "Watches the credits all the way through.", joined: "August 2025",
  },
  marcus: {
    id: "marcus", name: "Marcus Hale", username: "marcushale", presence: "online", accent: "#7c4a2d",
    bio: "Indie game dev. Met you in Indie Devs.", joined: "September 2025",
  },
  ren: {
    id: "ren", name: "Ren Ito", username: "ren.ito", presence: "offline", accent: "#3f51b5", joined: "September 2025",
  },
  dex: {
    id: "dex", name: "Dex Morrow", username: "dexm", presence: "offline", accent: "#57534e", joined: "August 2025",
  },
  gone: {
    id: "gone", name: "Deleted account", username: "deleted", presence: "offline", accent: "#6b7280",
    joined: "", unavailable: true,
  },
};

export const SPACES: Record<string, Space> = {
  demo: {
    id: "demo", name: "Demo HQ", initials: "DH", color: "#4c51c6", ownerId: "mila", inviteCode: "demohq",
    description: "Where the Disband demo crew ships things.",
    memberIds: ["mila", "nova", "theo", "iris", "kai", "sam", "leo", "ada", "me"],
    roles: { mila: "Owner", nova: "Engineering", kai: "Engineering", leo: "Engineering", me: "Engineering", theo: "Design", iris: "Design", sam: "QA", ada: "Ops" },
    categories: [
      { id: "demo-info", name: "Information", channelIds: ["ch-welcome", "ch-announcements"] },
      { id: "demo-text", name: "Text", channelIds: ["ch-general", "ch-design-review", "ch-releases", "ch-random"] },
      { id: "demo-voice", name: "Voice", channelIds: ["vc-lounge", "vc-studio"] },
    ],
  },
  film: {
    id: "film", name: "Film Club", initials: "FC", color: "#b45309", ownerId: "bea", inviteCode: "filmclub",
    description: "One film a week, opinions all week.",
    memberIds: ["bea", "theo", "priya", "jonah", "me"],
    roles: { bea: "Owner", theo: "Member", priya: "Member", jonah: "Member", me: "Member" },
    categories: [
      { id: "film-text", name: "Text", channelIds: ["ch-now-watching", "ch-reviews"] },
      { id: "film-voice", name: "Voice", channelIds: ["vc-screening"] },
    ],
  },
  indie: {
    id: "indie", name: "Indie Devs", initials: "ID", color: "#0f766e", ownerId: "marcus", inviteCode: "indiedevs",
    description: "Small teams, shipped games.",
    memberIds: ["marcus", "jonah", "leo", "me"],
    roles: { marcus: "Owner", jonah: "Member", leo: "Member", me: "Member" },
    categories: [{ id: "indie-text", name: "Text", channelIds: ["ch-showcase", "ch-help"] }],
  },
  synth: {
    id: "synth", name: "Synthwave Society", initials: "SS", color: "#9d174d", ownerId: "ada", inviteCode: "synthwave",
    description: "Analog warmth, digital patience.",
    memberIds: ["ada", "kai", "me"],
    roles: { ada: "Owner", kai: "Member", me: "Member" },
    categories: [{ id: "synth-text", name: "Text", channelIds: ["ch-tracks", "ch-gear"] }],
  },
};

export const CHANNELS: Record<string, Channel> = {
  "ch-welcome": { id: "ch-welcome", spaceId: "demo", name: "welcome", kind: "text", topic: "Start here.", readOnly: true },
  "ch-announcements": { id: "ch-announcements", spaceId: "demo", name: "announcements", kind: "text", topic: "Releases and news from the team.", readOnly: true },
  "ch-general": { id: "ch-general", spaceId: "demo", name: "general", kind: "text", topic: "Day-to-day talk for Demo HQ." },
  "ch-design-review": { id: "ch-design-review", spaceId: "demo", name: "design-review", kind: "text", topic: "Post work, get notes." },
  "ch-releases": { id: "ch-releases", spaceId: "demo", name: "releases", kind: "text", topic: "Builds, betas and what's in them." },
  "ch-random": { id: "ch-random", spaceId: "demo", name: "random", kind: "text", topic: "Everything else." },
  "vc-lounge": { id: "vc-lounge", spaceId: "demo", name: "Lounge", kind: "voice", inVoice: ["mila", "leo"] },
  "vc-studio": { id: "vc-studio", spaceId: "demo", name: "Studio", kind: "voice", inVoice: [] },
  "ch-now-watching": { id: "ch-now-watching", spaceId: "film", name: "now-watching", kind: "text", topic: "What's on your screen this week." },
  "ch-reviews": { id: "ch-reviews", spaceId: "film", name: "reviews", kind: "text", topic: "Spoilers allowed. Mark the big ones." },
  "vc-screening": { id: "vc-screening", spaceId: "film", name: "Screening Room", kind: "voice", inVoice: [] },
  "ch-showcase": { id: "ch-showcase", spaceId: "indie", name: "showcase", kind: "text", topic: "Show what you shipped." },
  "ch-help": { id: "ch-help", spaceId: "indie", name: "help", kind: "text", topic: "Stuck? Ask." },
  "ch-tracks": { id: "ch-tracks", spaceId: "synth", name: "tracks", kind: "text", topic: "Finished or not, post it." },
  "ch-gear": { id: "ch-gear", spaceId: "synth", name: "gear", kind: "text", topic: "Patches, pedals and regret." },
};

export const GROUP_RAMEN: Conversation = { id: "g-ramen", kind: "group", name: "Saturday ramen", memberIds: ["priya", "nova", "theo", "me"] };

export function seedConversations(): Record<string, Conversation> {
  const convs: Record<string, Conversation> = {
    "dm-nova": { id: "dm-nova", kind: "dm", personId: "nova" },
    "g-ramen": GROUP_RAMEN,
    "dm-kai": { id: "dm-kai", kind: "dm", personId: "kai" },
    "dm-iris": { id: "dm-iris", kind: "dm", personId: "iris" },
    "dm-priya": { id: "dm-priya", kind: "dm", personId: "priya" },
    "dm-jonah": { id: "dm-jonah", kind: "dm", personId: "jonah" },
  };
  for (const ch of Object.values(CHANNELS)) {
    if (ch.kind === "text") convs[ch.id] = { id: ch.id, kind: "channel", spaceId: ch.spaceId, channelId: ch.id };
  }
  return convs;
}

type Seed = Omit<Message, "id" | "convId" | "reactions"> & { reactions?: Message["reactions"]; key?: string };

function thread(convId: string, items: Seed[]): Message[] {
  return items.map((m, i) => ({ ...m, id: m.key ?? `${convId}-${i}`, convId, reactions: m.reactions ?? [] }));
}

export function seedMessages(): Record<string, Message[]> {
  return {
    "dm-nova": thread("dm-nova", [
      { authorId: "nova", at: at(1, 18, 42), text: "did you see the crash report from the 11-inch?" },
      { authorId: "me", at: at(1, 18, 45), text: "Just now. It's the split view resize again, right?" },
      { authorId: "nova", at: at(1, 18, 46), text: "yep. only when you rotate while the keyboard is up. which, to be fair, almost nobody does" },
      { authorId: "nova", at: at(1, 18, 46), text: "except Sam. Sam does it constantly" },
      { authorId: "me", at: at(1, 18, 50), text: "Sam is our most valuable user", reactions: [{ emoji: "😂", userIds: ["nova"] }] },
      { authorId: "nova", at: at(1, 18, 52), text: "I'll have a fix up tonight. pretty sure it's a one-liner" },
      { authorId: "nova", at: at(0, 9, 5), text: "Fix is in. It was three lines, not one, but I stand by the spirit of the estimate" },
      {
        authorId: "nova", at: at(0, 9, 6), text: "Build's up if you want to check before standup",
        attachments: [{ kind: "link", url: "https://github.com/polardev-ui/disband-latest/releases", host: "github.com", title: "Releases · polardev-ui/disband-latest", description: "iOS 1.13.1 (58) — iPad split view fix, rotation with keyboard open." }],
      },
      { key: "nova-rot", authorId: "me", at: at(0, 9, 20), editedAt: at(0, 9, 21), text: "Checked on the 11 and the 13. Rotation is clean now." },
      { key: "nova-2px", authorId: "me", at: at(0, 9, 21), text: "One small thing: the composer jumps about 2px when the keyboard finishes animating. Not a blocker." },
      { authorId: "nova", at: at(0, 9, 31), replyToId: "nova-2px", text: "I see it. That's the safe-area inset updating a frame late. I'd leave it for 1.14 unless it really bugs you" },
      { authorId: "me", at: at(0, 9, 33), text: "Leave it. Ship it.", reactions: [{ emoji: "🚀", userIds: ["nova"] }] },
      { authorId: "nova", at: at(0, 9, 58), text: "also, are you still coming Saturday? Priya needs a headcount for the ramen place by tonight" },
    ]),
    "g-ramen": thread("g-ramen", [
      { authorId: "priya", at: at(1, 20, 12), text: "Okay, proposal: Saturday, 7pm, Menya Kura. They only take reservations for 6+ so I need real numbers" },
      { authorId: "theo", at: at(1, 20, 15), text: "I'm in" },
      { authorId: "nova", at: at(1, 20, 31), text: "in, but I might be 15 min late. I have a thing across town until 6:30" },
      { authorId: "priya", at: at(1, 20, 33), text: "that's fine, we'll order you the spicy one as a penalty", reactions: [{ emoji: "😂", userIds: ["theo", "nova"] }] },
      { authorId: "theo", at: at(1, 20, 40), text: "Can we do the place with the window seats after? The dessert one" },
      { authorId: "priya", at: at(1, 20, 41), text: "Kumo? yes. they close at 10 though so no dawdling" },
      { authorId: "priya", at: at(0, 10, 2), text: "@Polar you're the last one. yes or no?" },
      { authorId: "theo", at: at(0, 10, 10), text: "Polar always replies at 11:59pm. I'm counting it as a yes" },
    ]),
    "dm-kai": thread("dm-kai", [
      { authorId: "kai", at: at(1, 16, 10), text: "Desktop notifications are double-firing on Windows when the app is minimised to the tray. I have a repro:" },
      { authorId: "kai", at: at(1, 16, 11), text: "```\n1. Minimise to tray\n2. Receive a DM\n3. Two toasts, ~300ms apart\n```" },
      { authorId: "me", at: at(1, 16, 22), text: "Is it both the web notification and the Tauri plugin firing?" },
      { authorId: "kai", at: at(1, 16, 24), text: "That's my guess. The tray path never checks `document.hidden`, so both think they own it." },
      { authorId: "me", at: at(1, 16, 25), text: "I'll take a look first thing tomorrow" },
      { authorId: "kai", at: at(1, 16, 25), text: "👍" },
    ]),
    "dm-iris": thread("dm-iris", [
      {
        authorId: "iris", at: at(4, 14, 3), text: "New icons for the settings sidebar. Tell me if the stroke weight feels off at 16px",
        attachments: [{ kind: "file", name: "settings-icons-v3.fig", size: 2_150_000 }],
      },
      { authorId: "me", at: at(4, 14, 40), text: "They look great. Is the bell a hair heavier than the others?" },
      {
        authorId: "iris", at: at(4, 15, 2), text: "good eye. fixed in v4",
        attachments: [{ kind: "file", name: "settings-icons-v4.fig", size: 2_210_000 }],
        reactions: [{ emoji: "🙏", userIds: ["me"] }],
      },
    ]),
    "dm-priya": thread("dm-priya", [
      { authorId: "priya", at: at(2, 19, 4), text: "can I borrow your Switch dock this weekend? mine finally died" },
      { authorId: "me", at: at(2, 19, 30), text: "Sure, I'll bring it Saturday" },
      { authorId: "priya", at: at(2, 19, 31), text: "you're the best", reactions: [{ emoji: "❤️", userIds: ["me"] }] },
    ]),
    "dm-jonah": thread("dm-jonah", [
      { authorId: "jonah", at: at(6, 11, 15), text: "Are you around this week? Want to pick your brain about running a Disband bot on my own box" },
      { authorId: "me", at: at(6, 12, 2), text: "Thursday afternoon works. The bot API docs are better than they were, but I'll walk you through scopes" },
      { authorId: "jonah", at: at(6, 12, 5), text: "Perfect, thanks" },
    ]),
    "ch-welcome": thread("ch-welcome", [
      { authorId: "mila", at: at(30, 10, 0), text: "Welcome to **Demo HQ**. This is where the Disband demo crew hangs out.\n\nSay hi in #general, post work in #design-review, and check #announcements for release notes." },
    ]),
    "ch-announcements": thread("ch-announcements", [
      {
        authorId: "mila", at: at(0, 8, 30), text: "**Disband 2.33 is out.** A new image viewer, calmer notifications, and gifting straight from the composer.",
        attachments: [{ kind: "link", url: "https://disband.dev", host: "disband.dev", title: "Disband — a place for your people to talk", description: "Spaces, direct messages, group chats and voice calls on desktop, mobile and the web." }],
        reactions: [{ emoji: "🎉", userIds: ["nova", "theo", "ada", "leo"] }],
      },
    ]),
    "ch-general": thread("ch-general", [
      { authorId: "gone", at: at(1, 15, 2), text: "does anyone still have the old brand files? the ones before the logo change" },
      { authorId: "iris", at: at(1, 15, 20), text: "They're in the shared drive under /archive/2025. Please don't use them for anything new though" },
      { authorId: "mila", at: at(0, 9, 2), text: "Morning! Reminder that the release check-in is at 11 in Lounge." },
      { key: "gen-theo", authorId: "theo", at: at(0, 9, 14), text: "Installing the iPad build now. Is the 11-inch the one we were worried about?" },
      { authorId: "nova", at: at(0, 9, 15), replyToId: "gen-theo", text: "That's the one. Fixed as of this morning.", reactions: [{ emoji: "👍", userIds: ["theo", "mila", "me"] }] },
      { authorId: "sam", at: at(0, 9, 40), text: "QA pass done on build 3. Two minor nits, nothing blocking. Writing them up in #releases.", reactions: [{ emoji: "✅", userIds: ["mila", "nova", "leo", "ada"] }, { emoji: "🙏", userIds: ["me"] }] },
      { authorId: "leo", at: at(0, 10, 5), text: "Tagging the beta now:\n```\npnpm release --channel beta\n```" },
      { authorId: "ada", at: at(0, 10, 11), text: "@Polar can you sit in on the check-in? Mostly need you for the settings changes." },
      { authorId: "iris", at: at(0, 10, 14), text: "Also, the new icon set is in #design-review if anyone wants to look before 11" },
    ]),
    "ch-design-review": thread("ch-design-review", [
      {
        authorId: "theo", at: at(0, 8, 50), text: "Settings, round two. Main change: toggles grouped under plain-language headings instead of one long list.",
        attachments: [{ kind: "file", name: "settings-round-2.pdf", size: 4_800_000 }],
      },
      { authorId: "iris", at: at(0, 9, 47), text: "Much easier to scan. Could \"Text & Media\" just be \"Messages\"?" },
      { authorId: "theo", at: at(0, 9, 49), text: "Oh, yes. Nobody knows what Text & Media means." },
      { authorId: "nova", at: at(0, 10, 1), text: "+1. Also the account section reads way less scary now" },
    ]),
    "ch-random": thread("ch-random", [
      { authorId: "leo", at: at(3, 13, 12), text: "Whoever left the oat milk in the office fridge since August: it has become sentient" },
      { authorId: "ada", at: at(3, 13, 30), text: "It's not mine but I respect its journey", reactions: [{ emoji: "😂", userIds: ["leo", "theo", "kai"] }] },
    ]),
    "ch-now-watching": thread("ch-now-watching", [
      { authorId: "bea", at: at(2, 21, 4), text: "Rewatching Arrival for the third time. The sound design still gets me every time." },
      { authorId: "theo", at: at(2, 21, 30), text: "Seeing the heptapod scenes in a proper cinema was something else" },
      { authorId: "priya", at: at(1, 22, 15), text: "Next pick is mine and I'm choosing something under 100 minutes. You've all been warned." },
    ]),
    "ch-showcase": thread("ch-showcase", [
      { authorId: "marcus", at: at(5, 17, 0), text: "Our demo is finally on itch. Two years, one cat-based puzzle game. Feedback welcome, bugs expected." },
    ]),
    "ch-tracks": thread("ch-tracks", [
      { authorId: "ada", at: at(3, 23, 40), text: "Finished the one with the arpeggiator that sounds like rain. Uploading tomorrow when it isn't 2am." },
    ]),
  };
}

export const SEED_UNREAD: Record<string, number> = {
  "dm-nova": 1,
  "g-ramen": 2,
  "ch-design-review": 3,
  "ch-announcements": 1,
  "ch-general": 2,
  "ch-now-watching": 1,
};

export const SEED_MENTIONS: Record<string, boolean> = {
  "g-ramen": true,
  "ch-general": true,
};

export const SEED_FRIENDS = ["nova", "theo", "priya", "kai", "iris", "jonah", "mila", "bea", "ada", "leo"];
export const SEED_INCOMING = ["marcus"];
export const SEED_OUTGOING = ["ren"];
export const SEED_BLOCKED = ["dex"];
export const SEED_SPACES = ["demo", "film", "indie", "synth"];
export const SEED_RECENT = ["dm-nova", "g-ramen", "dm-kai", "dm-iris", "dm-priya", "dm-jonah"];

/** A small emoji set for reactions and the composer. Content, not interface icons. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏", "👀"];
export const EMOJI: { e: string; k: string }[] = [
  { e: "👍", k: "thumbs up yes" }, { e: "❤️", k: "heart love" }, { e: "😂", k: "laugh joy" }, { e: "🎉", k: "party tada" },
  { e: "🙏", k: "thanks please" }, { e: "👀", k: "eyes look" }, { e: "🔥", k: "fire" }, { e: "✅", k: "check done" },
  { e: "🚀", k: "rocket ship" }, { e: "😅", k: "sweat" }, { e: "🙂", k: "smile" }, { e: "😊", k: "blush happy" },
  { e: "😮", k: "wow surprised" }, { e: "😢", k: "sad cry" }, { e: "🤔", k: "thinking" }, { e: "👏", k: "clap" },
  { e: "💯", k: "hundred" }, { e: "✨", k: "sparkles" }, { e: "🍜", k: "ramen noodles" }, { e: "☕", k: "coffee" },
  { e: "🎬", k: "film movie" }, { e: "🎧", k: "headphones music" }, { e: "🐛", k: "bug" }, { e: "📌", k: "pin" },
];
