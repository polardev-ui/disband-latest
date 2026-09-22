"use client";

/**
 * Profile effects, drawn rather than tiled.
 *
 * The first pass at these was repeating gradients — dots on a moving
 * background — which reads as filler the moment you look at it. Each effect
 * here is instead an authored SVG scene: real geometry, its own palette, its
 * own choreography, with elements on staggered timings so the loop does not
 * pulse in unison.
 *
 * Conventions every scene follows:
 *   - viewBox 0 0 400 300, preserveAspectRatio "none" so it fills any card;
 *   - no layout animation, only transform/opacity, so it stays cheap;
 *   - motion lives in CSS classes defined in shop-effects.css, so
 *     prefers-reduced-motion can switch all of it off in one place;
 *   - `--d` on an element sets its delay, which is what keeps twenty petals
 *     from falling as one sheet.
 */

interface SceneProps {
  className?: string;
}

/** Deterministic pseudo-random, so a scene looks scattered but never reflows. */
function spread(count: number, seed: number): number[] {
  const out: number[] = [];
  let v = seed;
  for (let i = 0; i < count; i++) {
    v = (v * 9301 + 49297) % 233280;
    out.push(v / 233280);
  }
  return out;
}

/** SSR and the client must agree to the last digit, or React reports a
 *  hydration mismatch on the coordinate. */
const round = (n: number) => Math.round(n * 100) / 100;

const FRAME = {
  viewBox: "0 0 400 300",
  preserveAspectRatio: "none" as const,
  className: "absolute inset-0 h-full w-full",
};

/* ------------------------------------------------------------ Hydro Bloom */

/** Water: heavy blobs rising, stretching, and popping into a ring of droplets. */
export function HydroScene({ className = "" }: SceneProps) {
  const blobs = spread(7, 17);
  return (
    <svg {...FRAME} className={`${FRAME.className} ${className}`} aria-hidden>
      <defs>
        <radialGradient id="fx-hydro-body" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#bfefff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#3fb9ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0b6fd4" stopOpacity="0.55" />
        </radialGradient>
        <filter id="fx-hydro-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* A slow body of water across the bottom, so the blobs have a source. */}
      <path
        className="fx-svg-swell"
        d="M-40 250 Q 60 224 160 250 T 360 250 T 560 250 L560 320 L-40 320Z"
        fill="url(#fx-hydro-body)"
        opacity="0.55"
      />

      {blobs.map((r, i) => {
        const x = 30 + r * 340;
        const size = 9 + r * 16;
        return (
          <g key={i} style={{ ["--d" as string]: `${(i * 0.9).toFixed(2)}s` }}>
            <ellipse
              className="fx-svg-bubble-rise"
              cx={x}
              cy={280}
              rx={size}
              ry={size * 1.18}
              fill="url(#fx-hydro-body)"
              filter="url(#fx-hydro-glow)"
            />
            {/* The highlight sells it as water rather than a circle. */}
            <ellipse
              className="fx-svg-bubble-rise"
              cx={x - size * 0.3}
              cy={280 - size * 0.35}
              rx={size * 0.26}
              ry={size * 0.18}
              fill="#eaffff"
              opacity="0.85"
            />
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------- Emberfall */

/** Fire: a bed of coals with sparks that rise, curl, and burn out. */
export function EmberScene({ className = "" }: SceneProps) {
  const sparks = spread(26, 91);
  const sparkDelays = spread(26, 3313);
  return (
    <svg {...FRAME} className={`${FRAME.className} ${className}`} aria-hidden>
      <defs>
        <radialGradient id="fx-ember-coal" cx="50%" cy="100%">
          <stop offset="0%" stopColor="#ff8a1f" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#c62700" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3a0a00" stopOpacity="0" />
        </radialGradient>
        <filter id="fx-ember-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <ellipse className="fx-svg-coalbed" cx="200" cy="300" rx="230" ry="70" fill="url(#fx-ember-coal)" />

      {sparks.map((r, i) => {
        const x = round(20 + r * 360);
        const size = 2.2 + r * 3.4;
        const warm = i % 3 === 0 ? "#ffd27a" : i % 3 === 1 ? "#ff8a3d" : "#ff4d1c";
        return (
          <circle
            key={i}
            className={i % 2 ? "fx-svg-spark fx-svg-spark-b" : "fx-svg-spark"}
            cx={x}
            cy={290}
            r={size}
            fill={warm}
            filter="url(#fx-ember-glow)"
            style={{ ["--d" as string]: `${(sparkDelays[i] * 5.5).toFixed(2)}s` }}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------- Petal Drift */

/** Blossom: shaped petals that fall on sine paths and turn as they go. */
export function PetalScene({ className = "" }: SceneProps) {
  const petals = spread(14, 401);
  const delays = spread(14, 9127);
  const scales = spread(14, 5501);
  return (
    <svg {...FRAME} className={`${FRAME.className} ${className}`} aria-hidden>
      <defs>
        <linearGradient id="fx-petal-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd6e8" />
          <stop offset="100%" stopColor="#ff86b8" />
        </linearGradient>
        <linearGradient id="fx-petal-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1f6" />
          <stop offset="100%" stopColor="#ffa9cd" />
        </linearGradient>
      </defs>

      {petals.map((r, i) => {
        const x = round(10 + r * 380);
        const s = 0.55 + scales[i] * 0.7;
        return (
          <g
            key={i}
            className="fx-svg-petal-fall"
            style={{ ["--d" as string]: `${(delays[i] * 11).toFixed(2)}s`, ["--x" as string]: `${x}px` }}
          >
            <g className="fx-svg-petal-spin" transform={`scale(${s.toFixed(2)})`}>
              {/* A real petal outline: one curved lobe with a notch, not a dot. */}
              <path
                d="M0 0 C 7 -6, 15 -3, 14 5 C 13 12, 5 15, 0 11 C -4 8, -4 4, 0 0 Z"
                fill={i % 2 ? "url(#fx-petal-a)" : "url(#fx-petal-b)"}
                opacity="0.95"
              />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/* --------------------------------------------------------------- Starfall */

/** Night sky: a slow field, plus meteors that streak and fade on a long cycle. */
export function StarfallScene({ className = "" }: SceneProps) {
  const stars = spread(30, 733);
  const meteors = spread(3, 88);
  return (
    <svg {...FRAME} className={`${FRAME.className} ${className}`} aria-hidden>
      <defs>
        <linearGradient id="fx-meteor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="70%" stopColor="#cfe4ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <filter id="fx-star-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>

      {stars.map((r, i) => {
        const x = r * 400;
        const y = ((i * 97) % 300);
        return (
          <circle
            key={i}
            className="fx-svg-twinkle"
            cx={x}
            cy={y}
            r={0.7 + r * 1.5}
            fill={i % 5 === 0 ? "#bcd4ff" : "#ffffff"}
            filter="url(#fx-star-glow)"
            style={{ ["--d" as string]: `${(r * 4).toFixed(2)}s` }}
          />
        );
      })}

      {meteors.map((r, i) => (
        <g
          key={`m${i}`}
          className="fx-svg-meteor"
          style={{ ["--d" as string]: `${(i * 3.7 + r * 2).toFixed(2)}s` }}
        >
          <line x1="0" y1="0" x2="54" y2="30" stroke="url(#fx-meteor)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="54" cy="30" r="1.8" fill="#ffffff" />
        </g>
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- Tempest */

/** Storm: rain on a slant, with a forked bolt and a flash on a long cycle. */
export function TempestScene({ className = "" }: SceneProps) {
  const drops = spread(34, 1201);
  return (
    <svg {...FRAME} className={`${FRAME.className} ${className}`} aria-hidden>
      <defs>
        <linearGradient id="fx-rain-drop" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#9ec9ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#dbeeff" stopOpacity="0.9" />
        </linearGradient>
        <filter id="fx-bolt-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect className="fx-svg-flash" x="0" y="0" width="400" height="300" fill="#cfe4ff" opacity="0" />

      {drops.map((r, i) => (
        <line
          key={i}
          className="fx-svg-raindrop"
          x1={r * 420 - 20}
          y1="-30"
          x2={r * 420 - 32}
          y2="-6"
          stroke="url(#fx-rain-drop)"
          strokeWidth={0.9 + r}
          strokeLinecap="round"
          style={{ ["--d" as string]: `${(r * 1.1).toFixed(2)}s` }}
        />
      ))}

      <path
        className="fx-svg-bolt"
        d="M232 -10 L206 96 L238 92 L196 214 L214 118 L184 124 Z"
        fill="#eaf4ff"
        filter="url(#fx-bolt-glow)"
      />
    </svg>
  );
}

/* ------------------------------------------------------------- Arcane Rune */

/** Magic: two counter-rotating rune rings with a breathing sigil between them. */
export function RuneScene({ className = "" }: SceneProps) {
  const glyphs = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ".split("");
  return (
    <svg {...FRAME} className={`${FRAME.className} ${className}`} aria-hidden>
      <defs>
        <radialGradient id="fx-rune-core" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#e6c8ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
        </radialGradient>
        <filter id="fx-rune-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle className="fx-svg-rune-core" cx="200" cy="150" r="120" fill="url(#fx-rune-core)" />

      <g className="fx-svg-rune-ring" style={{ transformOrigin: "200px 150px" }}>
        <circle cx="200" cy="150" r="96" fill="none" stroke="#c4b5fd" strokeWidth="1.2" opacity="0.5" />
        {glyphs.map((g, i) => {
          const a = (i / glyphs.length) * Math.PI * 2;
          return (
            <text
              key={i}
              x={round(200 + Math.cos(a) * 96)}
              y={round(150 + Math.sin(a) * 96)}
              fill="#ddd0ff"
              fontSize="15"
              textAnchor="middle"
              dominantBaseline="middle"
              filter="url(#fx-rune-glow)"
            >
              {g}
            </text>
          );
        })}
      </g>

      <g className="fx-svg-rune-ring-rev" style={{ transformOrigin: "200px 150px" }}>
        <circle cx="200" cy="150" r="58" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.65" strokeDasharray="7 11" />
        <path
          d="M200 104 L239 173 L161 173 Z"
          fill="none"
          stroke="#e9d5ff"
          strokeWidth="1.3"
          filter="url(#fx-rune-glow)"
          opacity="0.8"
        />
      </g>
    </svg>
  );
}

/** Every authored scene, by shop item id. */
export const PROFILE_SCENES: Record<string, (p: SceneProps) => React.ReactElement> = {
  "fx-hydro": HydroScene,
  "fx-embers": EmberScene,
  "fx-petals": PetalScene,
  "fx-starfall": StarfallScene,
  "fx-tempest": TempestScene,
  "fx-rune": RuneScene,
};
