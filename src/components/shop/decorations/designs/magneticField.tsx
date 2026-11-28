import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { arcBlade, arcPath, f } from "./kit";
import "./magneticField.css";

/*
 Magnetic Field: three thin bands of dark metal arcing round the photo at
 three radii, like lines of a field made solid.

 Each band is a blade that tapers to a point at both ends, gunmetal with a
 pale outer edge and a restrained cyan line along its inner edge. The
 bands turn at three speeds (the middle one backwards) and each is gently
 pulled out of round: a slight ellipse whose long axis turns on its own
 period, so their curvature keeps changing without ever kinking. Small
 metal chips travel the length of each band, easing in and out, tumbling
 as they go; they fade in at one end and out at the other, so each run
 can start again unseen.

 Pulled at most 5% out of round, the innermost band still clears the
 photo. Hover brightens the cyan.
*/

interface Band {
  r: number;
  from: number;
  to: number;
  w: number;
  /** Seconds per turn; negative turns anticlockwise. */
  spin: number;
  /** Out-of-round amount and seconds per half turn of its long axis. */
  pull: number;
  pullT: number;
  start: number;
  chips: { t: number; turn: number; phase: number }[];
}

const BANDS: Band[] = [
  { r: 58.5, from: -160, to: -10, w: 4, spin: 20, pull: 0.045, pullT: 11, start: 10, chips: [{ t: 5.6, turn: 1.9, phase: 0 }, { t: 5.6, turn: 2.6, phase: 0.5 }] },
  { r: 64.5, from: 30, to: 150, w: 3.4, spin: -28, pull: 0.04, pullT: 15, start: -40, chips: [{ t: 4.8, turn: 2.2, phase: 0.2 }, { t: 4.8, turn: 1.6, phase: 0.72 }] },
  { r: 70.5, from: 188, to: 262, w: 2.9, spin: 13, pull: 0.035, pullT: 8.5, start: 60, chips: [{ t: 3.6, turn: 1.4, phase: 0.4 }] },
];

const CHIP = "M-2.4 0L0 -1L2.6 0L0 1.05Z";

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="-75" x2="0" y2="75">
          <stop offset="0" stopColor="#626c78" />
          <stop offset=".42" stopColor="#2b3139" />
          <stop offset=".58" stopColor="#1b1f25" />
          <stop offset="1" stopColor="#434c57" />
        </linearGradient>
      </defs>
      <g transform="translate(100 100)">
        {BANDS.map((b, i) => {
          const span = b.to - b.from;
          const vars = {
            "--spin": `${Math.abs(b.spin)}s`,
            "--s0": `${b.start}deg`,
            "--px": 1 + b.pull,
            "--py": 1 - b.pull,
            "--pt": `${b.pullT}s`,
          } as CSSProperties;
          return (
            <g key={i} className={`mf-spin${b.spin < 0 ? " mf-spin-back" : ""} di`} style={vars}>
              <g className="mf-pull di" style={vars}>
                <path d={arcBlade(b.r, b.from, b.to, b.w)} fill="#000000" opacity=".22" transform="translate(.5 .8)" />
                <path d={arcBlade(b.r, b.from, b.to, b.w)} fill={`url(#${uid}-metal)`} />
                <path d={arcPath(b.r + b.w * 0.28, b.from + span * 0.16, b.to - span * 0.16, 0, 0)} fill="none" stroke="#b3bfcc" strokeWidth=".35" strokeLinecap="round" opacity=".6" />
                <path className="mf-cyan-glow" d={arcPath(b.r - b.w * 0.26, b.from + span * 0.2, b.to - span * 0.2, 0, 0)} fill="none" stroke="#5fe6ff" strokeWidth="1.6" strokeLinecap="round" />
                <path className="mf-cyan" d={arcPath(b.r - b.w * 0.26, b.from + span * 0.2, b.to - span * 0.2, 0, 0)} fill="none" stroke="#6ee9ff" strokeWidth=".45" strokeLinecap="round" />
                {b.chips.map((c, k) => (
                  <g
                    key={k}
                    className="mf-chip di"
                    style={{ "--f0": `${b.from + 7}deg`, "--f1": `${b.to - 7}deg`, "--ct": `${c.t}s`, "--cd": `${f(-c.phase * c.t)}s` } as CSSProperties}
                  >
                    <g transform={`translate(${b.r} 0)`}>
                      <g className="mf-tumble di" style={{ "--tt": `${c.turn}s` } as CSSProperties}>
                        <path d={CHIP} fill="#4b5560" stroke="#86efff" strokeWidth=".3" strokeLinejoin="round" />
                        <path d="M-2 0L2.2 0" stroke="#e1f8ff" strokeWidth=".25" opacity=".55" />
                      </g>
                    </g>
                  </g>
                ))}
              </g>
            </g>
          );
        })}
      </g>
    </>
  );
}

export const magneticField: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
