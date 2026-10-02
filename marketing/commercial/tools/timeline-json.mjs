// Writes a timeline as JSON for the audio generator.
//   node tools/timeline-json.mjs [src/timeline.js] [build/timeline.json]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [src = "src/timeline.js", out = "build/timeline.json"] = process.argv.slice(2);
const tl = await import(pathToFileURL(path.resolve(src)).href);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ FPS: tl.FPS, DURATION: tl.DURATION, BPM: tl.BPM, T: tl.T }, null, 2));
console.log(`wrote ${out}`);
