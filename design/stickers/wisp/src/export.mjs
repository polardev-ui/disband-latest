// Renders every frame of each sticker and writes the raster fallbacks.
//
//   node export.mjs [framesDir] [ids...]
//
// - frames: 320 x 320 transparent PNGs from the pinned lottie-web build (headless Chrome)
// - fallback/wisp-<id>.webp: animated WebP, 60 fps (17/17/16 ms per frame), lossy + alpha
// Renders with the Spectre pack's pinned lottie-web (../../spectre/src/render.mjs).
// Needs img2webp (libwebp).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { openRenderer, renderFrames } from '../../spectre/src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const framesRoot = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-frames-'));
const fallbackDir = path.join(root, 'fallback');
fs.mkdirSync(fallbackDir, { recursive: true });

const results = build(process.argv.slice(3));
const renderer = await openRenderer();
try {
  for (const r of results) {
    const json = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    const dir = path.join(framesRoot, r.id);
    fs.rmSync(dir, { recursive: true, force: true });
    const files = await renderFrames(renderer, json, dir, { size: 320, frames: 'all' });

    // Animated WebP: integer-millisecond delays averaging exactly 1000/60.
    // Every frame a keyframe (-kmax 1): each frame then decodes on its own, which iOS needs to
    // play these at 60 fps (otherwise ImageIO rebuilds frame k from frame 0). About 5% larger.
    const args = ['-loop', '0', '-lossy', '-q', '82', '-m', '4', '-kmin', '0', '-kmax', '1'];
    files.forEach((file, k) => args.push('-d', String(k % 3 === 2 ? 16 : 17), file));
    const webp = path.join(fallbackDir, `wisp-${r.id}.webp`);
    args.push('-o', webp);
    const w = spawnSync('img2webp', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    if (w.status !== 0) throw new Error(`img2webp failed for ${r.id}`);

    const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1);
    console.log(`${r.id}: ${files.length} frames, lottie ${(r.bytes / 1024).toFixed(1)} KiB, webp ${kb(webp)} KiB`);
  }
} finally {
  await renderer.browser.close();
}
console.log(`frames in ${framesRoot}`);
