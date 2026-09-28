// Demo content for the UI recreations. Only the App Review demo personas and
// spaces appear on screen — no real members' names, photos or messages, and no
// third-party branding. Colours mirror the initials avatars those demo
// accounts show in the app.

export const ME = { name: "Riley Park", handle: "riley", initials: "R", color: "linear-gradient(135deg,#7b86ff,#5865f2 55%,#3d44c9)" };

export const PEOPLE = {
  iris: { name: "Iris Bennet", initials: "I", color: "#ed4245", status: "online" },
  theo: { name: "Theo Marsh", initials: "T", color: "#5865f2", status: "offline" },
  sam: { name: "Sam Whitfield", initials: "S", color: "#5865f2", status: "idle" },
  nova: { name: "Nova Reyes", initials: "N", color: "#e67e22", status: "online" },
  mila: { name: "Mila Oduya", initials: "M", color: "#ed4245", status: "online" },
  kai: { name: "Kai Tanaka", initials: "K", color: "#3ba55d", status: "offline" },
  disband: { name: "Disband", logo: true, status: "online" },
};

// Rail order matches the app: inbox, then joined spaces, then add / discover.
export const SPACES = [
  { id: "hq", name: "Disband Demo HQ", initials: "DD", color: "#ed4245" },
  { id: "official", name: "Disband", logo: true, verified: true },
  { id: "lab", name: "Design Lab", initials: "DL", color: "#f5a623" },
  { id: "emoji", name: "Aero Club", emoji: ["1f451", "2728", "1f41e"] },
  { id: "photo", name: "Photo Walk", emoji1: "1f4f7", color: "#1f6feb" },
  { id: "music", name: "Lo-fi Lounge", emoji1: "1f3a7", color: "#8e44ad" },
  { id: "art", name: "Sketchbook", emoji1: "1f3a8", color: "#16a085" },
  { id: "night", name: "Night Shift", initials: "NS", color: "#2d3436" },
  { id: "launch", name: "Launch Pad", emoji1: "1f680", color: "#c0392b" },
];

export const INBOX = [
  { who: "nova", preview: "Cool — free tomorrow afternoon?", time: "9:41", unread: 2 },
  { who: "mila", preview: "Community call is Friday, 4pm", time: "2h" },
  { who: "disband", preview: "emoji:1f44b", time: "Yesterday" },
  { who: "iris", preview: "Photo", time: "Wed" },
  { who: "sam", preview: "Photo", time: "Tue" },
  { who: "theo", preview: "These are great. The second one especially.", time: "Sep 18" },
  { who: "kai", preview: "p95 is down to 84ms after the batching change", time: "Sep 14" },
  { group: true, name: "Weekend Crew", initials: "WC", color: "#eb459e", preview: "4 members", time: "" },
];

export const RANDOM_CHANNEL = [
  { who: "iris", time: "Aug 1, 2026", text: "Sketch dump from the weekend, ignore the rough edges.", reaction: { emoji: "1f60d", count: 2, mine: true } },
  { who: "theo", time: "Aug 1, 2026", text: "These are great. The second one especially." },
  { who: "sam", time: "Aug 6, 2026", text: "Coffee count today: four. Send help." },
  { who: "me", time: "Aug 6, 2026", text: "Four is a lifestyle, not a problem." },
  { who: "mila", time: "Today at 9:12 AM", text: "Community call is Friday, 4pm — agenda's pinned." },
  { who: "kai", time: "Today at 9:30 AM", text: "I'll bring the roadmap slides.", reaction: { emoji: "1f525", count: 3 } },
];

export const NOVA_DM = [
  { who: "nova", time: "Today at 9:02 AM", text: "Are we still on for the community call Friday?" },
  { who: "me", time: "Today at 9:05 AM", text: "Yep — 4pm. I'll send the agenda tonight." },
  { who: "nova", time: "Today at 9:40 AM", text: "Cool — free tomorrow afternoon?" },
];

// The message typed on the phone during the cross-device sync shot.
export const SYNC_MESSAGE = { who: "me", time: "Today at 9:41 AM", text: "Perfect. See you tomorrow at 2 👋" };
