import type { CSSProperties } from "react";
import type { SkinProps } from "../Skin";
import { Defs, Piece, rand } from "./parts";
import { Strip } from "./scene";
import "./scene.css";
import "./emberfall.css";

/*
 Emberfall: dusk over volcanic country. Not a fire: the air after one.

 Ash cloud drifts across the top in two slow layers, its undersides faintly
 warmed. The sky darkens down the card to where the horizon glows burnt
 orange behind a far ridge, rimmed in light. A distant cone smokes on the
 right, its crater breathing a dull glow; dark rock rises in the foreground
 from both corners with lava veins pulsing slowly in its cracks.

 Embers lift off the ground and rise at their own speeds, swaying, and go
 out before they reach the middle of the card; those at the sides climb
 higher than those in the middle, so the text keeps clear. Now and then a
 spark flicks up off the ridge and fades, and slow smoke curls up the
 sides.

 Layout: ash in the top band, the landscape is the floor (SKIN_FLOOR).
*/

const f = (n: number) => Math.round(n * 100) / 100;
const T = 300;

/**
 * An ash cloud hanging from the top of its tile: a slow swell in its base
 * with soft billows on it (whole cycles per tile, so it repeats exactly).
 * `under` is its underside, which takes the glow from the ground.
 */
function ash(h: number, base: number, swell: [number, number, number], billows: [number, number, number]) {
  const [sa, sk, sp] = swell;
  const [ba, bk, bp] = billows;
  const y = (x: number) => base + sa * Math.sin((2 * Math.PI * sk * x) / T + sp) + ba * Math.pow(Math.abs(Math.sin((Math.PI * bk * x) / T + bp)), 0.7);
  const pts: string[] = [];
  for (let x = 0; x <= T; x += 1.5) pts.push(`${f(x)} ${f(y(x))}`);
  return { fill: `M0 0H${T}V${f(y(T))}L${[...pts].reverse().join("L")}Z`, under: `M${pts.join("L")}`, h };
}
const ASH_BACK = ash(74, 40, [8, 2, 0.6], [14, 6, 0.9]);
const ASH_FRONT = ash(52, 22, [6, 3, 1.9], [11, 9, 0.2]);

/** Embers: left %, size %, seconds to rise, how high (cqh), start phase, sway. */
const EMBERS = Array.from({ length: 16 }, (_, i) => {
  const side = i % 3 === 2 ? "mid" : i % 2 ? "left" : "right";
  const x = side === "mid" ? 30 + rand(i, 41) * 40 : side === "left" ? 2 + rand(i, 41) * 24 : 74 + rand(i, 41) * 24;
  return {
    x,
    size: 0.7 + rand(i, 42) * 0.8,
    dur: 7 + rand(i, 43) * 7,
    rise: side === "mid" ? 26 + rand(i, 44) * 10 : 44 + rand(i, 44) * 22,
    phase: rand(i, 45),
    sway: 0.6 + rand(i, 46) * 1.2,
    swayDur: 2.4 + rand(i, 47) * 2.2,
    o: 0.55 + rand(i, 48) * 0.45,
  };
});

const SPARKS = Array.from({ length: 6 }, (_, i) => ({
  x: 10 + i * 15 + rand(i, 51) * 8,
  y: 70 + rand(i, 52) * 18,
  dur: 3.2 + rand(i, 53) * 2.6,
  delay: -rand(i, 54) * 5,
}));

function Land({ uid }: { uid: string }) {
  return (
    <Piece vb="0 0 300 100" className="ef-land" style={{ left: 0, bottom: 0, width: "100%" }}>
      <rect x="0" y="0" width="300" height="64" fill={`url(#${uid}-glow)`} />
      {/* The cone, smoking, with its crater breathing. */}
      <g transform="translate(214 0)">
        <g transform="translate(0 22)">
          {[0, 1, 2].map((k) => (
            <ellipse key={k} className="ef-puff" rx="7" ry="5" fill="#3a2d2b" style={{ "--pd": `${-k * 3.2}s` } as CSSProperties} />
          ))}
        </g>
        <ellipse className="ef-crater" cx="0" cy="27" rx="12" ry="5" fill={`url(#${uid}-crater)`} />
        <path d="M-40 60L-6 27H6L40 60Z" fill="#241312" />
        <path d="M-6 27H6" stroke="#e07b34" strokeWidth=".9" opacity=".8" />
        <path d="M-6 27L-18 40M6 27L14 37" stroke="#7a2a17" strokeWidth=".6" opacity=".7" />
      </g>
      {/* The far ridge, lit from behind. */}
      <path d="M0 60L18 52L34 55L52 46L70 50L92 42L116 49L140 45L164 52L188 48L206 55L232 50L256 56L280 49L300 53V100H0Z" fill="#1b100f" />
      <path d="M0 60L18 52L34 55L52 46L70 50L92 42L116 49L140 45L164 52L188 48L206 55L232 50L256 56L280 49L300 53" fill="none" stroke="#d3672a" strokeWidth=".8" opacity=".55" />
      {/* Near rock, rising from both corners, veined with lava. */}
      <path d="M0 64L10 62L22 70L34 68L46 78L64 80L84 88L120 90L160 91L200 88L232 82L250 76L268 72L282 66L292 68L300 63V100H0Z" fill="#0e0a0a" />
      <path className="ef-lava" d="M12 66L18 74L16 82M34 70L40 80L52 86M250 78L244 86L236 92M276 70L270 80M120 92L132 96" fill="none" stroke="#e0632a" strokeWidth=".7" strokeLinecap="round" />
      <path className="ef-lava ef-lava-glow" d="M12 66L18 74L16 82M34 70L40 80L52 86M250 78L244 86L236 92M276 70L270 80" fill="none" stroke="#c4511f" strokeWidth="2.4" strokeLinecap="round" />
      {SPARKS.map((s, i) => (
        <g key={i} transform={`translate(${f(s.x * 3)} ${f(s.y)})`}>
          <g className="ef-spark" style={{ "--sd": `${f(s.dur)}s`, "--sl": `${f(s.delay)}s` } as CSSProperties}>
            <path d="M0 -2.2L.45 -.45L2.2 0L.45 .45L0 2.2L-.45 .45L-2.2 0L-.45 -.45Z" fill="#ffd9a0" />
          </g>
        </g>
      ))}
    </Piece>
  );
}

export function Emberfall({ uid }: SkinProps) {
  return (
    <>
      <Defs>
        <linearGradient id={`${uid}-glow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5c1a14" stopOpacity="0" />
          <stop offset=".45" stopColor="#6e2216" stopOpacity=".38" />
          <stop offset=".8" stopColor="#b4501f" stopOpacity=".7" />
          <stop offset="1" stopColor="#d9a25e" stopOpacity=".72" />
        </linearGradient>
        <radialGradient id={`${uid}-crater`}>
          <stop offset="0" stopColor="#f0a050" stopOpacity=".8" />
          <stop offset="1" stopColor="#c4511f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-ember`}>
          <stop offset="0" stopColor="#fff0c8" />
          <stop offset=".3" stopColor="#ffb25e" />
          <stop offset=".6" stopColor="#d3672a" stopOpacity=".35" />
          <stop offset="1" stopColor="#d3672a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-smoke`}>
          <stop offset="0" stopColor="#3b302d" stopOpacity=".45" />
          <stop offset="1" stopColor="#3b302d" stopOpacity="0" />
        </radialGradient>
      </Defs>
      <span className="ef-sky" />
      <Strip w={T} h={ASH_BACK.h} dur={130} phase={0.3} className="ef-ash">
        <path d={ASH_BACK.fill} fill="#211a1b" />
        <path d={ASH_BACK.under} fill="none" stroke="#7a341c" strokeWidth="2.2" opacity=".28" />
        <path d={ASH_BACK.under} fill="none" stroke="#b4501f" strokeWidth=".6" opacity=".3" />
      </Strip>
      <Strip w={T} h={ASH_FRONT.h} dur={80} phase={0.65} className="ef-ash">
        <path d={ASH_FRONT.fill} fill="#171213" />
        <path d={ASH_FRONT.under} fill="none" stroke="#6a2c1a" strokeWidth="1.8" opacity=".3" />
        <path d={ASH_FRONT.under} fill="none" stroke="#c9a15a" strokeWidth=".45" opacity=".18" />
      </Strip>
      <span className="ef-smoke ef-smoke-l"><svg viewBox="-10 -10 20 20"><circle r="10" fill={`url(#${uid}-smoke)`} /></svg></span>
      <span className="ef-smoke ef-smoke-r"><svg viewBox="-10 -10 20 20"><circle r="10" fill={`url(#${uid}-smoke)`} /></svg></span>
      <Land uid={uid} />
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="ef-ember"
          style={{ left: `${f(e.x)}%`, width: `${f(e.size)}%`, "--dur": `${f(e.dur)}s`, "--delay": `${f(-e.phase * e.dur)}s`, "--h": e.rise, "--o": f(e.o), "--sw": f(e.sway), "--swd": `${f(e.swayDur)}s` } as CSSProperties}
        >
          <span className="ef-ember-sway">
            <svg viewBox="-2 -2 4 4"><circle r="2" fill={`url(#${uid}-ember)`} /></svg>
          </span>
        </span>
      ))}
    </>
  );
}
