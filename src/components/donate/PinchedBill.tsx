import { HAND, PINCH, type HandLayer } from "./pinched-bill-paths";

/*
 A hand reaching down from the top right and lifting a dollar bill by its
 corner. The hand is drawn from a posed skeleton (see pinched-bill-paths.ts)
 with flat skin tones, a shadow tone for volume, nails, knuckle creases and
 tendons. No background: it sits straight on the page, and the sleeve fades
 in from the top edge. After dropping in, the hand lifts and lowers while the
 bill sways from the pinch. Reduced motion gets the still picture.

 Outlines use paint-order="stroke" with a doubled width so only the outer
 half shows. The palm, knuckles and index finger share one silhouette
 (stroke pass, then fill pass) so there's no seam between them.
*/

const INK = "#1f1a17";
const SKIN = "#f5e1d1";
const SHADOW = "#ebcfbb";
const NAIL = "#fbeee5";
const CLAY = "#d97757";
const BILL = "#bfcaa3";
const BILL_FACE = "#faf9f5";
const MARK = "#b5bac1";

const S = 2.2; // visible outline width in the picture
const K = 1.45; // hand scale
const PX = 192; // where the pinch lands
const PY = 236;
const HAND_TRANSFORM = `translate(${PX} ${PY}) rotate(30) scale(${-K} ${K}) translate(${-PINCH[0]} ${-PINCH[1]})`;
const w = (n: number) => n / K; // stroke widths inside the scaled hand

function layerProps(kind: HandLayer[0]) {
  switch (kind) {
    case "outline":
      return { fill: SKIN, stroke: INK, strokeWidth: w(S * 2), strokeLinejoin: "round" as const, paintOrder: "stroke" };
    case "shadow":
      return { fill: SHADOW };
    case "nail":
      return { fill: NAIL, stroke: INK, strokeWidth: w(S * 0.55), strokeLinejoin: "round" as const };
    case "line":
      return { fill: "none", stroke: INK, strokeWidth: w(S * 0.55), strokeLinecap: "round" as const };
    case "faint":
      return { fill: "none", stroke: INK, strokeWidth: w(S * 0.5), strokeLinecap: "round" as const, opacity: 0.28 };
    case "sleeve":
      return { fill: CLAY, stroke: INK, strokeWidth: w(S * 2), strokeLinejoin: "round" as const, paintOrder: "stroke" };
  }
}

function Layers({ items }: { items: readonly HandLayer[] }) {
  return (
    <>
      {items.map(([kind, d], i) => (
        <path key={i} d={d} {...layerProps(kind)} />
      ))}
    </>
  );
}

const silhouette = { fill: INK, stroke: INK, strokeWidth: w(S * 2), strokeLinejoin: "round" as const };

export function PinchedBill({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <style>{`
        .pb-enter { animation: pb-enter 1.1s cubic-bezier(.2,.8,.2,1) both; }
        .pb-lift { animation: pb-lift 3.8s ease-in-out 1.1s infinite; }
        .pb-sway { transform-box: view-box; transform-origin: ${PX}px ${PY}px; animation: pb-sway 3.8s ease-in-out 1.1s infinite; }
        .pb-dash { opacity: 0; animation: pb-dash 3.8s ease-in-out 1.1s infinite; }
        .pb-spark { transform-box: fill-box; transform-origin: center; opacity: 0; animation: pb-spark 3.8s ease-in-out 1.4s infinite; }
        @keyframes pb-enter { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: none; } }
        @keyframes pb-lift { 0%, 100% { transform: translateY(0); } 45%, 55% { transform: translateY(-16px); } }
        @keyframes pb-sway { 0%, 100% { transform: rotate(0deg); } 28% { transform: rotate(3.5deg); } 62% { transform: rotate(-3deg); } }
        @keyframes pb-dash { 0%, 22%, 100% { opacity: 0; } 45% { opacity: .55; } 68% { opacity: 0; } }
        @keyframes pb-spark { 0%, 20%, 100% { opacity: 0; transform: scale(.3) rotate(0deg); } 45% { opacity: .7; transform: scale(1) rotate(20deg); } 70% { opacity: 0; transform: scale(.5) rotate(40deg); } }
        @media (prefers-reduced-motion: reduce) {
          .pb-enter, .pb-lift, .pb-sway, .pb-dash, .pb-spark { animation: none; }
          .pb-dash, .pb-spark { opacity: 0; }
        }
      `}</style>
      <svg
        viewBox="0 0 400 440"
        role="img"
        aria-label="Illustration of a hand lifting a dollar bill by its corner"
        className="h-auto w-full overflow-visible"
      >
        <defs>
          {/* The arm comes in from off the page rather than stopping at a hard edge. */}
          <linearGradient id="pb-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="70">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="pb-top" maskUnits="userSpaceOnUse" x="-100" y="-100" width="600" height="640">
            <rect x="-100" y="-100" width="600" height="640" fill="url(#pb-fade)" />
          </mask>
          {/* Hides the base of the thumb inside the palm. */}
          <mask id="pb-thumb" maskUnits="userSpaceOnUse" x="-600" y="-600" width="1400" height="1400">
            <rect x="-600" y="-600" width="1400" height="1400" fill="#fff" />
            <path d={HAND.palm} fill="#000" />
          </mask>
        </defs>

        {/* Little marks that flash as the bill goes up. */}
        <g stroke={MARK} strokeWidth={S} strokeLinecap="round" fill="none">
          <g className="pb-dash">
            <path d="M84 318 l -18 -8" />
            <path d="M76 348 l -22 -2" />
            <path d="M90 378 l -16 8" />
          </g>
          <path className="pb-spark" d="M322 300 v 22 M311 311 h 22" />
          <path className="pb-spark" style={{ animationDelay: "1.8s" }} d="M70 220 v 14 M63 227 h 14" />
        </g>

        <g mask="url(#pb-top)">
          <g className="pb-enter">
            <g className="pb-lift">
              {/* Back fingers, curled behind the index. */}
              <g transform={HAND_TRANSFORM}>
                <Layers items={HAND.back} />
                <path d={HAND.fist} {...silhouette} />
                <path d={HAND.palm} {...silhouette} />
                <path d={HAND.index} {...silhouette} />
                <path d={HAND.fist} fill={SKIN} />
                <path d={HAND.palm} fill={SKIN} />
                <path d={HAND.index} fill={SKIN} />
                <Layers items={HAND.mid} />
              </g>

              {/* The bill hangs from the pinch, between index finger and thumb. */}
              <g className="pb-sway">
                <g transform={`translate(${PX} ${PY}) rotate(-56) scale(.8)`} strokeLinejoin="round" strokeLinecap="round">
                  <path
                    d="M6 -4 C -60 4 -140 -6 -204 4 L -200 96 C -138 88 -62 98 4 90 Z"
                    fill={BILL}
                    stroke={INK}
                    strokeWidth={S * 2}
                    paintOrder="stroke"
                  />
                  <path
                    d="M-10 9 C -70 15 -134 7 -190 14 L -187 82 C -132 76 -70 84 -9 78 Z"
                    fill="none"
                    stroke={INK}
                    strokeWidth={S * 0.7}
                  />
                  <ellipse cx="-99" cy="46" rx="22" ry="27" fill={BILL_FACE} stroke={INK} strokeWidth={S} />
                  <path
                    d="M-91 35 C -94 29 -106 29 -106 37 C -106 45 -91 44 -91 53 C -91 61 -105 61 -108 55 M-99 24 L -99 67"
                    fill="none"
                    stroke={INK}
                    strokeWidth={S}
                  />
                  <circle cx="-172" cy="31" r="7" fill="none" stroke={INK} strokeWidth={S * 0.8} />
                  <circle cx="-27" cy="62" r="7" fill="none" stroke={INK} strokeWidth={S * 0.8} />
                </g>
              </g>

              {/* Thumb in front of the bill, then the sleeve over the wrist. */}
              <g transform={HAND_TRANSFORM}>
                <g mask="url(#pb-thumb)">
                  <Layers items={HAND.thumb} />
                </g>
                <Layers items={HAND.sleeve} />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
