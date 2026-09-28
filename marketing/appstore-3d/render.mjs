// Renders the 7 App Store screenshots at 6.9" (1320×2868) and 6.5" (1284×2778).
//   node render.mjs [shotFilter]
// Needs the commercial's UI textures: run `npm run capture` in ../commercial first.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "../commercial/node_modules/playwright/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const NAMES = ["privacy", "spaces", "channels", "messages", "discover", "profile", "sync"];
const SIZES = [["6.9-inch", 1320, 2868], ["6.5-inch", 1284, 2778]];
const only = process.argv[2];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [dir, w, h] of SIZES) {
  fs.mkdirSync(path.join(HERE, dir), { recursive: true });
  for (let i = 1; i <= 7; i++) {
    if (only && !String(i).includes(only)) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error(dir, i, e.message));
    await page.goto(`${origin}/appstore-3d/screenshots.html?shot=${i}`);
    await page.waitForSelector("body[data-ready]", { timeout: 600000 });
    const out = path.join(HERE, dir, `${String(i).padStart(2, "0")}-${NAMES[i - 1]}.png`);
    await page.screenshot({ path: out, timeout: 300000 });
    // App Store Connect rejects screenshots with an alpha channel.
    execFileSync("python3", ["-c", `from PIL import Image; Image.open("${out}").convert("RGB").save("${out}")`]);
    await page.close();
    console.log("wrote", path.relative(HERE, out));
  }
}
await browser.close();
server.close();
