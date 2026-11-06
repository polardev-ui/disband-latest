/*
 A hand-drawn hand pinching a dollar bill and lifting it. Everything is
 inline SVG: the lines draw themselves in once, then the hand bobs and the
 bill sways from the pinch. A turbulence filter wobbles the strokes so it
 reads as ink, not vector art. Reduced motion gets the finished drawing.
*/

const INK = "#f2f3f5";
const BILL_INK = "#86dca3";
const BILL_FILL = "#1d3a28";
const PAGE = "#1e1f22";

// The pinch: the bill's corner sits here, under the fingertips.
const PX = 184;
const PY = 108;

export function PinchedBill({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <style>{`
        .dn-ink { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dn-draw 1.3s cubic-bezier(.6,.1,.3,1) forwards; }
        .dn-fill { opacity: 0; animation: dn-fade .5s ease-out forwards; }
        .dn-lift { animation: dn-lift 3.4s ease-in-out 1.9s infinite; }
        .dn-sway { transform-box: view-box; transform-origin: ${PX}px ${PY}px; animation: dn-sway 3.4s ease-in-out 1.9s infinite; }
        .dn-spark { transform-box: fill-box; transform-origin: center; opacity: 0; animation: dn-spark 3.4s ease-in-out 2.2s infinite; }
        .dn-motion { opacity: 0; animation: dn-motion 3.4s ease-in-out 1.9s infinite; }
        @keyframes dn-draw { to { stroke-dashoffset: 0; } }
        @keyframes dn-fade { to { opacity: 1; } }
        @keyframes dn-lift { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-14px); } 60% { transform: translateY(-12px); } }
        @keyframes dn-sway { 0%, 100% { transform: rotate(0deg); } 30% { transform: rotate(4deg); } 65% { transform: rotate(-3deg); } }
        @keyframes dn-spark { 0%, 20%, 100% { opacity: 0; transform: scale(.4) rotate(0deg); } 45% { opacity: 1; transform: scale(1) rotate(25deg); } 70% { opacity: 0; transform: scale(.6) rotate(45deg); } }
        @keyframes dn-motion { 0%, 25%, 100% { opacity: 0; } 45% { opacity: .7; } 65% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .dn-ink { animation: none; stroke-dashoffset: 0; }
          .dn-fill { animation: none; opacity: 1; }
          .dn-lift, .dn-sway, .dn-motion, .dn-spark { animation: none; }
        }
      `}</style>
      <svg
        viewBox="0 0 360 330"
        role="img"
        aria-label="A hand-drawn hand pinching a dollar bill and lifting it up"
        className="h-auto w-full"
      >
        <defs>
          <filter id="dn-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        {/* Ground scribble, so the lift has something to lift away from. */}
        <g filter="url(#dn-rough)" stroke={INK} strokeOpacity={0.25} strokeWidth={2.4} fill="none" strokeLinecap="round">
          <path className="dn-ink" pathLength={1} style={{ animationDelay: "1.1s" }} d="M40 318 C 100 314, 170 320, 240 315 S 310 317, 330 314" />
        </g>

        {/* Speed lines and sparkles that show on each lift. */}
        <g filter="url(#dn-rough)" stroke={BILL_INK} strokeWidth={2.6} fill="none" strokeLinecap="round">
          <g className="dn-motion">
            <path d="M28 214 l -16 8" />
            <path d="M40 240 l -18 6" />
            <path d="M62 262 l -14 10" />
          </g>
          <path className="dn-spark" d="M286 150 v 18 M277 159 h 18" />
          <path className="dn-spark" style={{ animationDelay: "2.5s" }} d="M70 120 v 12 M64 126 h 12" />
          <path className="dn-spark" style={{ animationDelay: "2.8s" }} d="M300 214 v 10 M295 219 h 10" />
        </g>

        <g className="dn-lift">
          {/* The bill, hanging from its corner. */}
          <g className="dn-sway">
            <g transform={`rotate(-46 ${PX} ${PY})`} filter="url(#dn-rough)" strokeLinecap="round" strokeLinejoin="round">
              <rect className="dn-fill" style={{ animationDelay: ".9s" }} x={PX - 190} y={PY} width={190} height={84} rx={5} fill={BILL_FILL} />
              <rect className="dn-ink" pathLength={1} x={PX - 190} y={PY} width={190} height={84} rx={5} fill="none" stroke={BILL_INK} strokeWidth={3} />
              <rect className="dn-ink" pathLength={1} style={{ animationDelay: ".35s" }} x={PX - 181} y={PY + 9} width={172} height={66} rx={3} fill="none" stroke={BILL_INK} strokeWidth={1.8} strokeOpacity={0.8} />
              {/* Portrait oval and a few lines of "engraving". */}
              <ellipse className="dn-ink" pathLength={1} style={{ animationDelay: ".55s" }} cx={PX - 95} cy={PY + 42} rx={18} ry={24} fill="none" stroke={BILL_INK} strokeWidth={2.2} />
              <path className="dn-ink" pathLength={1} style={{ animationDelay: ".75s" }} d={`M${PX - 89} ${PY + 35} a 6 6 0 1 1 -12 0 a 6 6 0 1 1 12 0 M${PX - 106} ${PY + 58} c 2 -11, 20 -11, 22 0`} fill="none" stroke={BILL_INK} strokeWidth={1.8} />
              <path className="dn-ink" pathLength={1} style={{ animationDelay: ".8s" }} d={`M${PX - 66} ${PY + 30} h 44 M${PX - 66} ${PY + 42} h 36 M${PX - 66} ${PY + 54} h 40`} fill="none" stroke={BILL_INK} strokeWidth={1.6} strokeOpacity={0.7} />
              {/* The dollar sign. */}
              <path
                className="dn-ink"
                pathLength={1}
                style={{ animationDelay: ".65s" }}
                d={`M${PX - 150} ${PY + 30} c -4 -6, -18 -6, -18 2 c 0 8, 18 6, 18 15 c 0 9, -15 9, -19 2 M${PX - 159} ${PY + 22} v 34`}
                fill="none"
                stroke={BILL_INK}
                strokeWidth={2.6}
              />
              {/* Corner numerals. */}
              <path className="dn-ink" pathLength={1} style={{ animationDelay: ".9s" }} d={`M${PX - 176} ${PY + 20} l 4 -4 v 12 M${PX - 22} ${PY + 66} l 4 -4 v 12`} fill="none" stroke={BILL_INK} strokeWidth={1.8} />
            </g>
          </g>

          {/* The hand, coming down from the top right. Filled with the page
              colour so it sits in front of the bill's pinched corner. */}
          <g filter="url(#dn-rough)" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path
              className="dn-fill"
              style={{ animationDelay: ".2s" }}
              fill={PAGE}
              stroke="none"
              d="M214 -10 L214 -4 C 212 18, 208 40, 198 56 C 186 72, 172 88, 166 102 C 162 112, 167 120, 178 118 C 189 116, 195 108, 198 98 C 203 86, 210 78, 222 74 C 234 76, 240 86, 238 96 C 236 104, 244 108, 250 102 C 258 96, 260 86, 256 78 C 264 80, 270 74, 268 64 C 266 52, 272 30, 276 -4 L276 -10 Z"
            />
            <path
              className="dn-ink"
              pathLength={1}
              fill="none"
              d="M214 -4 C 212 18, 208 40, 198 56 C 186 72, 172 88, 166 102 C 162 112, 167 120, 178 118 C 189 116, 195 108, 198 98 C 203 86, 210 78, 222 74 C 234 76, 240 86, 238 96 C 236 104, 244 108, 250 102 C 258 96, 260 86, 256 78 C 264 80, 270 74, 268 64 C 266 52, 272 30, 276 -4"
            />
            {/* Sleeve cuff. */}
            <path className="dn-ink" pathLength={1} style={{ animationDelay: ".5s" }} fill="none" d="M207 20 C 230 26, 254 26, 278 18" />
            <path className="dn-ink" pathLength={1} style={{ animationDelay: ".6s" }} fill="none" strokeWidth={2} d="M206 30 C 230 35, 254 35, 277 28" />
            {/* Thumbnail, thumb crease, knuckle and finger lines. */}
            <path className="dn-ink" pathLength={1} style={{ animationDelay: ".8s" }} fill="none" strokeWidth={2} d="M168 106 C 170 111, 175 113, 179 112" />
            <path className="dn-ink" pathLength={1} style={{ animationDelay: ".9s" }} fill="none" strokeWidth={2} d="M200 62 C 196 74, 192 84, 186 92" />
            <path className="dn-ink" pathLength={1} style={{ animationDelay: "1s" }} fill="none" strokeWidth={2} d="M206 94 C 210 98, 214 98, 217 94" />
            <path className="dn-ink" pathLength={1} style={{ animationDelay: "1.05s" }} fill="none" strokeWidth={1.8} d="M238 96 C 234 90, 230 86, 224 86" />
            <path className="dn-ink" pathLength={1} style={{ animationDelay: "1.1s" }} fill="none" strokeWidth={1.8} d="M256 78 C 252 74, 248 72, 244 73" />
          </g>
        </g>
      </svg>
    </div>
  );
}
