// Builds the Wisp sticker pack as Lottie JSON (320 x 320, 60 fps, vector only).
//
//   node build.mjs            # all stickers
//   node build.mjs hi wink    # just these

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSticker } from './lib/wisp.mjs';
import hi from './stickers/hi.mjs';
import yay from './stickers/yay.mjs';
import thanks from './stickers/thanks.mjs';
import shy from './stickers/shy.mjs';
import sad from './stickers/sad.mjs';
import love from './stickers/love.mjs';
import please from './stickers/please.mjs';
import pout from './stickers/pout.mjs';
import sleepy from './stickers/sleepy.mjs';
import wink from './stickers/wink.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STICKERS = [hi, yay, thanks, shy, sad, love, please, pout, sleepy, wink];

const outDir = path.resolve(here, '../lottie');

export function build(only = []) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const def of STICKERS) {
    if (only.length && !only.includes(def.id)) continue;
    const json = buildSticker(def);
    const text = JSON.stringify(json);
    const file = path.join(outDir, `wisp-${def.id}.json`);
    fs.writeFileSync(file, text);
    results.push({ id: def.id, file, frames: json.op, fps: json.fr, bytes: Buffer.byteLength(text) });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const r of build(process.argv.slice(2))) {
    console.log(`${r.id.padEnd(7)} ${r.frames} frames @ ${r.fps} fps = ${(r.frames / r.fps).toFixed(2)} s, ${(r.bytes / 1024).toFixed(1)} KiB`);
  }
}
