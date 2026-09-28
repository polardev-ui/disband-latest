// Single source of truth for timing. The picture (stage.js, shots.js) and the
// soundtrack (tools/audio.py, via build/timeline.json) both read these, so a
// retime moves every synced sound with it. Seconds from the first frame.

export const FPS = 60;
export const DURATION = 40.0;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const BPM = 120;

export const T = {
  // Scene 1 — logo on black, click, five inversions, zoom-through.
  logoRise: 0.5,
  logoLand: 1.5,
  inversions: [1.75, 2.0, 2.25, 2.5, 2.75],
  zoomStart: 3.25,
  zoomEnd: 3.9,

  // Scene 2 — "A new gateway to privacy"
  privacyIn: 4.0,
  privacyOut: 6.55,

  // Scene 3 — 0 → 10,000
  zeroIn: 7.25,
  countStart: 7.5,
  countEnd: 8.5,
  numberRise: 9.0,
  usersIn: 9.1,
  usersOut: 12.25,

  // Scene 4 — iOS product shots, then "Available all around the globe"
  shotHero: 12.4,
  heroSwitch: 13.85,
  shotTrio: 14.7,
  shotMacro: 16.75,
  sheetUp: 17.2,
  shotMacroEnd: 18.4,
  globeIn: 18.5,
  globeIcon: 19.2,
  globeOut: 20.45,

  // Scene 5 — desktop, laptop, cross-device sync, then the sync line
  shotMonitor: 20.55,
  settingsOpen: 21.75,
  shotLaptop: 22.75,
  shotSync: 24.25,
  typeStart: 24.4,
  send: 25.25,
  arrive: 26.05,
  shotSyncEnd: 26.6,
  syncIn: 26.7,
  syncOut: 28.2,

  // Scene 6 — brand reveal
  endLogo: 28.65,
  endLogoLand: 29.5,
  endTitle: 29.85,
  endSlogan: 30.85,
  endUrl: 32.2,
  endCta: 33.4,
  endLegal: 34.4,
};
