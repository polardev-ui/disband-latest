// Cue sheet for the 9:16 social spot "A New Way to Connect." (seconds).
// Picture and sound both read it; tools/timeline-json.mjs exports it for the
// soundtrack. 120 BPM: a beat is 0.5 s, a 16th 0.125 s.
export const FPS = 60;
export const DURATION = 20.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const T = {
  // 1 — a black kite-shaped prism flies in, turns, and cuts to the mark
  shapeIn: 0.0,
  match: 0.6,
  logoUp: 0.68,
  logoSet: 1.0,
  words1: [0.875, 1.0, 1.125, 1.25, 1.375],   // Meet · your · next · social · platform.
  line1Out: 2.05,

  // 2 — phone from the left, the Messages panel from the right; they meet,
  //     the screen comes apart in layers, swaps panels, and closes up
  shotConverge: 2.0,
  enter: 2.15,        // phone and panel start in, clear of the first line
  arrive: 2.75,
  panelLand: 3.5,
  lifted: 4.0,
  swapOut: 4.25,
  swapIn: 4.5,
  swapLand: 4.75,
  collapse: 5.0,
  collapsed: 5.5,
  edgeOn: 6.0,
  iris: 6.5,          // a black disc grows out of the edge-on phone
  irisFull: 6.75,     // frame black for an instant; the next shot opens out of it
  irisOpen: 7.1,
  shotConvergeEnd: 6.75,

  // 3 — the phone at a new angle on the floor; a second one joins
  shotPair: 6.75,
  pairJoin: 7.5,
  words2: [7.25, 7.5, 7.75, 8.0],          // Connect · on · your · terms.
  glimpse1: 8.25,
  glimpse2: 8.75,
  line2Out: 9.25,
  pushIn: 9.5,
  shotPairEnd: 10.0,

  // 4 — the lift: dimensional type and turning phones
  drop: 10.0,
  shotType: 10.0,
  simple: 10.5,
  simpleOut: 11.25,
  social: 11.5,
  socialOut: 12.25,
  phonesAway: 12.2,
  shotTypeEnd: 12.8,
  disband: 12.5,
  resolve: 13.25,
  logoResolve: 13.5,

  // 5 — calm: everything settles into the end card
  calm: 15.0,
  endSet: 15.8,
  slogan: 15.5,
  endLine: 16.25,
  endUrl: 16.5,
  endHold: 17.0,   // URL settled; static to the end (3 s)
};
