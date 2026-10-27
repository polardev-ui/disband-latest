// Cue sheet for "The Internet, Reconnected." Seconds; picture and sound both
// read it. 30 fps, 100 BPM (a beat is 0.6 s).
export const FPS = 30;
export const DURATION = 38.0;
export const BPM = 100;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// "|" breaks a line. No affiliation, security or statistics claims.
export const COPY = {
  head1: "THE INTERNET,",
  head2: "RECONNECTED.",
  familiar: "A FAMILIAR FEELING.",
  home: "A NEW HOME.",
  name: "DISBAND",
  slogan: "Privacy first, privacy always.",
  cta: "FIND YOUR COMMUNITY.",
  url: "disband.dev",
};

export const T = {
  // 1 — a signal: one token, a line of light; the rest unstack behind it and
  //     spiral down around the rail's axis, linked; the helix closes into the
  //     rail and the links become the layout's lines
  glint: 0.5,
  unstack: 1.1,
  spiral: 1.3,
  organize: 2.7,
  lock: 3.7,             // the rail and the grid lock: first accent
  head: 3.25,
  headOut: 5.05,

  // 2 — into the structure: rails run back from every row's slot into the
  //     dark; the rows, messages and members wait along them in depth and fly
  //     forward into place; panels sweep out behind them; the real app,
  //     assembled and readable
  enter: 4.9,
  rails: 5.0,
  railPanel: 5.3,
  column: 7.4,           // the column's panel sweeps in behind its landed rows
  rows: 5.9,
  strata: 6.7,           // the message bands fly in, one by one
  members: 7.6,
  chrome: 8.3,           // chat header and composer
  membersPanel: 9.1,
  chatPanel: 9.4,
  assembled: 10.6,       // everything home; the readable app
  // 3 — the community in motion
  track: 12.0,
  pop: 12.4,             // rail icons leave the rail one by one
  dd: 13.1,              // the active space's icon flies to its channel list
  louver: 14.2,          // channel rows lift; their lines run out across the space
  louverClose: 15.6,
  ripple: 15.9,
  type: 16.8,            // typing in the real composer
  typed: 19.8,

  // 4 — familiar, transformed: the exploded app aligns as the camera pulls back
  explode: 19.9,
  pull: 20.3,
  whole: 23.4,
  familiar: 22.3,
  swap: 24.5,            // A FAMILIAR FEELING. → A NEW HOME.
  homeOut: 26.9,

  // 5 — everything becomes Disband
  converge: 27.0,
  contour: 29.8,         // the lines are the mark's outline
  fill: 30.0,
  formed: 30.8,          // the mark is whole: the resolution
  highlight: 31.0,
  name: 31.3,
  slogan: 32.1,

  // 6 — the invitation
  settle: 33.8,
  cta: 34.5,
  url: 35.0,
  endHold: 35.7,         // static from here to the end (2.3 s)
};
