/*
 The 2.33 header: a cemetery under an orange moon, bats crossing it, and the
 Disband mark with the wordmark in the middle. Drawn in SVG so it stays sharp
 at any size; the bats flap with a small CSS loop (still under reduced motion).
*/

/** One bat at the origin, wings out; `.sb-wing` groups flap. */
function Bat({ x, y, s, delay }: { x: number; y: number; s: number; delay: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="sb-bat" style={{ animationDelay: `${delay}s` }}>
        <path className="sb-wing sb-wing-l" d="M0 0C-3 -5 -9 -6 -14 -3C-11 -2 -10 1 -12 3C-9 1 -6 2 -5 4C-4 1 -2 1 0 2Z" fill="#0b0710" />
        <path className="sb-wing sb-wing-r" d="M0 0C3 -5 9 -6 14 -3C11 -2 10 1 12 3C9 1 6 2 5 4C4 1 2 1 0 2Z" fill="#0b0710" />
        <ellipse cx="0" cy="1" rx="1.8" ry="2.6" fill="#0b0710" />
        <path d="M-1.4 -1.4L-1 -3.2L-.3 -1.6M1.4 -1.4L1 -3.2L.3 -1.6" fill="#0b0710" />
      </g>
    </g>
  );
}

function Tomb({ x, h, w = 14, cross = false, tilt = 0 }: { x: number; h: number; w?: number; cross?: boolean; tilt?: number }) {
  const base = 176;
  return (
    <g transform={`rotate(${tilt} ${x} ${base})`} fill="#120c16">
      {cross ? (
        <path d={`M${x - 1.6} ${base}V${base - h}H${x + 1.6}V${base}ZM${x - 6} ${base - h + 6}H${x + 6}V${base - h + 9.5}H${x - 6}Z`} />
      ) : (
        <path d={`M${x - w / 2} ${base}V${base - h + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${base - h + w / 2}V${base}Z`} />
      )}
    </g>
  );
}

export function SpookyBanner() {
  return (
    <div className="relative overflow-hidden" style={{ aspectRatio: "480 / 200" }}>
      <style>{`
        .sb-wing { transform-box: fill-box; animation: sb-flap .32s ease-in-out infinite alternate; }
        .sb-wing-l { transform-origin: 100% 0%; }
        .sb-wing-r { transform-origin: 0% 0%; }
        @keyframes sb-flap { from { transform: scaleY(1); } to { transform: scaleY(-.35); } }
        .sb-fog { animation: sb-drift 14s ease-in-out infinite alternate; }
        @keyframes sb-drift { from { transform: translateX(-12px); } to { transform: translateX(12px); } }
        @media (prefers-reduced-motion: reduce) { .sb-wing, .sb-fog { animation: none; } }
      `}</style>
      <svg viewBox="0 0 480 200" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="sb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14091f" />
            <stop offset=".6" stopColor="#3a1730" />
            <stop offset="1" stopColor="#7a2e12" />
          </linearGradient>
          <radialGradient id="sb-moon-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ff9a3c" stopOpacity=".55" />
            <stop offset="1" stopColor="#ff7a18" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sb-moon" cx="40%" cy="38%" r="65%">
            <stop offset="0" stopColor="#ffe2b0" />
            <stop offset="1" stopColor="#ff9d3d" />
          </radialGradient>
          <linearGradient id="sb-fog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb27a" stopOpacity="0" />
            <stop offset="1" stopColor="#ffb27a" stopOpacity=".22" />
          </linearGradient>
          <radialGradient id="sb-vignette" cx="50%" cy="45%" r="70%">
            <stop offset=".6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".55" />
          </radialGradient>
        </defs>
        <rect width="480" height="200" fill="url(#sb-sky)" />
        {/* Stars */}
        {[[30, 22], [70, 48], [120, 18], [160, 40], [330, 24], [380, 52], [430, 20], [455, 60], [260, 14], [210, 30]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 0.8 : 1.2} fill="#ffe7c7" opacity={i % 2 ? 0.5 : 0.85} />
        ))}
        {/* Moon behind the logo */}
        <circle cx="240" cy="82" r="78" fill="url(#sb-moon-glow)" />
        <circle cx="240" cy="82" r="46" fill="url(#sb-moon)" opacity=".9" />
        <path d="M222 70a6 4 0 1 0 1 0ZM255 98a8 5 0 1 0 1 0ZM262 66a4 3 0 1 0 1 0Z" fill="#e8822f" opacity=".35" />
        {/* Far hills */}
        <path d="M0 160C60 140 110 150 160 142C220 132 260 150 320 140C380 130 430 146 480 138V200H0Z" fill="#24102a" />
        {/* Dead tree, left */}
        <path d="M58 176V120C58 112 50 104 40 100M58 128C64 118 74 112 86 112M58 140C50 134 42 134 34 138M40 100C36 96 34 90 36 84M86 112C92 108 94 102 92 96" stroke="#120c16" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* Iron fence */}
        <g stroke="#120c16" strokeWidth="2">
          <path d="M300 160H480M300 168H480" />
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d={`M${306 + i * 11} 176V152l-2.5 -4 2.5 -3 2.5 3 -2.5 4`} fill="#120c16" />
          ))}
        </g>
        {/* Graves */}
        <path d="M0 176C80 170 160 174 240 172C320 170 400 174 480 172V200H0Z" fill="#0e0912" />
        <Tomb x={110} h={30} />
        <Tomb x={140} h={22} w={12} tilt={-6} />
        <Tomb x={170} h={34} cross />
        <Tomb x={332} h={26} tilt={5} />
        <Tomb x={364} h={36} w={16} />
        <Tomb x={398} h={28} cross tilt={-4} />
        <Tomb x={440} h={22} w={12} />
        {/* Low fog */}
        <g className="sb-fog">
          <rect x="-20" y="150" width="520" height="50" fill="url(#sb-fog)" />
        </g>
        {/* Bats */}
        <Bat x={96} y={44} s={1.1} delay={0} />
        <Bat x={140} y={70} s={0.7} delay={0.12} />
        <Bat x={360} y={40} s={1.2} delay={0.2} />
        <Bat x={400} y={78} s={0.8} delay={0.07} />
        <Bat x={318} y={92} s={0.55} delay={0.16} />
        <rect width="480" height="200" fill="url(#sb-vignette)" />
      </svg>
      {/* Logo and wordmark, centred on the moon */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.png" alt="" className="h-14 w-14 drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]" draggable={false} />
        <span className="mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">Disband</span>
        <span className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffb15c]">Version 2.33</span>
      </div>
    </div>
  );
}
