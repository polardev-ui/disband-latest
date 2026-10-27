// Cue sheet for the 9:16 TikTok spot "A Familiar Feeling. A New Home."
// (classic Disband UI). Seconds; picture and sound both read it.
// 30 fps, 120 BPM: a beat is 0.5 s = 15 frames; montage cuts land on beats.
export const FPS = 30;
export const DURATION = 38.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// "|" breaks a line. No affiliation, security or statistics claims.
export const COPY = {
  headline: "Remember when|online communities|felt simple?",
  meet: "Meet Disband.",
  home: "A new home for|your communities.",
  familiar: "Familiar by design.",
  built: "Built for your|next community.",
  title: "DISBAND",
  slogan: "Privacy first, privacy always.",
  cta: "Your community starts here.",
  url: "disband.dev",
};

export const T = {
  // 1 — a white shape catches a line of light and becomes the mark; panels of
  //     the real UI emerge; the camera flies through them
  shapeIn: 0.15,
  match: 1.0,
  lock: 1.25,            // the click and the first low impact
  logoAway: 1.6,
  panelsIn: 1.3,
  headline: [1.5, 1.75, 2.0, 2.25, 2.5, 2.75],   // Remember · when · online · communities · felt · simple?
  headlineOut: 3.55,
  fly: 2.4,

  // 2 — the real app in a floating window; three-quarter to frontal; push in
  window: 4.0,           // the lift
  meet: 5.0,
  meetOut: 7.1,
  home: 7.5,
  homeOut: 9.6,
  frontal: 6.6,

  // 3 — six shots of the real UI, cut on beats
  shotA: 10.0,           // the server rail, a space hovered
  shotB: 11.5,           // the channel list, a channel hovered
  shotC: 13.0,           // typing in the composer
  typing: [13.15, 13.4, 13.65, 13.9, 14.2],
  shotD: 14.75,          // the member list, a profile card opens
  profile: 15.3,
  shotE: 16.25,          // a direct message with the profile rail
  shotF: 17.75,          // the whole app
  montageEnd: 19.0,

  // 4 — slower: the familiar feeling
  familiar: 20.0,
  familiarOut: 22.6,
  built: 23.0,
  builtOut: 25.7,

  // 5 — the app folds into one panel, turns, becomes the mark; white
  pullBack: 26.0,
  compress: 26.8,
  spin: 27.6,
  edge: 28.25,           // edge-on: the mark takes over
  white: 28.0,
  climax: 28.5,
  title: 29.2,
  slogan: 29.9,

  // 6 — end card
  endMove: 33.0,
  thumb: 33.4,
  cta: 34.0,
  url: 34.6,
  endHold: 35.1,         // disband.dev settled; static to the end (2.9 s)
};

// Regions of the 1440×900 app captures (CSS px) the camera frames.
export const REGION = {
  window: { w: 1440, h: 900 },
  railColumn: { x: 0, y: 0, w: 312, h: 900 },
  chat: { x: 312, y: 0, w: 888, h: 900 },
  composer: { x: 312, y: 600, w: 888, h: 300 },
  members: { x: 840, y: 0, w: 600, h: 640 },
  dm: { x: 700, y: 0, w: 740, h: 700 },
};
