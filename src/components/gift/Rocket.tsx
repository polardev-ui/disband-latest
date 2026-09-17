"use client";

export function Rocket({ accent = "#fee75c", size = 190 }: { accent?: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.9} viewBox="0 0 120 228" aria-hidden className="dg-rocket">
      <defs>
        <linearGradient id="rk-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8a929c" />
          <stop offset="26%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#e4e8ee" />
          <stop offset="100%" stopColor="#98a1ab" />
        </linearGradient>
        <linearGradient id="rk-cone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c0392b" />
          <stop offset="34%" stopColor="#ff6b5a" />
          <stop offset="100%" stopColor="#a32b1e" />
        </linearGradient>
        <linearGradient id="rk-fin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a32b1e" />
          <stop offset="60%" stopColor="#e04a37" />
          <stop offset="100%" stopColor="#8d2317" />
        </linearGradient>
        <radialGradient id="rk-glass" cx="34%" cy="30%">
          <stop offset="0%" stopColor="#dff4ff" />
          <stop offset="45%" stopColor="#5ab7e8" />
          <stop offset="100%" stopColor="#1b5f87" />
        </radialGradient>
        <linearGradient id="rk-flame-o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd166" />
          <stop offset="45%" stopColor="#ff8c1a" />
          <stop offset="100%" stopColor="#ff4d2e" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="rk-flame-i" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#ffb020" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {}
      <g className="dg-flame">
        <path className="dg-flame-outer" d="M42 168c0 26 8 44 18 54 10-10 18-28 18-54Z" fill="url(#rk-flame-o)" />
        <path className="dg-flame-inner" d="M50 168c0 18 4 30 10 38 6-8 10-20 10-38Z" fill="url(#rk-flame-i)" />
      </g>

      {}
      <path d="M40 118 18 158c-2 4 0 8 4 8h18Z" fill="url(#rk-fin)" />
      <path d="M80 118l22 40c2 4 0 8-4 8H80Z" fill="url(#rk-fin)" />
      <path d="M52 150h16v22H52Z" fill="#6d7681" />

      {}
      <path d="M60 6c14 16 22 38 22 62v100H38V68C38 44 46 22 60 6Z" fill="url(#rk-body)" />
      {}
      <path d="M60 6c9 10 15 24 19 40H41c4-16 10-30 19-40Z" fill="url(#rk-cone)" />
      {}
      <rect x="38" y="112" width="44" height="12" fill={accent} opacity="0.9" />
      <rect x="38" y="130" width="44" height="4" fill="#aab2bc" opacity="0.7" />
      <rect x="38" y="140" width="44" height="4" fill="#aab2bc" opacity="0.5" />

      {}
      <circle cx="60" cy="78" r="17" fill="#7c8792" />
      <circle cx="60" cy="78" r="13.5" fill="url(#rk-glass)" />
      <path d="M50 72a12 12 0 0 1 12-7" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="3"
        strokeLinecap="round" fill="none" />

      {}
      <g transform="translate(48,150) scale(1)" opacity="0.85">
        <path d="M12 0.6 16.6 9 12 19.4 7.4 9Z" fill={accent} />
        <path d="M4.2 15.6h5.2L6.8 11.2Z" fill={accent} opacity="0.8" />
        <path d="M14.6 15.6h5.2L17.2 11.2Z" fill={accent} opacity="0.8" />
      </g>

      {}
      <path d="M46 166h28l-6 8H52Z" fill="#5b636d" />
    </svg>
  );
}
