// Cue sheet for the Android beta announcement (seconds). Picture and sound both
// read it; tools/timeline-json.mjs exports it for the soundtrack.
export const FPS = 60;
export const DURATION = 40.0;
export const BPM = 120;

export const T = {
  // 1 — logo on black, click, five inversions, zoom-through
  logoRise: 0.5,
  logoLand: 1.5,
  inversions: [1.75, 2.0, 2.25, 2.5, 2.75],
  zoomStart: 3.25,
  zoomEnd: 3.9,

  // 2 — "Disband is coming to Android."
  comingIn: 4.0,
  comingOut: 6.6,

  // 3 — one Android phone: emerge, orbit, push in, settle left
  shotIntro: 7.2,
  introSwitch1: 9.4,   // inbox → server
  introSwitch2: 11.0,  // server → friends
  shotIntroEnd: 13.6,

  // 4 — a second phone joins, then the line
  shotPair: 13.6,
  shotPairEnd: 17.3,
  connectIn: 17.35,
  connectOut: 19.9,

  // 5 — the announcement
  betaIn: 20.5,
  earlyIn: 22.0,
  betaOut: 25.2,

  // 6 — phone left, sign-up copy and URL right
  shotCta: 25.9,
  ctaHead: 26.4,
  ctaSub: 27.2,
  ctaUrl: 28.2,
  ctaArrow: 28.9,
  ctaOut: 31.25,
  shotCtaEnd: 31.7,

  // 7 — brand reveal
  endLogo: 31.85,
  endLogoLand: 32.5,
  endTitle: 32.85,
  endSlogan: 33.8,
  endNote: 34.8,
  endUrl: 35.8,
};
