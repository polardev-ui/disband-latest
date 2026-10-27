// Cue sheet for "The Way It Used to Feel." — the morphing classic-UI spot.
// Seconds; picture and sound both read it. 30 fps, 120 BPM (beat = 0.5 s).
export const FPS = 30;
export const DURATION = 35.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const COPY = {
  title: "THE WAY IT|USED TO FEEL.",
  home: "A NEW HOME FOR|YOUR COMMUNITY.",
  familiar: "FAMILIAR|BY DESIGN.",
  next: "BUILT FOR|WHAT’S NEXT.",
  name: "DISBAND",
  slogan: "Privacy first, privacy always.",
  cta: "FIND YOUR COMMUNITY.",
  url: "disband.dev",
};

export const T = {
  // 1 — point → outline → it splits → the window assembles; push in
  point: 0.2,
  outline: 0.4,
  traced: 1.0,
  split: 1.6,
  assemble: 2.0,
  snap: 2.6,             // the impact
  title: 2.62,
  titleOut: 3.75,

  // 2 — rail → strip → turns over → channel rows → column; down the list; through
  railClose: 4.8,         // the camera arrives on the rail
  stretch: 5.0,          // the metallic glide
  strip: 5.7,
  turn: 6.2,
  edge: 6.7,             // the strip is edge-on: rail items become channel rows
  turned: 7.2,
  fold: 7.2,
  folded: 8.0,           // rows home in the column; the window is whole again
  travel: 8.0,
  cross: 9.0,
  boundary: 9.4,         // the camera crosses the column edge
  chat: 10.0,

  // 3 — the window in bands: fan out, flip, close up as the DM view
  bands: 11.0,
  fanned: 12.0,
  flip: 12.2,
  flipped: 13.6,
  close: 13.6,
  closed: 14.6,          // the reassembly impact
  home: 12.4,
  homeOut: 16.6,

  // 4 — the DM view breaks into regions that flip to the main view and converge
  explode: 17.0,
  converge: 17.9,
  whole: 18.6,           // the whole app, one impact
  familiar: 19.2,
  familiarOut: 21.0,
  accent: 21.4,
  next: 21.6,
  nextOut: 23.8,

  // 5 — fold inward to a block; it turns once and becomes the mark
  foldIn: 24.0,
  fold2: 24.7,           // the folded app folds in half again
  block: 25.4,
  spin: 25.4,
  markEdge: 25.95,       // the block's edge: the mark takes over
  mark: 26.6,            // the strongest moment
  highlight: 26.8,
  name: 27.1,
  slogan: 27.8,

  // 6 — the mark, the app behind it, the line and the address
  settle: 30.0,
  cta: 31.0,
  url: 31.6,
  endHold: 32.1,         // disband.dev settled; static to the end (2.9 s)
};
