import type { CSSProperties } from "react";
import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import "./deepSeaDrifter.css";

/*
 Deep Sea Drifter: a small translucent jellyfish hanging off the photo's
 right shoulder.

 One 3.8s beat drives it. The bell snaps narrow and tall (the stroke), then
 relaxes past round and settles; the body rises on the stroke and sinks
 slowly through the rest of the beat; the glow peaks with the stroke. The
 tentacles and the two frilled oral arms run the same beat a little late,
 each by a different amount, so they trail the bell instead of moving with
 it, and each sways on its own slower cycle as well. Over all that the
 whole animal drifts a few units side to side and leans, on periods that
 never line up with the beat, and a few flecks of marine snow sink past.

 Hover brightens the glow and the lights along the bell's margin.
*/

/** Marginal tentacles: x where they leave the rim, path, lag behind the bell (s), sway period. */
const TENTACLES = [
  { x: -10.4, d: "M0 0C-1.5 7 1.8 13 0 20C-1.6 26 1.2 31 .2 35.5", lag: 0.42, sway: 5.4 },
  { x: -5.2, d: "M0 0C1.4 8 -1.8 15 0 22C1.6 28 -.8 33 .6 38", lag: 0.3, sway: 4.7 },
  { x: 5.2, d: "M0 0C-1.4 8 1.8 15 0 22C-1.6 28 .8 32 -.4 37", lag: 0.34, sway: 5.1 },
  { x: 10.4, d: "M0 0C1.5 7 -1.8 13 0 20C1.6 26 -1.2 31 -.2 34.5", lag: 0.46, sway: 5.8 },
];

const ARM = "M-1.3 0C-2.8 6 .5 10 -1.1 16C-2.6 21 .3 25 -.7 30C.9 25.4 2.4 21 1.1 16C-.1 10 2.6 6 1.3 0Z";
const ARM_FRILL = "M-1.6 3C-.4 4.2 -2.4 5.6 -1.2 7.2C0 8.6 -2.2 10 -1.4 11.8C-.6 13.4 -2.6 14.6 -1.8 16.4C-1 18 -2.8 19.4 -2 21";

const BELL = "M-13 1.5C-13.6-6.5-7.6-12.6 0-12.6C7.6-12.6 13.6-6.5 13 1.5C11.4 2.6 10 1.6 8.6 2.6C7.2 3.6 5.6 2.4 4.3 3.3C2.9 4.2 1.4 3 0 3.8C-1.4 3-2.9 4.2-4.3 3.3C-5.6 2.4-7.2 3.6-8.6 2.6C-10 1.6-11.4 2.6-13 1.5Z";
const MARGIN = [-11.6, -8.6, -5.7, -2.9, 0, 2.9, 5.7, 8.6, 11.6];

const SNOW = [
  { x: 146, y: 36, d: 10.5, o: -2.1, r: 0.55 },
  { x: 181, y: 70, d: 12.8, o: -8.4, r: 0.45 },
  { x: 170, y: 26, d: 9.2, o: -5.6, r: 0.4 },
];

function Bell({ uid }: { uid: string }) {
  return (
    <g>
      <path d={BELL} fill={`url(#${uid}-bell)`} stroke="#7cc3e6" strokeOpacity=".9" strokeWidth=".8" strokeLinejoin="round" />
      <path d={BELL} fill="none" stroke="#eaf8ff" strokeOpacity=".7" strokeWidth=".35" strokeLinejoin="round" />
      {/* The inner bell and its lip. */}
      <path d="M-9.8 1.8C-9.8 -5 -5.5 -9.2 0 -9.2C5.5 -9.2 9.8 -5 9.8 1.8" fill={`url(#${uid}-sub)`} stroke="#ffffff" strokeOpacity=".28" strokeWidth=".5" />
      {/* Four gonads round the centre, the jellyfish's soft pink clover. */}
      {[45, 135, 225, 315].map((a) => (
        <g key={a} transform={`translate(0 -4.4) rotate(${a}) translate(2.3 0)`}>
          <ellipse rx="1.9" ry="1.25" fill="#f4a6d4" opacity=".42" />
          <ellipse rx="1.9" ry="1.25" fill="none" stroke="#ffd3ec" strokeWidth=".3" opacity=".55" />
        </g>
      ))}
      <path d="M-8.2 -7.8C-5.2 -11.4 -1 -12 2.2 -11.4C-1.6 -10.4 -5.4 -8.6 -8.4 -5.4Z" fill="#ffffff" opacity=".42" />
      <g className="dsd-margin">
        {MARGIN.map((x, i) => (
          <circle key={i} cx={x} cy={i % 2 ? 3.3 : 2.5} r=".55" fill="#ecfcff" />
        ))}
      </g>
    </g>
  );
}

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-bell`} cx=".5" cy=".3" r=".75">
          <stop offset="0" stopColor="#f3fbff" stopOpacity=".66" />
          <stop offset=".55" stopColor="#a9def6" stopOpacity=".36" />
          <stop offset="1" stopColor="#5fa9d6" stopOpacity=".2" />
        </radialGradient>
        <radialGradient id={`${uid}-sub`} cx=".5" cy=".85" r=".8">
          <stop offset="0" stopColor="#d9b8ff" stopOpacity=".3" />
          <stop offset="1" stopColor="#9fd8ff" stopOpacity=".06" />
        </radialGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset=".1" stopColor="#bdf0ff" stopOpacity=".4" />
          <stop offset=".45" stopColor="#7fd2ff" stopOpacity=".16" />
          <stop offset="1" stopColor="#6aa8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {SNOW.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y})`}>
          <circle className="dsd-snow di" r={s.r} fill="#d8f3ff" style={{ "--sd": `${s.d}s`, "--so": `${s.o}s` } as CSSProperties} />
        </g>
      ))}
      <g transform="translate(164 55) scale(1.12)">
        <g className="dsd-drift di">
          <g className="dsd-lean di">
            <g className="dsd-rise di">
              <circle className="dsd-glow di" cy="-2" r="25" fill={`url(#${uid}-glow)`} />
              <circle className="dsd-glow-hover" cy="-3" r="17" fill={`url(#${uid}-glow)`} />
              {/* The bell pivots near its crown; everything hangs from it. */}
              <g transform="translate(0 -11)">
                <g className="dsd-bell di">
                  <g transform="translate(0 11)">
                    {TENTACLES.map((t, i) => (
                      <g key={i} transform={`translate(${t.x} 2.6)`}>
                        <g className="dsd-trail di" style={{ "--lag": `${t.lag}s` } as CSSProperties}>
                          <g className="dsd-sway di" style={{ "--sw": `${t.sway}s`, "--sd": `${-i * 1.3}s` } as CSSProperties}>
                            <path d={t.d} fill="none" stroke="#bfeaff" strokeWidth="1.8" strokeLinecap="round" opacity=".1" />
                            <path d={t.d} fill="none" stroke="#a9dcf4" strokeWidth=".6" strokeLinecap="round" opacity=".8" />
                          </g>
                        </g>
                      </g>
                    ))}
                    {[{ x: -2.2, lag: 0.22, sway: 6.2, flip: 1 }, { x: 2.4, lag: 0.28, sway: 5.6, flip: -1 }].map((a, i) => (
                      <g key={i} transform={`translate(${a.x} 1.4) scale(${a.flip} 1)`}>
                        <g className="dsd-trail di" style={{ "--lag": `${a.lag}s` } as CSSProperties}>
                          <g className="dsd-sway di" style={{ "--sw": `${a.sway}s`, "--sd": `${-2 - i * 2.1}s` } as CSSProperties}>
                            <path d={ARM} fill="#e3c6ff" fillOpacity=".36" stroke="#c7a8ec" strokeOpacity=".7" strokeWidth=".4" />
                            <path d={ARM_FRILL} fill="none" stroke="#f6eaff" strokeWidth=".4" opacity=".5" />
                          </g>
                        </g>
                      </g>
                    ))}
                    <Bell uid={uid} />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </>
  );
}

export const deepSeaDrifter: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};
