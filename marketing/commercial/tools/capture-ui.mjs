// Renders the UI recreations (ui/ios.html, ui/desktop.html) to PNG textures in
// build/textures. Usage: node tools/capture-ui.mjs [name-filter]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const OUT = path.resolve("build/textures");
fs.mkdirSync(OUT, { recursive: true });

const SYNC_TEXT = "Perfect. See you tomorrow at 2 👋";
// Typing states for the sync shot: the composer fills in word by word.
const typingSteps = [...SYNC_TEXT.matchAll(/\S+\s*/g)].map((m) => m.index + m[0].length);

const jobs = [
  ...["inbox", "server", "random", "you", "discover", "dm", "dm-sent"].map((s) => ({ name: `ios-${s}`, page: `ui/ios.html?screen=${s}`, w: 402, h: 874, dpr: 3 })),
  ...typingSteps.map((n, i) => ({ name: `ios-dm-typing-${i}`, page: `ui/ios.html?screen=dm-typing&n=${n}`, w: 402, h: 874, dpr: 3 })),
  ...["chat", "dm", "dm-sent", "security", "friends"].map((s) => ({ name: `desktop-${s}`, page: `ui/desktop.html?screen=${s}`, w: 1440, h: 900, dpr: 2 })),
  ...["chat", "dm", "dm-sent"].map((s) => ({ name: `laptop-${s}`, page: `ui/desktop.html?screen=${s}&laptop=1`, w: 1470, h: 956, dpr: 2 })),
  { name: "sync-card", page: "ui/card.html", w: 380, h: 84, dpr: 3, transparent: true },
  ...["inbox", "server", "friends", "notes", "you"].map((s) => ({ name: `android-${s}`, page: `ui/android.html?screen=${s}`, w: 412, h: 915, dpr: 2.625 })),
];

const filter = process.argv[2];
const { server, origin } = await serve();
const browser = await chromium.launch();
for (const job of jobs.filter((j) => !filter || j.name.includes(filter))) {
  if (job.page.startsWith("ui/desktop") && !fs.existsSync("ui/desktop.html")) continue;
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: job.dpr });
  page.on("pageerror", (e) => console.error(job.name, e.message));
  await page.goto(`${origin}/${job.page}`);
  await page.waitForSelector("body[data-ready]", { timeout: 20000 });
  await page.screenshot({ path: path.join(OUT, `${job.name}.png`), omitBackground: !!job.transparent });
  // Bounding boxes of elements the compositor animates (e.g. the new message).
  const boxes = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    return { newMessage: box("[data-new]"), list: box("[data-list]") };
  });
  if (boxes.newMessage || boxes.list) fs.writeFileSync(path.join(OUT, `${job.name}.json`), JSON.stringify({ scale: job.dpr, ...boxes }));
  await page.close();
  console.log("captured", job.name);
}
await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, "typing-steps.json"), JSON.stringify(typingSteps.length));
