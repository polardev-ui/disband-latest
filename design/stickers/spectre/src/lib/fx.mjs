// Effect shapes (hearts, tears, confetti, sparkles, lettering, motion marks) in sticker pixels.

import * as G from './geom.mjs';
import { sh, fl, st, gr } from './lottie.mjs';
import { PAL } from './spectre.mjs';

export const FX_LINE = 3.4; // outline width for effects, in sticker px

/** A heart with its shading drawn as two fills (shade under the main body, offset). */
export function heartBody(size, opts = {}) {
  const { fill = PAL.heart, shade = PAL.heartShade, hi = PAL.heartHi, line = FX_LINE } = opts;
  const h = G.heart(0, 0, size);
  const lit = G.translatePath(G.scalePath(h, 0.84, 0.84, [0, -size * 0.06]), [-size * 0.05, -size * 0.04]);
  return [
    gr('Glint', [
      sh(G.smooth([{ p: [-size * 0.36, -size * 0.02] }, { p: [-size * 0.31, -size * 0.15] }, { p: [-size * 0.19, -size * 0.22] }], false)),
      st(hi, Math.max(1.6, size * 0.07), { cap: 2 }),
    ]),
    gr('Outline', [sh(h), st(PAL.line, line)]),
    gr('Lit', [sh(lit), fl(fill)]),
    gr('Base', [sh(h), fl(shade)]),
  ];
}

export function tearShape(r) {
  const d = G.drop(0, 0, r);
  return [
    gr('Glint', [sh(G.ellipse(-r * 0.35, -r * 0.15, r * 0.22, r * 0.34)), fl(PAL.tearHi)]),
    gr('Drop', [sh(d), st(PAL.line, Math.max(1.8, r * 0.38)), fl(PAL.tear)]),
  ];
}

export function sparkleShape(r, colour = '#FFE27A') {
  return [gr('Sparkle', [sh(G.sparkle(0, 0, r, 0.2)), st(PAL.line, Math.max(1.6, r * 0.22)), fl(colour)])];
}

/** Confetti piece; kind: 'rect' | 'dot' | 'squiggle' | 'tri'. */
export function confettiShape(kind, colour, size) {
  if (kind === 'dot') return [gr('Dot', [sh(G.ellipse(0, 0, size * 0.5, size * 0.5)), st(PAL.line, 2), fl(colour)])];
  if (kind === 'tri')
    return [
      gr('Tri', [
        sh(G.poly([[0, -size * 0.6], [size * 0.55, size * 0.4], [-size * 0.55, size * 0.4]], true)),
        st(PAL.line, 2, { join: 2 }),
        fl(colour),
      ]),
    ];
  if (kind === 'squiggle')
    return [
      gr('Squiggle', [
        sh(
          G.smooth(
            [{ p: [-size * 0.7, 0] }, { p: [-size * 0.35, -size * 0.35] }, { p: [0, 0] }, { p: [size * 0.35, size * 0.35] }, { p: [size * 0.7, 0] }],
            false,
          ),
        ),
        st(colour, size * 0.32, { cap: 2 }),
        st(PAL.line, size * 0.32 + 4, { cap: 2 }),
      ]),
    ];
  return [gr('Rect', [sh(G.roundRect(0, 0, size * 0.62, size, 1.2)), st(PAL.line, 2), fl(colour)])];
}

/** Stroked capital letters for short exclamations ("HA"). Origin at the centre of the word. */
export function letters(word, height, { fill = '#FFFFFF', line = PAL.line, weight = 0.2 } = {}) {
  const w = height * 0.62;
  const gap = height * 0.22;
  const glyph = {
    H: [
      [[-w / 2, -height / 2], [-w / 2, height / 2]],
      [[w / 2, -height / 2], [w / 2, height / 2]],
      [[-w / 2, 0], [w / 2, 0]],
    ],
    A: [
      [[-w / 2, height / 2], [0, -height / 2], [w / 2, height / 2]],
      [[-w * 0.28, height * 0.14], [w * 0.28, height * 0.14]],
    ],
    '!': [[[0, -height / 2], [0, height * 0.18]], [[0, height * 0.47], [0, height * 0.48]]],
    Z: [[[-w / 2, -height / 2], [w / 2, -height / 2], [-w / 2, height / 2], [w / 2, height / 2]]],
  };
  const total = word.length * w + (word.length - 1) * gap;
  const paths = [];
  [...word].forEach((ch, k) => {
    const cx = -total / 2 + w / 2 + k * (w + gap);
    for (const stroke of glyph[ch] || []) paths.push(G.poly(stroke.map((p) => [p[0] + cx, p[1]]), false));
  });
  const sw = height * weight;
  return [gr('Word', [...paths.map((p) => sh(p)), st(fill, sw, { cap: 2, join: 2 }), st(line, sw + 6.5, { cap: 2, join: 2 })])];
}

/** Curved motion mark (an arc segment) for waves and shakes. */
export function arcMark(radius, from, to, width = 3.2, colour = PAL.line) {
  const pts = [];
  const n = 4;
  for (let k = 0; k <= n; k++) {
    const a = (from + ((to - from) * k) / n) * G.DEG;
    pts.push({ p: [Math.cos(a) * radius, Math.sin(a) * radius] });
  }
  return [gr('Arc', [sh(G.smooth(pts, false)), st(colour, width, { cap: 2 })])];
}

/** A question mark, origin at its centre. */
export function questionMark(height, { fill = '#FFFFFF', line = PAL.line, weight = 0.2 } = {}) {
  const h = height;
  const hook = G.smooth(
    [
      { p: [-h * 0.26, -h * 0.24] },
      { p: [-h * 0.12, -h * 0.46] },
      { p: [h * 0.12, -h * 0.47] },
      { p: [h * 0.27, -h * 0.28] },
      { p: [h * 0.14, -h * 0.07] },
      { p: [0, h * 0.06] },
      { p: [0, h * 0.18], k: 0 },
    ],
    false,
  );
  const dot = G.poly([[0, h * 0.44], [0, h * 0.45]], false);
  const sw = h * weight;
  return [gr('Question', [sh(hook), sh(dot), st(fill, sw, { cap: 2, join: 2 }), st(line, sw + 6.5, { cap: 2, join: 2 })])];
}

/** A beamed or single music note, origin at the note head. */
export function musicNote(size, colour, double = false) {
  const head = (x) => G.rotatePath(G.ellipse(x, 0, size * 0.34, size * 0.24), -22, [x, 0]);
  const parts = [];
  const stems = double
    ? [G.poly([[size * 0.3, -size * 0.06], [size * 0.3, -size * 1.0]], false), G.poly([[size * 1.1, -size * 0.2], [size * 1.1, -size * 1.14]], false)]
    : [G.poly([[size * 0.3, -size * 0.06], [size * 0.3, -size * 1.05]], false)];
  const flag = double
    ? G.poly([[size * 0.3, -size * 1.0], [size * 1.1, -size * 1.14]], false)
    : G.smooth([{ p: [size * 0.3, -size * 1.05] }, { p: [size * 0.62, -size * 0.8] }, { p: [size * 0.66, -size * 0.5] }], false);
  parts.push(gr('Stem', [...stems.map((p) => sh(p)), sh(flag), st(colour, size * 0.16, { cap: 2 }), st(PAL.line, size * 0.16 + 5, { cap: 2 })]));
  parts.push(gr('Heads', [sh(head(0)), ...(double ? [sh(head(size * 0.8))] : []), st(PAL.line, 3), fl(colour)]));
  return parts;
}

/** A soft puff of steam or smoke (three overlapping circles). */
export function puff(r, colour = '#FFFFFF') {
  return [
    gr('Puff', [
      sh(G.ellipse(-r * 0.55, r * 0.15, r * 0.62, r * 0.62)),
      sh(G.ellipse(r * 0.05, -r * 0.25, r * 0.78, r * 0.78)),
      sh(G.ellipse(r * 0.6, r * 0.2, r * 0.56, r * 0.56)),
      fl(colour),
    ]),
    gr('Puff line', [
      sh(G.ellipse(-r * 0.55, r * 0.15, r * 0.62, r * 0.62)),
      sh(G.ellipse(r * 0.05, -r * 0.25, r * 0.78, r * 0.78)),
      sh(G.ellipse(r * 0.6, r * 0.2, r * 0.56, r * 0.56)),
      st(PAL.line, 3.4),
    ]),
  ];
}

/** The comic "anger" mark: four curved brackets around a centre. */
export function angerMark(r, colour = '#FF4D5E') {
  const arm = G.smooth([{ p: [r * 0.2, -r] }, { p: [r * 0.28, -r * 0.3] }, { p: [r, -r * 0.2] }], false);
  const arms = [0, 90, 180, 270].map((a) => G.rotatePath(arm, a));
  return [gr('Anger', [...arms.map((p) => sh(p)), st(colour, r * 0.32, { cap: 2 }), st(PAL.line, r * 0.32 + 5, { cap: 2 })])];
}

/** Short straight strokes radiating from a centre (a shock or impact burst). */
export function burstLines(count, r0, r1, { width = 3.4, colour = PAL.line, from = 0, to = 360 } = {}) {
  const lines = [];
  for (let k = 0; k < count; k++) {
    const a = (from + ((to - from) * (k + 0.5)) / count) * G.DEG;
    lines.push(G.poly([[Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(a) * r1, Math.sin(a) * r1]], false));
  }
  return [gr('Burst', [...lines.map((p) => sh(p)), st(colour, width, { cap: 2 })])];
}
