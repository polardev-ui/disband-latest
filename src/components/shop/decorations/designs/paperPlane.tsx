import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { FLIGHT_PATH, FLIGHT_START } from "./paperPlane.flight";
import "./paperPlane.flight.css";
import "./paperPlane.css";

/*
 Paper Plane: a folded paper dart flying laps of the photo, with a loop-the-
 loop over the top of the head, leaving a dotted pencil trail that fades.

 The lap is a rounded square (straight runs, turns at the corners) and the
 plane banks into each corner: its wings narrow as it rolls and the lower
 wing falls into shadow, then it levels out on the straight. The loop is a
 pitch, not a turn, so it goes round flat. Path, heading and bank are
 sampled by distance along the lap by scripts/shop/paper-plane-flight.mjs,
 which writes paperPlane.flight.*; the plane therefore moves at an even
 speed, and the trail, a dash of the same path moving linearly with time,
 stays exactly under it.

 The trail is a dotted line seen through a mask of five dash windows of
 increasing length that all end at the plane, so it is strongest just
 behind the plane and thins out in steps to nothing.

 Hover deepens the trail.
*/

/** Seconds per lap. */
const LAP = 10;
/** Trail windows, as shares of the lap (pathLength 100). */
const WINDOWS = [4, 8, 12.5, 17.5, 23];

function Plane() {
  // Drawn from above, nose along +x, centred on the fold.
  return (
    <g transform="scale(1.25) translate(-1 0)">
      <path d="M8.6 1.6L-7 7.4L-5.4 2.2L-7.6 1.6Z" fill="#000000" opacity=".16" transform="translate(1.4 2.2)" />
      {/* Port wing (lit), starboard wing, then the keel down the middle. */}
      <path d="M8.6 0L-7.6 -6.4L-5.4 -.7Z" fill="#f7f2e7" stroke="#9c9282" strokeWidth=".35" strokeLinejoin="round" />
      <path d="M8.6 0L-7.6 6.4L-5.4 .7Z" fill="#e3dbcc" stroke="#9c9282" strokeWidth=".35" strokeLinejoin="round" />
      <path className="ppl-shade di" d="M8.6 0L-7.6 6.4L-5.4 .7Z" fill="#6f665a" style={{ animationDelay: `calc(${-FLIGHT_START * LAP}s * var(--deco-slow, 1))` } as CSSProperties} />
      <path d="M8.6 0L-5.4 -.7L-7.4 0L-5.4 .7Z" fill="#bdb3a1" stroke="#9c9282" strokeWidth=".3" strokeLinejoin="round" />
      {/* Creases: where each wing was folded, and the centre fold. */}
      <path d="M6.6 -.5L-6.9 -4.8" stroke="#cbc1af" strokeWidth=".35" opacity=".9" />
      <path d="M6.6 .5L-6.9 4.8" stroke="#bfb5a3" strokeWidth=".35" opacity=".9" />
      <path d="M8.4 0L-7.2 0" stroke="#8f8574" strokeWidth=".3" />
      <path d="M7.4 -.4L-3.2 -3.6" stroke="#ffffff" strokeWidth=".4" strokeLinecap="round" opacity=".75" />
    </g>
  );
}

function Front({ uid }: DecorationLayerProps) {
  const delay = `calc(${-FLIGHT_START * LAP}s * var(--deco-slow, 1))`;
  return (
    <>
      <defs>
        <mask id={`${uid}-trail`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          {WINDOWS.map((w) => (
            <path
              key={w}
              className="ppl-window di"
              d={FLIGHT_PATH}
              pathLength={100}
              fill="none"
              stroke="#ffffff"
              strokeOpacity=".3"
              strokeWidth="4"
              style={{ "--w": `${w}px`, strokeDasharray: `${w} ${100 - w}`, animationDelay: delay } as CSSProperties}
            />
          ))}
        </mask>
      </defs>
      <path className="ppl-trail" d={FLIGHT_PATH} mask={`url(#${uid}-trail)`} fill="none" stroke="#b6c4e2" strokeWidth="1.1" strokeLinecap="round" strokeDasharray=".1 2.6" />
      <g className="ppl-fly di" style={{ animationDelay: delay } as CSSProperties}>
        <Plane />
      </g>
    </>
  );
}

export const paperPlane: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
