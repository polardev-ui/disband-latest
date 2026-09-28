// Renders one frame with a scene tweak applied, for isolating render issues:
//   node tools/debug.mjs <t> <out.png> "<js run in page with engine=window.__engine>"
import { chromium } from "playwright";
import { serve } from "./serve.mjs";
const [t, out, js = ""] = process.argv.slice(2);
const { server, origin } = await serve();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => console.log("console:", m.text()));
await page.goto(`${origin}/src/stage.html`);
await page.waitForSelector("body[data-ready]", { timeout: 120000 });
await page.evaluate(({ tt, code }) => { const engine = window.__engine; new Function("engine", code)(engine); return window.renderFrame(Number(tt)); }, { tt: t, code: js });
await page.screenshot({ path: out });
await browser.close(); server.close();
