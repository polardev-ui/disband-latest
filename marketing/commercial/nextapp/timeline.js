// Cue sheet for the 9:16 social spot "Not another boring app." (seconds).
// Picture and sound both read it; tools/timeline-json.mjs exports it for the
// soundtrack. 120 BPM: a beat is 0.5 s; the cuts in scene 3 sit on beats.
export const FPS = 60;
export const DURATION = 20.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const T = {
  // 1 — white; a black phone spins in from the right and lands dead centre
  phoneIn: 0.3,
  land: 0.9,                 // the hit; "YOUR NEXT APP?" lands with it
  beat: 1.0,                 // the main beat starts
  line1Out: 2.0,

  // 2 — the screen leaves the phone, more panels slide out, the camera flies through
  face: 2.0,
  lift: 2.5,
  spread: 3.0,               // panels slide out from behind on 8ths
  meet: 3.5,                 // "MEET DISBAND." on the strong beat
  meetOut: 4.5,
  flyInto: 4.5,              // into the dark of the last panel...
  shotHeroEnd: 5.0,          // ...cut on black to the back of a phone

  // 3 — rapid product shots, cut on the beat
  shotA: 5.0,                // phone turns from its back to its screen
  aLand: 5.75,
  shotB: 6.0,                // the Messages panel comes out toward the camera
  bOut: 6.25,
  bBack: 6.75,
  shotC: 7.0,                // the screen pushes to Disband Demo HQ
  cPush: 7.25,
  shotD: 7.75,               // two phones at different depths pass each other
  shotE: 8.75,               // three phones snap into a row
  eAlign: 9.25,
  shotF: 9.5,                // the camera flies over the row to the mark
  shotFEnd: 10.0,

  // 4 — black; three words
  your: 10.25,
  yourOut: 11.0,
  people: 11.25,
  peopleOut: 12.0,
  disband: 12.25,
  flip: 12.85,               // DISBAND. turns edge-on...
  flipMid: 13.0,             // ...and comes round as the mark
  climax: 13.25,

  // 5 — white; the mark, a phone beside it, the lines, the address
  white: 14.0,
  whiteEnd: 14.5,
  settle: 14.6,
  lock: 15.4,                // the mark locks into place beside the phone
  slogan: 15.25,
  explore: 15.9,
  url: 16.5,
  endHold: 17.0,             // URL settled; static to the end (3 s)
  shotFinal: 14.5,
};
