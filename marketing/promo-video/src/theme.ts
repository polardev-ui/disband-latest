/**
 * One place for the look of the commercial.
 *
 * Scene one is white-on-black; every scene after it is black-on-white, per the
 * brief. Sizes are given for a 1080-wide frame and scale with it.
 */
export const THEME = {
  ink: "#0A0A0A",
  paper: "#FFFFFF",
  muted: "#6B6B6B",
  hairline: "#E4E4E4",
  /** Disband's brand violet, taken from the app's --brand token. */
  brand: "#5865F2",
} as const;

/** Type scale for 1080px width. Headline sits well above the 84px floor. */
export const TYPE = {
  headline: 96,
  headlineTight: 84,
  counter: 190,
  body: 46,
  caption: 34,
  legal: 19,
} as const;

/** Keep content inside this margin; 80px sides, 100px top/bottom at 1080w. */
export const SAFE = { x: 96, y: 150 } as const;
