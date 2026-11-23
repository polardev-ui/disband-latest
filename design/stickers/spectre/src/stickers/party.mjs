// "Party" – Spectre crouches, leaps with arms up, confetti bursts, lands with a squash and
// a little bounce. 2.4 s loop at 60 fps.

import * as G from '../lib/geom.mjs';
import { track, E, ease, rng } from '../lib/anim.mjs';
import { series, gr, shapeLayer } from '../lib/lottie.mjs';
import { confettiShape, sparkleShape } from '../lib/fx.mjs';

const N = 144;
const TAKEOFF = 18;
const LAND = 58;
const APEX = (TAKEOFF + LAND) / 2;
const HEIGHT = 34; // px

/** Jump height in sticker px (ballistic between take-off and landing). */
function height(f) {
  if (f <= TAKEOFF || f >= LAND) return 0;
  const u = (f - TAKEOFF) / (LAND - TAKEOFF);
  return HEIGHT * 4 * u * (1 - u);
}

// Squash and stretch (vertical scale), keyed around the jump.
const squash = track([
  [0, 1, E.inOutSine],
  [15, 0.86, E.inQuad], // crouch (anticipation)
  [20, 1.1, E.outQuad], // launch stretch
  [30, 1.04, E.inOutSine],
  [APEX, 0.98, E.inOutSine],
  [LAND - 4, 1.07, E.inQuad], // falling stretch
  [LAND + 2, 0.8, E.outQuad], // impact squash
  [LAND + 10, 1.06, E.inOutSine],
  [LAND + 17, 0.97, E.inOutSine],
  [LAND + 24, 1.01, E.inOutSine],
  [LAND + 30, 1, E.inOutSine],
  [N, 1],
]);

// Arm lift: 0 = down at the sides, 1 = up in a "yay".
const lift = track([
  [0, 0, E.inOutSine],
  [15, -0.35, E.overshoot], // swing back for momentum
  [26, 1.08, E.inOutSine],
  [34, 1, E.inOutSine],
  [LAND - 2, 0.95, E.inQuad],
  [LAND + 4, 0.7, E.outQuad], // arms drag down on impact
  [LAND + 14, 1.04, E.inOutSine],
  [LAND + 22, 1, E.inOutSine],
  [104, 1, E.anticipate],
  [113, -0.08, E.inOutSine],
  [121, 0, E.inOutSine],
  [N, 0],
]);

// Little celebratory arm pumps after landing.
const pump = (f) => (f > LAND + 22 && f < 104 ? Math.sin(((f - (LAND + 22)) / 20) * Math.PI * 2) * G.clamp((104 - f) / 10) : 0);

const happy = track([
  [0, 1],
  [N, 1],
]);

const dropping = (f) => (f > 102 && f < 118 ? 1 : 0) * Math.sin(Math.PI * G.clamp((f - 102) / 16));

// After settling: a slow breath and a little head tilt so the rest beat never freezes.
const settle = (f) => G.clamp((f - 118) / 10);

function pose(f) {
  const breathe = settle(f) * Math.sin(((f - 118) / (N - 118)) * Math.PI) * 0.018;
  const s = squash(f) + breathe;
  const h = height(f);
  const l = lift(f);
  const p = pump(f);
  const air = h / HEIGHT;
  return {
    root: { y: 308 - h, sy: 0.94 * s, sx: 0.94 / Math.pow(s, 0.85) },
    body: { y: 0 },
    head: {
      y: -6 * air + 10 * Math.max(0, 1 - s) * 2,
      r: 2 * Math.sin((f / N) * Math.PI * 4) * air + 2.5 * settle(f) * Math.sin(((f - 118) / (N - 118)) * Math.PI),
    },
    eyes: { happy: happy(f) },
    // On the way down the elbows bend in (a2 dips) so the arms fold rather than sweep out.
    armL: { a1: 40 + 92 * l + 6 * p, a2: -14 + 30 * l - 10 * p - 46 * Math.sin(Math.PI * G.clamp(l)) * dropping(f), hand: 6 * l },
    armR: { a1: 40 + 92 * l - 6 * p, a2: -14 + 30 * l + 10 * p - 46 * Math.sin(Math.PI * G.clamp(l)) * dropping(f), hand: 6 * l },
    legL: { y: -16 * air, r: 9 * air },
    legR: { y: -16 * air, r: -9 * air },
    shadow: { s: 1 - 0.45 * air, o: 1 - 0.55 * air },
  };
}

const CONFETTI = ['#4641D9', '#FF5EA8', '#FFC94D', '#2DD4BF', '#35C3F3', '#B9BCF5'];
const KINDS = ['rect', 'rect', 'squiggle', 'dot', 'tri', 'rect'];

function layers(ctx) {
  const n = ctx.N;
  const rand = rng(7);
  const burstAt = TAKEOFF + 8;
  const pieces = [];
  for (let k = 0; k < 20; k++) {
    const ang = -Math.PI / 2 + (rand() - 0.5) * 3.0;
    const speed = 4.2 + rand() * 3.0;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const spin = (rand() - 0.5) * 22;
    const flip = 0.16 + rand() * 0.14;
    const phase = rand() * Math.PI * 2;
    const delay = Math.floor(rand() * 4);
    const size = 9 + rand() * 6;
    const kind = KINDS[k % KINDS.length];
    const colour = CONFETTI[k % CONFETTI.length];
    const ox = 160 + (rand() - 0.5) * 60;
    const oy = 64 + (rand() - 0.5) * 24;
    const start = burstAt + delay;
    const life = (f) => f - start; // negative before the burst
    const at = (t) => {
      // Fast burst that slows (air drag), then a gentle flutter down.
      const drag = 1 - Math.exp(-t / 14);
      const x = ox + vx * 14 * drag + Math.sin(t * 0.09 + phase) * 6 * G.clamp(t / 30);
      const y = oy + vy * 14 * drag + 0.012 * Math.max(0, t - 8) ** 2 * 6;
      return [x, y];
    };
    const end = n - 6 - start;
    pieces.push(
      gr(`Confetti ${k + 1}`, confettiShape(kind, colour, size), {
        p: series(n, (f) => at(G.clamp(life(f), 0, end)), 0.3),
        r: series(n, (f) => spin * G.clamp(life(f), 0, end) * 0.6, 0.5),
        s: series(n, (f) => {
          const t = life(f);
          if (t < 0 || t >= end) return [0, 0];
          const pop = Math.min(1, t / 4);
          const fade = 1 - G.clamp((t - (end - 22)) / 22);
          const fx = kind === 'dot' ? 1 : Math.cos(t * flip + phase);
          return [100 * pop * fade * fx, 100 * pop * fade];
        }, 0.6),
      }),
    );
  }
  // Sparkles pop around the landing.
  const sparkles = [
    [94, 250, 8, LAND + 1],
    [228, 244, 10, LAND + 4],
    [250, 196, 6, LAND + 9],
  ].map(([x, y, r, t0], k) =>
    gr(`Sparkle ${k + 1}`, sparkleShape(r), {
      p: [x, y],
      s: series(n, (f) => {
        const t = f - t0;
        if (t < 0 || t > 24) return [0, 0];
        const k2 = 100 * ease.outBack(Math.min(1, t / 8), 2.4) * (1 - ease.inBack(G.clamp((t - 14) / 10)));
        return [Math.max(0, k2), Math.max(0, k2)];
      }),
      r: series(n, (f) => 3 * G.clamp(f - t0, 0, 24)),
    }),
  );
  return {
    back: [shapeLayer({ ind: 0, nm: 'Confetti (back)', op: n, shapes: pieces.filter((_, k) => k % 2 === 0) })],
    front: [
      shapeLayer({ ind: 0, nm: 'Confetti (front)', op: n, shapes: pieces.filter((_, k) => k % 2 === 1) }),
      shapeLayer({ ind: 0, nm: 'Sparkles', op: n, shapes: sparkles }),
    ],
  };
}

export default { id: 'party', name: 'Party', frames: N, pose, layers, ground: 308, secondary: { earGain: 0.8 } };
