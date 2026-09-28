// Renders banner.html to PNG (light, dark, and a crop-guide check):
//   node render.mjs    — uses Playwright from ../commercial/node_modules.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../commercial/node_modules/playwright/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, ".."); // marketing/, so the page can reach ../commercial/assets
const TYPES = { ".html": "text/html", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
const jobs = [
  ["theme=light", "disband-youtube-banner.png"],
  ["theme=dark", "disband-youtube-banner-dark.png"],
  ["theme=light&guides", process.argv[2] ?? "banner-guides.png"],
];
for (const [query, out] of jobs) {
  await page.goto(`${origin}/youtube-banner/banner.html?${query}`);
  await page.waitForSelector("body[data-ready]");
  await page.screenshot({ path: path.resolve(HERE, out) });
  console.log("wrote", out);
}
await browser.close();
server.close();
