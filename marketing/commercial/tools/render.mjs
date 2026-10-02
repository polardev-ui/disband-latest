// Renders the commercial's frames to PNG with parallel headless browsers.
//   node tools/render.mjs [--fps 60] [--from 0] [--to 40] [--workers 3] [--preview] [--out build/frames]
// Existing frames are skipped, so an interrupted render resumes where it left off.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const fps = Number(arg("fps", 60));
const from = Number(arg("from", 0));
const to = Number(arg("to", 40));
const workers = Number(arg("workers", 3));
const preview = process.argv.includes("--preview");
const out = arg("out", preview ? "build/preview-frames" : "build/frames");
fs.mkdirSync(out, { recursive: true });

const first = Math.round(from * fps), last = Math.round(to * fps) - 1;
const todo = [];
for (let f = first; f <= last; f++) {
  const file = path.join(out, `f${String(f).padStart(5, "0")}.png`);
  if (!fs.existsSync(file)) todo.push({ f, file });
}
console.log(`frames ${first}..${last} @${fps}fps, ${todo.length} to render, ${workers} workers${preview ? " (preview)" : ""}`);

const { server, origin } = await serve();
let done = 0;
const t0 = Date.now();
async function worker(id) {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => console.error(`[w${id}] pageerror`, e.message));
  await page.goto(`${origin}/${process.env.STAGE ?? "src/stage.html"}${preview ? "?preview" : ""}`);
  await page.waitForSelector("body[data-ready]", { timeout: 300000 });
  // Interleave frames across workers so heavy 3D stretches are shared.
  for (let i = id; i < todo.length; i += workers) {
    const { f, file } = todo[i];
    for (let attempt = 1; ; attempt++) {
      try {
        // Finish the GL work inside the page first, so the capture itself
        // never waits on a long software-rendered frame.
        await page.evaluate(async (t) => {
          await window.renderFrame(t);
          const gl = document.getElementById("gl").getContext("webgl2");
          if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        }, f / fps);
        await page.screenshot({ path: file + ".tmp.png", timeout: 180000 });
        fs.renameSync(file + ".tmp.png", file);
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        console.error(`[w${id}] frame ${f} attempt ${attempt} failed: ${e.message.split("\n")[0]}; retrying`);
      }
    }
    done++;
    if (done % 50 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`${done}/${todo.length}  ${(el / done).toFixed(2)}s/frame  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
    }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));
server.close();
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
