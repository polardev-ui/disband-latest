#!/usr/bin/env node
// Copies the AI noise suppression worklet and model from
// @sapphi-red/web-noise-suppressor into public/noise/. Run after upgrading
// that package; the copies are committed so every build serves them.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("@sapphi-red/web-noise-suppressor/gtcrn.wasm"));
const out = join(process.cwd(), "public", "noise");
mkdirSync(out, { recursive: true });

copyFileSync(join(dist, "gtcrn.wasm"), join(out, "gtcrn.wasm"));
const worklet = readFileSync(join(dist, "gtcrn", "workletProcessor.js"), "utf8")
  .replace(/^\/\/# sourceMappingURL=.*$/m, "");
writeFileSync(join(out, "gtcrn-worklet.js"), worklet);
console.log(`Copied GTCRN noise suppression assets to ${out}`);
