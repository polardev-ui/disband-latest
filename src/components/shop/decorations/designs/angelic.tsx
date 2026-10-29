import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Angelic: a gold halo tilted in perspective round the head, seen from just
 below. Its upper arc is the near side, drawn in the front layer across the
 top of the photo; its lower arc is the far side, in the back layer, so it
 passes behind the head. Both halves float together. On hover the glow swells and breathes, rays fan out
 behind it, light spills onto the photo and a few stars catch.
*/

const CX = 100;
const CY = 63;
const RX = 42;
const RY = 12;
// Upper arc in front of the photo, lower arc behind it. The back arc dips
// deeper than the front one, so the far side sits lower behind the head.
const BACK_RY = RY + 7;
const FRONT_ARC = `M${CX - RX} ${CY}A${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`;
const BACK_ARC = `M${CX - RX} ${CY}A${RX} ${BACK_RY} 0 0 0 ${CX + RX} ${CY}`;

function Torus({ uid, d, far }: { uid: string; d: string; far?: boolean }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path className="ang-glow" d={d} stroke="#ffd34d" strokeWidth="16" opacity=".32" filter={`url(#${uid}-blur)`} />
      <path d={d} stroke="#a46c09" strokeWidth="8.6" />
      <path d={d} stroke={`url(#${uid}-gold)`} strokeWidth="6.6" />
      <path d={d} stroke="#fffbe8" strokeWidth="1.5" opacity={far ? 0.45 : 0.9} transform="translate(0 -1.7)" />
      <path d={d} stroke="#7a4d02" strokeWidth="1" opacity=".55" transform="translate(0 2.6)" />
      {far && <path d={d} stroke="#6b4300" strokeWidth="8.6" opacity=".18" />}
    </g>
  );
}

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-gold`} x1="0" y1={CY - RY - 4} x2="0" y2={CY + RY + 4} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff3b8" />
        <stop offset=".45" stopColor="#ffd34a" />
        <stop offset="1" stopColor="#e39a12" />
      </linearGradient>
      <radialGradient id={`${uid}-aura`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff2a8" stopOpacity=".75" />
        <stop offset=".5" stopColor="#ffd34d" stopOpacity=".28" />
        <stop offset="1" stopColor="#ffc928" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-ray`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff6c4" stopOpacity="0" />
        <stop offset=".35" stopColor="#fff6c4" stopOpacity=".7" />
        <stop offset="1" stopColor="#ffd34d" stopOpacity="0" />
      </linearGradient>
      <filter id={`${uid}-blur`} x="-30%" y="-80%" width="160%" height="260%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
    </defs>
  );
}

/** Four-point twinkle, drawn at the origin. */
const STAR = "M0 -4.5C.5 -1.1 1.1 -.5 4.5 0C1.1 .5 .5 1.1 0 4.5C-.5 1.1 -1.1 .5 -4.5 0C-1.1 -.5 -.5 -1.1 0 -4.5Z";
const STARS = [
  { x: 52, y: 40, s: 0.9 }, { x: 150, y: 44, s: 1.15 }, { x: 128, y: 24, s: 0.75 },
  { x: 70, y: 22, s: 0.7 }, { x: 160, y: 66, s: 0.6 }, { x: 40, y: 62, s: 0.65 },
];

function Back({ uid }: DecorationLayerProps) {
  return (
    <>
      <Defs uid={uid} />
      <g className="ang-lift">
        <g className="ang-float di">
          <ellipse className="ang-aura" cx={CX} cy={CY - 2} rx="58" ry="26" fill={`url(#${uid}-aura)`} />
          <g className="ang-rays">
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M${CX - 2.2} ${CY}L${CX} ${CY - 46}L${CX + 2.2} ${CY}Z`} fill={`url(#${uid}-ray)`} transform={`rotate(${-75 + i * 13.6} ${CX} ${CY})`} />
            ))}
          </g>
          <Torus uid={uid} d={BACK_ARC} far />
        </g>
      </g>
    </>
  );
}

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <Defs uid={uid} />
      <g className="ang-lift">
        <g className="ang-float di">
          {/* Light the halo throws onto the top of the photo. */}
          <ellipse className="ang-spill" cx={CX} cy={CY + 12} rx="30" ry="13" fill="#fff1a6" style={{ mixBlendMode: "screen" }} filter={`url(#${uid}-blur)`} />
          <Torus uid={uid} d={FRONT_ARC} />
        </g>
      </g>
      <g className="ang-stars" fill="#fff7d1">
        {/* Position on the wrapper: a CSS-animated transform replaces an SVG transform attribute. */}
        {STARS.map((s, i) => (
          <g key={i} transform={`translate(${s.x} ${s.y}) scale(${s.s})`}>
            <path className={`ang-star ang-star-${i} di`} d={STAR} />
          </g>
        ))}
      </g>
    </>
  );
}

export const angelic: DesignSpec = {
  cycleMs: 1400,
  gapMs: null,
  back: (p) => <Back {...p} />,
  front: (p) => <Front {...p} />,
};
