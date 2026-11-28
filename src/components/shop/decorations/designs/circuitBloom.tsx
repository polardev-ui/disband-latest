import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import { arcPath, polar, f } from "./kit";
import "./circuitBloom.css";

/*
 Circuit Bloom: a mechanical flower pinned at the photo's upper right, with
 its circuitry running along the photo's edge.

 Sixteen blades of dark gunmetal (two rings of eight), each bevelled into a
 lit and a shaded half with a bright upper edge and a trace of its own, sit
 round a bolted hub with a glowing core. Traces leave the flower and hug
 the photo, ending in solder pads.

 One 8s sequence: a pulse of light runs in along the traces from their
 pads, the core flares as it arrives, the blades unfold in turn from a
 tight pinwheel bud (each lighting its trace as it opens), hold open while
 a second, fainter pulse comes in, then fold back in the same order and
 rest closed. The whole flower turns slowly the while. The rest pose for
 reduced motion is the open bloom, lit.

 Hover brightens the core and the traces.
*/

const F = { x: 156, y: 46 };
const BLADE = "M0 0L5.5 -4.8L15 -4L19.5 0L15 4L5.5 4.8Z";
const BLADE_TOP = "M0 0L5.5 -4.8L15 -4L19.5 0Z";
const BLADE_EDGE = "M.6 -.5L5.5 -4.4L14.8 -3.7";
const BLADE_TRACE = "M3 0H10L12.6 -2H14.4";

/** Traces round the photo, each drawn from the flower end so a dash can run in towards it. */
const TRACES = (() => {
  const a = arcPath(62, -40, 4);
  const [jx, jy] = polar(11, 57.5);
  const t1 = `${a}L${f(jx)} ${f(jy)}${arcPath(57.5, 11, 25).replace(/^M[^A]+/, "")}`;
  const t2 = arcPath(66.5, -36, 18);
  const b = arcPath(62, -52, -96);
  const [kx, ky] = polar(-102, 67);
  const t3 = `${b}L${f(kx)} ${f(ky)}${arcPath(67, -102, -118).replace(/^M[^A]+/, "")}`;
  // Each trace runs on in under the flower to just short of its hub, so
  // the folded bud still sits on its circuitry.
  const lead = (d: string) => {
    const [, x, y] = d.match(/^M(-?[\d.]+) (-?[\d.]+)/)!.map(Number) as [number, number, number];
    const dx = x - F.x;
    const dy = y - F.y;
    const len = Math.hypot(dx, dy);
    return `M${f(F.x + (dx / len) * 5)} ${f(F.y + (dy / len) * 5)}L${d.slice(1)}`;
  };
  return [
    { d: lead(t1), end: polar(25, 57.5) },
    { d: lead(t2), end: polar(18, 66.5) },
    { d: lead(t3), end: polar(-118, 67) },
  ];
})();

function Blade({ size, i, back }: { size: number; i: number; back?: boolean }) {
  return (
    <g className="cb-blade di" style={{ "--i": i + (back ? 0 : 8) } as CSSProperties}>
      <g transform={`scale(${size})`}>
        <path d={BLADE} fill={back ? "#262b32" : "#2c323a"} stroke="#13161a" strokeWidth=".55" strokeLinejoin="round" />
        <path d={BLADE_TOP} fill={back ? "#3e4651" : "#4c5661"} />
        <path d={BLADE_EDGE} fill="none" stroke="#9aa7b6" strokeWidth=".45" strokeLinecap="round" opacity=".7" />
        <g className="cb-blade-light di">
          <path d={BLADE_TRACE} fill="none" stroke="#5cf0a0" strokeWidth=".6" strokeLinejoin="round" />
          <circle cx="15" cy="-2" r=".9" fill="#0f1a14" stroke="#8dffbd" strokeWidth=".4" />
        </g>
        <circle cx="4.2" cy="0" r=".55" fill="#8a96a4" />
      </g>
    </g>
  );
}

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-core`}>
          <stop offset=".12" stopColor="#e6fff1" stopOpacity=".95" />
          <stop offset=".4" stopColor="#62f5a4" stopOpacity=".42" />
          <stop offset="1" stopColor="#2fd17f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset=".3" stopColor="#4fe896" stopOpacity=".14" />
          <stop offset="1" stopColor="#4fe896" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="cb-traces">
        {TRACES.map((t, i) => (
          <g key={i}>
            <path d={t.d} fill="none" stroke="#1d2228" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            <path className="cb-trace-lit" d={t.d} fill="none" stroke="#45e08f" strokeWidth=".6" strokeLinejoin="round" />
            <path className="cb-pulse di" d={t.d} pathLength={100} fill="none" stroke="#dcffe9" strokeWidth="1.3" strokeLinecap="round" style={{ "--pd": `${i * 90}ms` } as CSSProperties} />
            <path className="cb-pulse-2 di" d={t.d} pathLength={100} fill="none" stroke="#bfffd9" strokeWidth=".9" strokeLinecap="round" style={{ "--pd": `${i * 90}ms` } as CSSProperties} />
            <circle cx={f(t.end[0])} cy={f(t.end[1])} r="1.7" fill="#13171b" stroke="#7dffb4" strokeWidth=".55" />
            <circle cx={f(t.end[0])} cy={f(t.end[1])} r=".55" fill="#7dffb4" />
          </g>
        ))}
      </g>
      <g transform={`translate(${F.x} ${F.y})`}>
        <circle r="27" fill={`url(#${uid}-halo)`} />
        <g transform="scale(1.15)">
        <g className="cb-spin di">
          {Array.from({ length: 8 }, (_, i) => (
            <g key={`b${i}`} transform={`rotate(${i * 45 + 22.5}) translate(3.2 0)`}>
              <Blade size={1} i={i} back />
            </g>
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <g key={`f${i}`} transform={`rotate(${i * 45}) translate(2.6 0)`}>
              <Blade size={0.78} i={i} />
            </g>
          ))}
          <circle r="5.4" fill="#1a1e23" stroke="#6f7c8a" strokeWidth=".6" />
          {Array.from({ length: 6 }, (_, i) => {
            const [x, y] = polar(i * 60 + 30, 3.7, 0, 0);
            return <circle key={i} cx={f(x)} cy={f(y)} r=".5" fill="#8f9bab" />;
          })}
        </g>
        <circle className="cb-core di" r="9" fill={`url(#${uid}-core)`} />
        <circle r="2.1" fill="#e9fff3" />
        </g>
      </g>
    </>
  );
}

export const circuitBloom: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
