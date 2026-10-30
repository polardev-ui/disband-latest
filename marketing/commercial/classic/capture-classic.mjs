// Captures the real classic Disband UI from the disband-classic worktree's
// local preview route (/dev/classic: the real DiscordApp against sample data,
// no sign-in). Nothing in that repository is changed.
//   APP_URL=http://localhost:3000 SCALE=2 node classic/capture-classic.mjs [explore]
//     -> build/classic/*.png (+ *.json boxes for the shots that need them)
//
// Demo hygiene, applied in the browser only:
//   * the sample voice note is served from a local stand-in, and the sample
//     video message (which the preview can only show as an error) is hidden;
//   * the sample bot "Dyno" (a real third-party bot's name) reads "Helper", and
//     Nova's listening status uses a made-up track instead of a real song.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SCALE = Number(process.env.SCALE ?? 2);
const OUT = path.resolve("build/classic");
const explore = process.argv.includes("explore");
fs.mkdirSync(OUT, { recursive: true });

const REPLACE = [["Dyno", "Helper"], ["Midnight City", "Night Drive"], ["M83", "Mono Tide"]];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, colorScheme: "dark" });
// The capture browser has no H.264 decoder, so the stand-in clip is VP9.
await ctx.route("**/dev-test.mp4", (r) => r.fulfill({ path: path.join(OUT, "demo-clip.webm"), contentType: "video/webm" }));
await ctx.route("**/soundhelix.com/**", (r) => r.fulfill({ path: path.join(OUT, "demo-voice.mp3"), contentType: "audio/mpeg" }));
await ctx.addInitScript((pairs) => {
  const fix = (node) => {
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      let v = n.nodeValue;
      for (const [a, b] of pairs) if (v.includes(a)) v = v.split(a).join(b);
      if (v !== n.nodeValue) n.nodeValue = v;
    }
  };
  new MutationObserver((muts) => muts.forEach((m) => { if (m.type === "characterData") fix(m.target.parentNode ?? m.target); m.addedNodes.forEach((a) => fix(a.nodeType === 3 ? a.parentNode ?? a : a)); }))
    .observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener("DOMContentLoaded", () => fix(document.body));
}, REPLACE);

async function fresh() {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(`${APP}/dev/classic`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator('[aria-label="Spaces"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } *{ caret-color: #dbdee1; }" });
  // A fresh profile opens with the What's New notes; dismiss them as a user would.
  await page.getByRole("button", { name: "Explore Disband" }).click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}
// The preview's sample video uses a relative path the app's URL check rejects,
// so it can only render as an error tile; hide that one sample message.
const hideBroken = (page) => page.evaluate(() => {
  for (const p of document.querySelectorAll("p")) {
    if (!p.textContent.includes("Couldn't load this attachment")) continue;
    let el = p;
    while (el.parentElement && !el.textContent.includes("Kai Tanaka")) el = el.parentElement;
    el.style.display = "none";
  }
});
const shot = async (page, name, wait = 700) => {
  await page.waitForTimeout(wait);
  await hideBroken(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("captured", name);
};
const box = async (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).catch(() => null);

// 1. The main space view, #general.
let page = await fresh();
await page.mouse.move(1430, 890); // park the pointer on empty member-list space
await shot(page, "main", 1500);
const boxes = {
  rail: await box(page, '[aria-label="Spaces"]'),
  composer: await box(page, "textarea"),
  members: await box(page, "aside"),
};
fs.writeFileSync(path.join(OUT, "main.json"), JSON.stringify({ viewport: { w: 1440, h: 900 }, scale: SCALE, ...boxes }, null, 2));

// 2. Hover a space on the rail: pill + tooltip.
await page.locator('[aria-label="Night Owls"]').first().hover();
await shot(page, "rail-hover", 900);
await page.mouse.move(1430, 890);

// 2b. Hover a channel row.
await page.getByText("random", { exact: true }).first().hover();
await shot(page, "channel-hover", 600);
await page.mouse.move(1430, 890);

// 3. Typing in the composer (the preview does not send; we only show typing).
const msg = "anyone up for a game night on friday?";
const ta = page.locator("textarea").first();
await ta.click();
const steps = [8, 16, 24, 31, msg.length];
for (const [k, n] of steps.entries()) {
  await ta.fill([...msg].slice(0, n).join(""));
  await shot(page, `compose-${k}`, 250);
}
await ta.fill("");
await page.mouse.move(1430, 890);

// 4. A member's profile card.
page = await fresh();
await page.getByText("Mila Oduya", { exact: true }).last().click();
await shot(page, "profile", 900);

// 5. Direct messages with a friend.
page = await fresh();
await page.locator('[aria-label="Direct Messages"]').first().click();
await page.waitForTimeout(800);
await shot(page, "home");
await page.getByText("Mila Oduya", { exact: true }).first().click();
await shot(page, "dm", 900);

if (explore) {
  // Other candidates, for review only.
  page = await fresh();
  await page.keyboard.press("Control+k");
  await shot(page, "x-quickswitcher", 900);
  await page.keyboard.press("Escape");
  await page.locator('[aria-label="Explore discoverable spaces"]').first().click();
  await shot(page, "x-discover", 1500);
  page = await fresh();
  await page.locator('[aria-label="Open your profile"]').first().click().catch(() => {});
  await shot(page, "x-userpanel", 900);
}
await browser.close();
