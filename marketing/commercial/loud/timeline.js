// Cue sheet for the 9:16 social spot "The internet is loud. Disband isn't."
// (seconds). Picture and sound both read it; tools/timeline-json.mjs exports it
// for the soundtrack. 120 BPM: a beat is 0.5 s.
export const FPS = 60;
export const DURATION = 20.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const T = {
  // 1 — the noise: interface fragments rush past the camera in the dark
  rushStart: 0.45,                                 // black until here, then the rush
  headline: 1.0,                                   // "The internet is loud." + impact
  impacts: [0.5, 1.0, 1.5, 2.0, 2.25, 2.5, 2.625, 2.75, 2.875],
  freeze: 3.0,                                     // everything stops dead

  // 2 — stillness: the fragments drift away, one phone, a line of light
  headlineOut: 3.15,
  drift: 3.35,
  driftEnd: 5.0,
  phoneIn: 3.3,
  sweep: 3.9,
  sweepEnd: 5.2,
  screenOn: 4.3,
  line2: 4.75,                                     // "Your space doesn't have to be."
  line2Out: 5.8,

  // 3 — the product: turn, layers apart and home, glimpses, "Meet Disband."
  turn: 6.0,
  explode: 7.0,                                    // layers lift on 8ths from here
  assemble: 8.5,
  assembleClicks: [8.875, 9.0, 9.125, 9.25],
  glimpse1: 9.5,                                   // Disband Demo HQ
  glimpse2: 10.25,                                 // #random
  glimpse3: 11.0,                                  // You
  meet: 10.5,
  meetOut: 11.6,

  // 4 — the phone recedes, the world turns white, its silhouette becomes the mark
  recede: 12.0,
  white: 12.5,
  silhouette: 13.2,                                // cut to the flat silhouette
  morphEnd: 13.75,
  logoSet: 14.0,
  slogan: 14.25,
  sloganOut: 16.0,
  shotEnd: 13.2,

  // 5 — call to action
  endMove: 16.0,
  endTitle: 16.4,
  endLine: 16.8,
  endUrl: 17.2,
  endHold: 17.6,   // URL settled; static to the end (2.4 s)
};
