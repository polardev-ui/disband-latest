// Cue sheet for the 9:16 social spot "Your Space. Your Privacy." (seconds).
// Picture and sound both read it; tools/timeline-json.mjs exports it for the
// soundtrack. 120 BPM, so a beat is 0.5 s and every reveal sits on the grid.
export const FPS = 60;
export const DURATION = 20.0;
export const BPM = 120;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const T = {
  // 1 — black; a beam of light finds the mark; it comes forward and locks
  beamStart: 0.2,
  beamEnd: 1.3,
  logoForward: 0.65,
  logoLock: 1.5,
  logoOut: 2.0,
  logoGone: 2.55,

  // 2 — a phone out of the dark, rim-lit, the camera orbiting; the first line
  shotDark: 2.0,
  phoneEmerged: 3.6,
  words1: [2.75, 3.0, 3.25, 3.75, 4.0],   // Your · digital · life · is · yours.
  screenSwitch: 4.5,                      // Disband Demo HQ → Messages
  line1Out: 5.5,

  // 3 — the phone comes apart into its layers and goes back together
  turn: 6.0,
  explode: 6.5,
  exploded: 7.75,
  assemble: 8.25,
  assembleClicks: [8.875, 9.0, 9.125, 9.25],  // dock, panel, rail, glass land
  flashPeak: 9.5,                         // white light floods the frame
  shotDarkEnd: 9.5,
  shotLight: 9.5,
  words2: [10.0, 10.25],                  // Meet · Disband.
  line2Out: 11.0,

  // 4 — the phone glides to centre, the mark rises behind it, the camera pushes
  glide: 11.0,
  logo3dIn: 11.25,
  words3: [12.5, 12.75, 13.25, 13.5],     // Privacy · first, · privacy · always.
  screenSwitch2: 12.0,                    // Messages → #random
  line3Out: 15.25,
  phoneOut: 15.6,
  shotLightEnd: 16.2,

  // 5 — the brand composition
  endLogo: 15.95,
  endLogoLand: 16.5,
  endTitle: 16.75,
  endLine: 17.0,
  endUrl: 17.25,
  endHold: 17.75,   // URL settled; static to the end (2.25 s)
};
