// Renders single frames of the stage for review: node tools/still.mjs 1.5 12.9 ...
import fs from "node:fs";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";
const [vw, vh] = (process.env.VIEWPORT ?? "1920x1080").split("x").map(Number);
const times = process.argv.slice(2).map(Number);
const { server, origin } = await serve();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on("console", (m) => console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`${origin}/${process.env.STAGE ?? "src/stage.html"}`);
await page.waitForSelector("body[data-ready]", { timeout: 120000 });
fs.mkdirSync("build/stills", { recursive: true });
for (const t of times) {
  const t0 = Date.now();
  await page.evaluate((tt) => window.renderFrame(tt), t);
  await page.screenshot({ path: `build/stills/t${t.toFixed(2).padStart(6, "0")}.png` });
  console.log("t", t, "ms", Date.now() - t0);
}
await browser.close();
server.close();
