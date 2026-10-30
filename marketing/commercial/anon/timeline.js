// Cue sheet for the 9:16 Anonymous Accounts launch spot (seconds). Picture and
// sound both read it; tools/timeline-json.mjs exports it for the soundtrack.
// 30 fps per the brief; 120 BPM, so every beat (0.5 s) is a whole 15 frames.
export const FPS = 30;
export const DURATION = 20.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// Every on-screen line, verified against the shipped feature
// (src/lib/anon-accounts*.ts, src/app/api/auth/anon/*, AnonymousAuthPanel.tsx).
// "|" breaks a caption line; *word* is highlighted in brand violet, _word_ in
// the burn red.
export const COPY = {
  hook: "Want to *vanish*|from the internet?",
  number: "One number.|No password.",
  email: "A random email.|Never yours.",
  chips: "Nothing personal|to sign up.",
  tiers: "Choose how|long it lasts.",
  split: "Talk freely.|Create nothing that|leaves a trail.",
  burn: "POOF.|_Gone._",
  vault: "Optional download|for 30 days.",
  app: "Built into|Disband.",
};

// Obviously fake demo values (the brief's dummy number; a made-up address in
// the same shape the server generates: 20 lowercase letters/digits).
export const DEMO = {
  number: "9287364190255734",
  email: "q7zk9xy4rtm3pa2vn8wc@disband.dev",
  handle: "anon_7f3a9c51e2d4",
};

export const T = {
  // 1 — hook: a ghost dissolves, sixteen reels spin
  hookOut: 1.5,
  ghostFade: [0.15, 0.85],
  reels: 0.55,

  // 2 — the number card descends; digits type in; NEW flashes
  number: 1.5,
  numberCut: 2.25,
  typeStart: 1.85,
  typeStep: 0.055,
  newPill: 2.5,

  // 3 — the card turns over: the email field scrambles to a random address
  email: 3.0,
  flip: 3.0,
  emailCut: 4.0,
  scramble: 4.1,
  resolve: 4.6,

  // 4 — three privacy chips stack, a scanner passes, each goes green
  chips: 5.0,
  chipsCut: 6.25,
  scan: 5.75,
  checks: [6.0, 6.25, 6.5],
  walker: 6.1,
  walkerGone: 7.1,

  // 5 — five duration tiles fly in and flip; one is chosen (the beat lands)
  tiers: 7.5,
  tilesFlip: 7.75,
  tiersCut: 8.75,
  select: 9.0,

  // 6 — split: what anonymous accounts can and can't do
  split: 10.0,
  splitCut: 11.25,
  lock: 11.5,

  // 7 — the burn: countdown, embers, ash, presence off
  burn: 12.5,
  countdownEnd: 12.95,
  burnCut: 13.25,
  ignite: 13.0,
  poof: 13.25,
  ashed: 14.2,

  // 8 — the download window: the vault opens on a JSON copy, 30-day ring
  vault: 14.5,
  doors: 14.75,

  // 9 — in the app: an Anonymous member in #general
  app: 15.75,
  ripple: 16.25,

  // 10 — end card: the mark, the name, the button with NEW
  end: 17.0,
  wordmark: 17.35,
  tagline: 17.55,
  pill: 17.7,
  newBadge: 18.0,
  endHold: 18.1,      // everything readable from here
  pulses: [18.5, 19.0],
  loopFade: 19.7,     // the last 0.3 s ease the foreground back to the void
};

// Shot list (hard cuts unless noted): [start, name].
export const SHOTS = [
  [0.0, "hook"], [T.number, "number-a"], [T.numberCut, "number-b"],
  [T.email, "email-a"], [T.emailCut, "email-b"], [T.chips, "chips-a"], [T.chipsCut, "chips-b"],
  [T.tiers, "tiers-a"], [T.tiersCut, "tiers-b"], [T.split, "split-a"], [T.splitCut, "split-b"],
  [T.burn, "burn-a"], [T.burnCut, "burn-b"], [T.vault, "vault"], [T.app, "app"], [T.end, "end"],
];
// Wipes (burn beat only): [time, duration].
export const WIPES = [[T.burn, 0.3], [T.vault, 0.3]];
