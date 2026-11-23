// Builds the Spectre sticker pack as Lottie JSON (320 x 320, 60 fps, vector only).
//
//   node build.mjs            # all stickers
//   node build.mjs hello lol  # just these

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSticker } from './lib/spectre.mjs';
import hello from './stickers/hello.mjs';
import lol from './stickers/lol.mjs';
import sad from './stickers/sad.mjs';
import love from './stickers/love.mjs';
import party from './stickers/party.mjs';
import typing from './stickers/typing.mjs';
import sleepy from './stickers/sleepy.mjs';
import thinking from './stickers/thinking.mjs';
import shocked from './stickers/shocked.mjs';
import angry from './stickers/angry.mjs';
import cool from './stickers/cool.mjs';
import dance from './stickers/dance.mjs';
import shrug from './stickers/shrug.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STICKERS = [hello, lol, sad, love, party, typing, sleepy, thinking, shocked, angry, cool, dance, shrug];

const outDir = path.resolve(here, '../lottie');

export function build(only = []) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const def of STICKERS) {
    if (only.length && !only.includes(def.id)) continue;
    const json = buildSticker(def);
    const text = JSON.stringify(json);
    const file = path.join(outDir, `spectre-${def.id}.json`);
    fs.writeFileSync(file, text);
    results.push({ id: def.id, file, frames: json.op, fps: json.fr, bytes: Buffer.byteLength(text) });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const r of build(process.argv.slice(2))) {
    console.log(
      `${r.id.padEnd(9)} ${r.frames} frames @ ${r.fps} fps = ${(r.frames / r.fps).toFixed(2)} s, ${(r.bytes / 1024).toFixed(1)} KiB`,
    );
  }
}
