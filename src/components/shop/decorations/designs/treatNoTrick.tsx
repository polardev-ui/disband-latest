import type { DesignSpec, DecorationLayerProps } from "../Decoration";

/*
 Treat, No Trick: a dark skull with the face held in its mouth.

 Both halves are drawn where they meet when the mouth is shut (upper teeth
 down to y≈104, lower teeth up from y≈99) and wide enough to cover the whole
 photo there. At rest the cranium is lifted 34 units and the jaw dropped 32,
 so they frame the face from above and below. On hover it chomps twice and
 settles, again after a pause while the pointer stays.

 Depth comes from a dark copy of each silhouette set a few units lower (the
 side wall), rim light on the upper edges, and a shadow the cranium casts on
 the photo.
*/

// Dome, temples, cheekbones, then in to the upper jaw. The corners it leaves
// beside the teeth are filled by the jaw's rami when the mouth is shut.
const CRANIUM =
  "M56 101C50 97 45 92 42 86C38 80 37 72 38 65C39 54 48 46 62 42C74 39.5 86 39 100 39C114 39 126 39.5 138 42C152 46 161 54 162 65C163 72 162 80 158 86C155 92 150 97 144 101Z";
// The mandible: a rami on each side rising to the condyle and coronoid, the
// teeth row between their front edges, and the body curving down to the chin.
const JAW =
  "M38 70C38 65 44 63 47 67L50 74L55 69C57 80 57 91 58 99L142 99C143 91 143 80 145 69L150 74L153 67C156 63 162 65 162 70C163 92 160 108 156 116C150 134 128 152 100 156C72 152 50 134 44 116C40 108 37 92 38 70Z";
const SOCKET_L = "M63 62C64 55 72 53 80 55C88 57 92 62 91 70C90 78 84 82 76 81C67 80 62 72 63 62Z";

/** Eight teeth across x 64–136; centre teeth longer, canines (1 and 6) pointed. */
function teeth(upper: boolean) {
  const lengths = [8.2, 11.4, 10.2, 11, 11, 10.2, 11.4, 8.2];
  return lengths.map((len, i) => {
    const x = 64 + i * 9;
    const canine = i === 1 || i === 6;
    if (upper) {
      const top = 92;
      const end = top + len;
      if (canine) return `M${x + 0.4} ${top}L${x + 0.6} ${end - 4.5}Q${x + 3} ${end - 1} ${x + 4.5} ${end}Q${x + 6} ${end - 1} ${x + 8.4} ${end - 4.5}L${x + 8.6} ${top}Z`;
      return `M${x + 0.4} ${top}L${x + 0.4} ${end - 3}Q${x + 0.6} ${end} ${x + 4.5} ${end}Q${x + 8.4} ${end} ${x + 8.6} ${end - 3}L${x + 8.6} ${top}Z`;
    }
    const bottom = 110;
    const start = bottom - len + 1;
    return `M${x + 0.4} ${bottom}L${x + 0.4} ${start + 3}Q${x + 0.6} ${start} ${x + 4.5} ${start}Q${x + 8.4} ${start} ${x + 8.6} ${start + 3}L${x + 8.6} ${bottom}Z`;
  });
}
const UPPER_TEETH = teeth(true);
const LOWER_TEETH = teeth(false);

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-bone`} cx="38%" cy="22%" r="85%">
        <stop offset="0" stopColor="#8f847c" />
        <stop offset=".45" stopColor="#5f5551" />
        <stop offset="1" stopColor="#2f2829" />
      </radialGradient>
      <radialGradient id={`${uid}-jawbone`} cx="40%" cy="10%" r="95%">
        <stop offset="0" stopColor="#7a6f69" />
        <stop offset=".5" stopColor="#524947" />
        <stop offset="1" stopColor="#262021" />
      </radialGradient>
      <radialGradient id={`${uid}-socket`} cx="50%" cy="45%" r="60%">
        <stop offset="0" stopColor="#000" />
        <stop offset=".75" stopColor="#0b0708" />
        <stop offset="1" stopColor="#1f1819" />
      </radialGradient>
      <radialGradient id={`${uid}-ember`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#ffb347" stopOpacity="1" />
        <stop offset=".35" stopColor="#ff6a1a" stopOpacity=".75" />
        <stop offset="1" stopColor="#ff3d00" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-tooth`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d9d0c1" />
        <stop offset="1" stopColor="#968b7d" />
      </linearGradient>
      <radialGradient id={`${uid}-shade`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#000" stopOpacity=".55" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Cranium({ uid }: { uid: string }) {
  return (
    <g>
      {/* Shadow cast down onto the photo, just under the upper teeth. */}
      <ellipse className="tnt-shade" cx="100" cy="108" rx="47" ry="8" fill={`url(#${uid}-shade)`} />
      <path d={CRANIUM} transform="translate(0 5)" fill="#171214" />
      <path d={CRANIUM} fill={`url(#${uid}-bone)`} stroke="#120e10" strokeWidth="1.4" strokeLinejoin="round" />
      {/* Rim light along the dome, darker temples. */}
      <path d="M50 58C60 48 80 44 100 44C118 44 134 46.5 146 53" fill="none" stroke="#b7aba1" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      <ellipse cx="47" cy="76" rx="6" ry="15" fill="#000" opacity=".22" />
      <ellipse cx="153" cy="76" rx="6" ry="15" fill="#000" opacity=".3" />
      {/* Temporal lines sweeping back over the temples. */}
      <path d="M46 70C47 58 54 50 64 46" fill="none" stroke="#2a2224" strokeWidth=".9" opacity=".55" />
      <path d="M154 70C153 58 146 50 136 46" fill="none" stroke="#1c1617" strokeWidth=".9" opacity=".6" />
      <path d="M48 68C49 59 55 52 63 48.5" fill="none" stroke="#a89c93" strokeWidth=".6" opacity=".3" />
      {/* Brow ridges: a lit upper edge and the shadow they throw into the sockets. */}
      <path d="M62 57C68 51 80 50 90 54C94 56 97 58 100 58C103 58 106 56 110 54C120 50 132 51 138 57" fill="none" stroke="#a99d94" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
      <path d="M63 60C69 54.5 80 53.5 89 57M137 60C131 54.5 120 53.5 111 57" fill="none" stroke="#0e0a0b" strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
      <path d="M97 60C99 62 101 62 103 60" fill="none" stroke="#2a2224" strokeWidth=".8" opacity=".6" />
      {PORES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#1e1819" opacity=".55" />)}
      {/* Coronal suture and cracks, one branching, one chipped at the temple. */}
      <path d="M80 47l3 3 3-2 3 3 3-2 3 3 3-3 3 2 3-2 3 3 3-2" fill="none" stroke="#231c1e" strokeWidth=".9" opacity=".75" />
      <path d="M121 45l-3 6 4 3-3 6 2 3" fill="none" stroke="#1b1517" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M119 54l5 2 3 4" fill="none" stroke="#1b1517" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M122 46l-2.6 6" fill="none" stroke="#a99d94" strokeWidth=".5" opacity=".4" />
      <path d="M40 66l4 3-2 4 3 3" fill="none" stroke="#1b1517" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M44 51C46 49 49 48.5 50.5 49.5L48 53Z" fill="#1a1415" opacity=".75" />
      {/* Eye sockets, each with an ember far back inside. */}
      {[0, 1].map((side) => (
        <g key={side} transform={side ? "translate(200 0) scale(-1 1)" : undefined}>
          <path d={SOCKET_L} fill={`url(#${uid}-socket)`} stroke="#0e0a0b" strokeWidth="1" />
          <path d="M64.5 59C68 54.5 76 53.5 84 55.5" fill="none" stroke="#b0a49b" strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
          <path d="M66 77C70 81 78 82.5 85 80" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
          <circle className="tnt-ember di" cx="77" cy="69" r="7.5" fill={`url(#${uid}-ember)`} />
          <circle className="tnt-ember-core di" cx="77.5" cy="69" r="1.5" fill="#ffd9a0" />
          {/* Cheekbone */}
          <path d="M56 84C63 88.5 72 89.5 81 87.5" fill="none" stroke="#211a1c" strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
          <path d="M57 82.5C64 86.5 72 87.5 80 86" fill="none" stroke="#a2968d" strokeWidth=".9" strokeLinecap="round" opacity=".35" />
        </g>
      ))}
      {/* Nasal cavity */}
      <path d="M100 78C95.5 83 93.5 88.5 95.5 92C97.5 93.5 99 92.5 100 90.5C101 92.5 102.5 93.5 104.5 92C106.5 88.5 104.5 83 100 78Z" fill="#0b0708" stroke="#060405" strokeWidth=".6" />
      <path d="M97.6 82.5C96.6 85 96.2 87.5 96.8 89.5" fill="none" stroke="#8d8178" strokeWidth=".7" opacity=".45" />
      <path d="M100 82.5V90" stroke="#3a3032" strokeWidth=".9" opacity=".8" />
      <path d="M98 74C99 76.5 101 76.5 102 74" fill="none" stroke="#a99d94" strokeWidth=".8" opacity=".4" />
      {/* Cheek foramina */}
      <ellipse cx="66" cy="89" rx="1.3" ry=".9" fill="#100c0d" />
      <ellipse cx="134" cy="89" rx="1.3" ry=".9" fill="#100c0d" />
      {/* Gum line, then the upper teeth hanging below the cranium's edge. */}
      <path d="M61 90H139V97H61Z" fill="#1d1718" />
      {UPPER_TEETH.map((d) => (
        <path key={d} d={d} fill={`url(#${uid}-tooth)`} stroke="#1a1416" strokeWidth=".8" strokeLinejoin="round" />
      ))}
      <ToothShading upper />
      <path d="M66 94H134" stroke="#f3ece0" strokeWidth=".6" opacity=".35" />
    </g>
  );
}

function Jaw({ uid }: { uid: string }) {
  return (
    <g>
      <path d={JAW} transform="translate(0 4)" fill="#151112" />
      <path d={JAW} fill={`url(#${uid}-jawbone)`} stroke="#120e10" strokeWidth="1.4" strokeLinejoin="round" />
      {/* Inner faces of the rami, in shadow, and the sigmoid notches. */}
      <path d="M55 72C57 82 57 92 58 99L52 104C49 94 48 82 50 74Z" fill="#000" opacity=".28" />
      <path d="M145 72C143 82 143 92 142 99L148 104C151 94 152 82 150 74Z" fill="#000" opacity=".34" />
      <path d="M41 72C41 86 42 100 46 112" fill="none" stroke="#9c9087" strokeWidth="1" strokeLinecap="round" opacity=".35" />
      <path d="M59 103H141V112H59Z" fill="#1d1718" />
      {LOWER_TEETH.map((d) => (
        <path key={d} d={d} fill={`url(#${uid}-tooth)`} stroke="#1a1416" strokeWidth=".8" strokeLinejoin="round" />
      ))}
      <ToothShading upper={false} />
      {JAW_PORES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#1a1415" opacity=".55" />)}
      {/* A hairline crack running down from the teeth. */}
      <path d="M112 112l2 6-3 5 2 6" fill="none" stroke="#151112" strokeWidth=".9" strokeLinejoin="round" />
      {/* Rami, chin and the two mental foramina. */}
      {/* Gonial angles and the oblique lines running forward to the chin. */}
      <path d="M45 114C49 120 52 124 56 127" fill="none" stroke="#1d1718" strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
      <path d="M155 114C151 120 148 124 144 127" fill="none" stroke="#1d1718" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
      <path d="M58 118C64 132 74 142 86 148" fill="none" stroke="#9c9087" strokeWidth=".9" strokeLinecap="round" opacity=".35" />
      <path d="M142 118C136 132 126 142 114 148" fill="none" stroke="#0f0b0c" strokeWidth=".9" strokeLinecap="round" opacity=".45" />
      <ellipse cx="80" cy="128" rx="2.4" ry="1.6" fill="#100c0d" />
      <ellipse cx="120" cy="128" rx="2.4" ry="1.6" fill="#100c0d" />
      <path d="M84 147C92 151 108 151 116 147" fill="none" stroke="#9c9087" strokeWidth="1.1" strokeLinecap="round" opacity=".4" />
      <path d="M90 140C95 143 105 143 110 140" fill="none" stroke="#1b1517" strokeWidth="1" strokeLinecap="round" opacity=".6" />
    </g>
  );
}

/** Light on each tooth's left face, shade on its right, and a root line. */
function ToothShading({ upper }: { upper: boolean }) {
  const y0 = upper ? 93 : 101;
  const y1 = upper ? 100 : 108.5;
  return (
    <g strokeLinecap="round">
      {Array.from({ length: 8 }, (_, i) => {
        const x = 64 + i * 9;
        return (
          <g key={i}>
            <path d={`M${x + 1.8} ${y0}V${y1}`} stroke="#fffaf0" strokeWidth=".9" opacity=".45" />
            <path d={`M${x + 7.4} ${y0}V${y1}`} stroke="#3b3230" strokeWidth="1.1" opacity=".45" />
            <path d={`M${x + 4.5} ${upper ? 92 : 110}v${upper ? 2.6 : -2.6}`} stroke="#5b4f47" strokeWidth=".6" opacity=".6" />
          </g>
        );
      })}
    </g>
  );
}

/** Pores and pitting, so the bone isn't a flat fill. */
const PORES = [
  [70, 48, 0.7], [84, 45, 0.5], [118, 50, 0.6], [134, 49, 0.8], [146, 60, 0.5], [55, 60, 0.6],
  [62, 52, 0.4], [108, 46, 0.45], [128, 58, 0.4], [150, 74, 0.55], [48, 74, 0.5], [92, 51, 0.4],
];
const JAW_PORES = [[70, 132, 0.6], [86, 143, 0.5], [118, 140, 0.6], [134, 128, 0.5], [100, 136, 0.45], [60, 120, 0.5], [142, 116, 0.45]];

/** Bone chips that fly from the teeth line on each bite. */
const CHIPS = [
  { x: -16, y: -9, r: 1.1 }, { x: 17, y: -7, r: 0.9 }, { x: -24, y: 5, r: 0.8 },
  { x: 25, y: 6, r: 1 }, { x: -8, y: 12, r: 0.7 }, { x: 10, y: -14, r: 0.8 },
];

function Front({ uid, phase, cycle }: DecorationLayerProps) {
  const play = phase === "play";
  return (
    <>
      <Defs uid={uid} />
      <g key={cycle} className={play ? "tnt-play" : undefined}>
        <g className="tnt-shake">
          <g className="tnt-jaw-idle di">
            <g className="tnt-jaw">
              <Jaw uid={uid} />
            </g>
          </g>
          <g className="tnt-cranium">
            <Cranium uid={uid} />
          </g>
          <g className="tnt-chips" fill="#cfc4b5">
            {CHIPS.map((c, i) => (
              <circle key={i} className={`tnt-chip tnt-chip-${i}`} cx={100 + c.x * 0.3} cy={101} r={c.r} style={{ ["--cx" as string]: `${c.x}px`, ["--cy" as string]: `${c.y}px` }} />
            ))}
          </g>
        </g>
      </g>
    </>
  );
}

export const treatNoTrick: DesignSpec = { cycleMs: 1150, gapMs: 1500, front: (p) => <Front {...p} /> };
