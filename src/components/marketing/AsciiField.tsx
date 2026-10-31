"use client";

import { useEffect, useRef } from "react";

/**
 * The homepage background: layers of ASCII waveforms that rise from below
 * the hero as you scroll, each layer moving at its own speed (parallax).
 * The waves swell in bursts, like someone talking in a call.
 *
 * One fixed canvas, drawn a row at a time: each layer's characters for a
 * row go out as a single monospaced string, so a frame is a few hundred
 * fillText calls rather than one per cell. Plain ASCII only, so every
 * glyph has the same advance in any monospace fallback.
 *
 * Pauses while the tab is hidden; with reduced motion it draws one still
 * frame and ignores scroll.
 */

interface Layer {
  /** Scroll speed relative to the page: far layers drift less. */
  speed: number;
  /** Distance between ridges, in px of page. */
  period: number;
  /** Ridge height swing, in px. */
  amp: number;
  /** How far below the crest the band runs, in px. */
  depth: number;
  /** Horizontal wave frequencies (per column) and drift speeds. */
  f1: number;
  f2: number;
  w1: number;
  w2: number;
  body: string;
  crest: string;
}

// Far to near; nearer layers are drawn last and cover the ones behind.
const LAYERS: Layer[] = [
  { speed: 0.25, period: 260, amp: 38, depth: 70, f1: 0.11, f2: 0.23, w1: 0.35, w2: 0.22, body: "rgba(88,101,242,0.16)", crest: "rgba(120,132,255,0.3)" },
  { speed: 0.45, period: 330, amp: 52, depth: 90, f1: 0.085, f2: 0.19, w1: 0.45, w2: 0.3, body: "rgba(88,101,242,0.24)", crest: "rgba(140,150,255,0.42)" },
  { speed: 0.7, period: 410, amp: 70, depth: 115, f1: 0.065, f2: 0.15, w1: 0.55, w2: 0.36, body: "rgba(99,112,245,0.32)", crest: "rgba(165,173,255,0.58)" },
  { speed: 1, period: 500, amp: 92, depth: 140, f1: 0.05, f2: 0.12, w1: 0.65, w2: 0.42, body: "rgba(110,122,248,0.4)", crest: "rgba(190,196,255,0.75)" },
];

const ACCENT = "rgba(224,102,154,0.75)";
const FONT_SIZE = 13;
const LINE = 17;
const FONT = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;

/** Cheap stable noise in [0, 1) for a cell, so sparse dots don't shimmer. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 0..1: a ridge "speaks" now and then, then goes quiet. */
function voice(t: number, ridge: number, layer: number): number {
  const s = Math.sin(t * 0.55 + ridge * 2.3 + layer * 1.1);
  return s > 0 ? s * s * s : 0;
}

export function AsciiField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let cell = 8;
    let cols = 0;
    let rows = 0;
    let frame = 0;
    let last = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = FONT;
      ctx.textBaseline = "top";
      cell = ctx.measureText("M").width || 8;
      cols = Math.ceil(width / cell) + 1;
      rows = Math.ceil(height / LINE) + 1;
    };

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      const scroll = reduced ? 0 : window.scrollY;
      // The field starts a little below the middle of the first screen and
      // rises into view as the page scrolls.
      const horizon = height * 0.62;

      ctx.clearRect(0, 0, width, height);
      ctx.font = FONT;

      // owner[c] = index of the nearest layer already drawn in this row.
      const owner = new Int8Array(cols);
      const body = new Array<string>(cols);
      const crest = new Array<string>(cols);
      const accent = new Array<string>(cols);

      for (let r = 0; r < rows; r++) {
        const y = r * LINE;
        owner.fill(-1);
        const rowBodies: string[][] = [];
        const rowCrests: string[][] = [];
        let rowAccent: string[] | null = null;

        for (let li = LAYERS.length - 1; li >= 0; li--) {
          const L = LAYERS[li];
          const wy = y + scroll * L.speed - horizon - li * 40;
          if (wy < 0) {
            rowBodies[li] = [];
            rowCrests[li] = [];
            continue;
          }
          const ridge = Math.floor(wy / L.period);
          const local = wy - ridge * L.period;
          const v = voice(t, ridge, li);
          const amp = L.amp * (0.45 + 0.9 * v);
          body.fill(" ");
          crest.fill(" ");
          let anyBody = false;
          let anyCrest = false;

          for (let c = 0; c < cols; c++) {
            if (owner[c] !== -1) continue;
            const wave =
              Math.sin(c * L.f1 + t * L.w1 + ridge * 1.7) * 0.65 +
              Math.sin(c * L.f2 - t * L.w2 + ridge * 0.9) * 0.35;
            const top = L.period * 0.35 - wave * amp;
            const d = local - top;
            if (d < 0 || d > L.depth) continue;
            owner[c] = li;
            const k = d / L.depth;
            const n = hash(c, ridge, li);
            if (d < LINE) {
              // Crest: the loudest stretches of a speaking ridge turn pink.
              if (li === LAYERS.length - 1 && v > 0.6 && wave > 0.55 && n < 0.5) {
                rowAccent ??= new Array<string>(cols).fill(" ");
                rowAccent[c] = "=";
              } else {
                crest[c] = wave > 0.2 ? "~" : "-";
                anyCrest = true;
              }
            } else if (k < 0.35) {
              body[c] = n < 0.75 ? "-" : "_";
              anyBody = true;
            } else if (k < 0.7) {
              body[c] = n < 0.5 ? "," : n < 0.85 ? "'" : ".";
              anyBody = true;
            } else if (n < 1.15 - k) {
              body[c] = n < 0.3 ? ":" : ".";
              anyBody = true;
            }
          }
          rowBodies[li] = anyBody ? body.slice() : [];
          rowCrests[li] = anyCrest ? crest.slice() : [];
        }

        for (let li = 0; li < LAYERS.length; li++) {
          if (rowBodies[li]?.length) {
            ctx.fillStyle = LAYERS[li].body;
            ctx.fillText(rowBodies[li].join(""), 0, y);
          }
          if (rowCrests[li]?.length) {
            ctx.fillStyle = LAYERS[li].crest;
            ctx.fillText(rowCrests[li].join(""), 0, y);
          }
        }
        if (rowAccent) {
          ctx.fillStyle = ACCENT;
          ctx.fillText(rowAccent.join(""), 0, y);
        }
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      // About 30 fps is plenty for drifting text and halves the work.
      if (now - last < 33) return;
      last = now;
      draw(now);
    };

    resize();
    draw(performance.now());

    const onResize = () => {
      resize();
      draw(performance.now());
    };
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) frame = requestAnimationFrame(loop);
    };
    if (!reduced) {
      frame = requestAnimationFrame(loop);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 print:hidden"
    />
  );
}
