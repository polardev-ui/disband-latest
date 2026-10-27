"use client";

import { useEffect, useRef } from "react";
import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 'Round The World: a little race track hugging the photo and a car doing
 laps of it. The car is drawn at twelve o'clock with its wheels on the
 track, and the whole car group turns about the centre, so it stays tangent
 to the road all the way round. Wheels spin, the body rides its springs and
 the exhaust puffs.

 On hover it puts its foot down: every animation in the car speeds up
 together, eased in and back out with updatePlaybackRate (no jump in
 position), the headlights come on and speed lines trail behind.
*/

const TRACK_R = 54;
const BOOST = 3.4;
const RAMP_MS = 650;

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-paint`} x1="0" y1="-17" x2="0" y2="-3" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ff7b6b" />
        <stop offset=".5" stopColor="#e3262f" />
        <stop offset="1" stopColor="#9f111b" />
      </linearGradient>
      <linearGradient id={`${uid}-glass`} x1="0" y1="-16" x2="0" y2="-11" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#d9f1ff" />
        <stop offset="1" stopColor="#6aa8d6" />
      </linearGradient>
      <radialGradient id={`${uid}-rim`} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#f4f6f9" />
        <stop offset="1" stopColor="#8d96a3" />
      </radialGradient>
      <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff6c2" stopOpacity=".85" />
        <stop offset="1" stopColor="#fff6c2" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

function Wheel({ x, uid }: { x: number; uid: string }) {
  return (
    <g transform={`translate(${x} -4.1)`}>
      <circle r="4.2" fill="#16171b" />
      <circle r="4.2" fill="none" stroke="#2c2e34" strokeWidth=".6" />
      <g className="rtw-wheel">
        <circle r="2.4" fill={`url(#${uid}-rim)`} />
        <path d="M0 -2.2V2.2M-2.2 0H2.2M-1.5 -1.5L1.5 1.5M-1.5 1.5L1.5 -1.5" stroke="#5d6672" strokeWidth=".45" />
        <circle r=".7" fill="#3f4650" />
      </g>
    </g>
  );
}

/** The car, wheels on y = 0, nose pointing right (clockwise at the top). */
function Car({ uid }: { uid: string }) {
  return (
    <g>
      <ellipse cx="0" cy=".5" rx="15.5" ry="1.7" fill="#000" opacity=".4" />
      <g className="rtw-trail">
        <path d="M-19 -7.5H-30M-18 -11H-26M-19 -4.5H-27" stroke="#ffffff" strokeWidth=".9" strokeLinecap="round" opacity=".75" />
      </g>
      <g className="rtw-puffs" fill="#d7dae0">
        <circle className="rtw-puff rtw-puff-0" cx="-17.5" cy="-4.4" r="1.6" />
        <circle className="rtw-puff rtw-puff-1" cx="-17.5" cy="-4.4" r="1.3" />
      </g>
      <path className="rtw-flame" d="M-16.6 -4.4L-21.5 -3.4L-16.6 -2.6Z" fill="#ffb347" />
      <g className="rtw-body">
        <path d="M14 -9L36 -14V-1L14 -6Z" className="rtw-beam" fill={`url(#${uid}-beam)`} />
        <path d="M-9.5 -10.6C-8 -16.5 -5.5 -17.2 -1 -17.2H3C6.5 -17.2 8.5 -15.5 11 -10.6Z" fill={`url(#${uid}-paint)`} stroke="#5a0b10" strokeWidth=".5" strokeLinejoin="round" />
        <path d="M-8 -11.2C-7 -15.3 -5.2 -16 -2.2 -16H-1.6V-11.2Z" fill={`url(#${uid}-glass)`} />
        <path d="M-.4 -16H2.6C5.6 -16 7.2 -14.6 9.2 -11.2H-.4Z" fill={`url(#${uid}-glass)`} />
        <path d="M1.2 -15.3L3.4 -12" stroke="#fff" strokeWidth=".6" strokeLinecap="round" opacity=".8" />
        {/* Driver in a white helmet. */}
        <circle cx="-4.4" cy="-13.4" r="1.7" fill="#f4f4f6" />
        <path d="M-4.4 -13.4H-2.9" stroke="#1e2a36" strokeWidth=".9" strokeLinecap="round" />
        <path d="M-16 -6C-16 -9 -14 -10.6 -11 -10.8H12C15 -10.6 16.5 -9 16.8 -7L17 -5C17 -4 16.4 -3.4 15.4 -3.4H13.8A4.4 4.4 0 0 0 5.2 -3.4H-5.2A4.4 4.4 0 0 0 -13.8 -3.4H-15C-15.8 -3.4 -16.2 -4 -16 -6Z" fill={`url(#${uid}-paint)`} stroke="#5a0b10" strokeWidth=".5" strokeLinejoin="round" />
        <path d="M-15.6 -8.6H16.4" stroke="#fff" strokeWidth="1.3" opacity=".9" />
        <path d="M-14 -10.2H11" stroke="#ffb3aa" strokeWidth=".55" strokeLinecap="round" opacity=".7" />
        <circle cx="1" cy="-6.4" r="2" fill="#fff" />
        <path d="M.6 -7.5L1.6 -7.7V-5.2" stroke="#e3262f" strokeWidth=".7" fill="none" strokeLinejoin="round" />
        <ellipse cx="16.2" cy="-7.6" rx=".9" ry="1.1" fill="#fff4b5" />
        <rect x="-16.3" y="-8.4" width="1.2" height="1.8" rx=".4" fill="#ff3b3b" />
        <rect x="-17.4" y="-5" width="2" height="1.2" rx=".4" fill="#8d96a3" />
      </g>
      <Wheel x={-9.5} uid={uid} />
      <Wheel x={9.5} uid={uid} />
    </g>
  );
}

function Front({ uid, hovering }: DecorationLayerProps) {
  const orbit = useRef<SVGGElement>(null);
  const rate = useRef(1);

  // Ease every running animation in the car toward the target speed. Each
  // frame nudges playbackRate with updatePlaybackRate, which keeps the car
  // where it is instead of jumping to where the faster timeline would put it.
  useEffect(() => {
    const el = orbit.current;
    if (!el) return;
    const from = rate.current;
    const to = hovering ? BOOST : 1;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / RAMP_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      rate.current = from + (to - from) * eased;
      for (const anim of el.getAnimations({ subtree: true })) anim.updatePlaybackRate(rate.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [hovering]);

  return (
    <>
      <Defs uid={uid} />
      {/* The track: asphalt, kerb lines, a dashed centre line and a chequered start. */}
      <circle cx="100" cy="100" r={TRACK_R} fill="none" stroke="#000" strokeOpacity=".3" strokeWidth="10.5" />
      <circle cx="100" cy="100" r={TRACK_R} fill="none" stroke="#2b2d33" strokeWidth="8.4" />
      <circle cx="100" cy="100" r={TRACK_R - 4} fill="none" stroke="#5b5f69" strokeWidth=".7" />
      <circle cx="100" cy="100" r={TRACK_R + 4} fill="none" stroke="#5b5f69" strokeWidth=".7" />
      <circle cx="100" cy="100" r={TRACK_R} fill="none" stroke="#f6d36a" strokeWidth=".9" strokeDasharray="4.2 4.2" opacity=".85" />
      <g transform={`rotate(-62 100 100) translate(100 ${100 - TRACK_R})`}>
        {[0, 1, 2, 3].map((row) =>
          [0, 1].map((col) => (
            <rect key={`${row}-${col}`} x={-2 + col * 2} y={-4 + row * 2} width="2" height="2" fill={(row + col) % 2 ? "#fff" : "#111"} />
          )),
        )}
      </g>
      <g ref={orbit} className="rtw-orbit di">
        <g transform={`translate(100 ${100 - TRACK_R + 1.2})`}>
          <g className="rtw-bounce di">
            <Car uid={uid} />
          </g>
        </g>
      </g>
    </>
  );
}

export const roundTheWorld: DesignSpec = { cycleMs: 1000, gapMs: null, front: (p) => <Front {...p} /> };
