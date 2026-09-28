// Writes build/timeline.json for the audio generator.
import fs from "node:fs";
import * as tl from "../src/timeline.js";
fs.mkdirSync("build", { recursive: true });
fs.writeFileSync("build/timeline.json", JSON.stringify({ FPS: tl.FPS, DURATION: tl.DURATION, BPM: tl.BPM, T: tl.T }, null, 2));
console.log("wrote build/timeline.json");
