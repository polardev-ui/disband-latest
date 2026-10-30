// Captures the real classic Disband UI (disband-classic's /dev/classic preview:
// the real DiscordApp against fictional sample data, no sign-in) at 1440×900
// and 3×, plus the exact rectangles of its parts, so the morphing film can cut
// the real interface into pieces that tile back into it exactly.
//   APP_URL=http://localhost:3017 node morph/capture.mjs
//     -> build/morph/{main,dm}.png and {main,dm}.json
//
// Nothing in disband-classic changes. Demo hygiene happens in the browser only:
//   * sample messages that can only render as errors or endless loading cards
//     in the preview (a relative-path video, two link previews — one to a
//     third-party site) are hidden;
//   * the sample bot "Dyno" (a real third-party bot's name) reads "Helper", and
//     a real song in a listening status reads as a made-up track;
//   * the What's New notes are dismissed and the Next.js dev badge hidden.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3017";
const SCALE = 3;
const OUT = path.resolve("build/morph");
fs.mkdirSync(OUT, { recursive: true });

const REPLACE = [["Dyno", "Helper"], ["Midnight City", "Night Drive"], ["M83", "Mono Tide"]];
const NAMES = ["Riley Park", "Mila Oduya", "Nova Reyes", "Kai Tanaka", "Iris Bennet", "Helper", "Sam Whitfield", "Theo Marsh"];
const HIDE = ["Couldn't load this attachment", "github.com", "https://www.disband.dev"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, colorScheme: "dark" });
await ctx.route("**/soundhelix.com/**", (r) => r.fulfill({ path: path.resolve("build/classic/demo-voice.mp3"), contentType: "audio/mpeg" }));
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
  await page.goto(`${APP}/dev/classic`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator('[aria-label="Spaces"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("button", { name: "Explore Disband" }).click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}

// Hide whole message groups that contain any of the HIDE strings.
const tidy = (page) => page.evaluate(({ hide, names }) => {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (hide.some((h) => n.nodeValue.includes(h))) hits.push(n.parentElement);
  for (let el of hits) {
    while (el.parentElement && !names.some((nm) => el.textContent.includes(nm))) el = el.parentElement;
    if (el && el.getBoundingClientRect().width < 1000) el.style.display = "none";
  }
}, { hide: HIDE, names: NAMES });

// Rectangles of the parts the film animates.
const measure = (page) => page.evaluate((names) => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = { rail: [], channels: [], messages: [], members: [] };
  // Rail items: everything labelled inside the Spaces nav, plus the home button.
  const nav = document.querySelector('[aria-label="Spaces"]');
  const seen = new Set();
  for (const el of document.querySelectorAll("[aria-label]")) {
    const r = el.getBoundingClientRect();
    if (r.x > 72 || r.width < 30 || r.width > 72 || r.height < 30 || r.height > 64) continue;
    const key = Math.round(r.y);
    if (seen.has(key)) continue;
    seen.add(key);
    out.rail.push({ label: el.getAttribute("aria-label"), ...R(el) });
  }
  out.rail.sort((a, b) => a.y - b.y);
  // Channel column rows: leaf texts in x 72–312, grown to full-width rows.
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const rows = new Map();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.nodeValue.trim();
    if (!t) continue;
    let el = n.parentElement, r = el.getBoundingClientRect();
    if (r.x < 72 || r.x > 312 || r.width === 0) continue;
    while (el.parentElement && el.getBoundingClientRect().width < 200) el = el.parentElement;
    const b = R(el);
    if (b.h > 80 || b.x > 120) continue;
    rows.set(`${b.y}`, { text: t, ...b });
  }
  out.channels = [...rows.values()].sort((a, b) => a.y - b.y);
  // Message groups: author-name text in the chat column, grown to the row.
  const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w2.nextNode(); n; n = w2.nextNode()) {
    const nm = n.nodeValue.trim();
    if (!names.includes(nm)) continue;
    let el = n.parentElement;
    const r0 = el.getBoundingClientRect();
    if (r0.x < 312 || r0.x > 1200 || r0.width === 0) continue;
    while (el.parentElement && el.getBoundingClientRect().width < 820) el = el.parentElement;
    out.messages.push({ author: nm, ...R(el) });
  }
  out.messages = out.messages.filter((m, i, a) => a.findIndex((o) => o.y === m.y) === i).sort((a, b) => a.y - b.y);
  // Member rows: names in the right column.
  for (const nm of names) {
    for (const el0 of document.querySelectorAll("span, div")) {
      if (el0.childElementCount || el0.textContent !== nm) continue;
      const r0 = el0.getBoundingClientRect();
      if (r0.x < 1200) continue;
      let el = el0;
      while (el.parentElement && el.getBoundingClientRect().width < 200) el = el.parentElement;
      out.members.push({ name: nm, ...R(el) });
    }
  }
  const ta = document.querySelector("textarea");
  out.composer = ta ? R(ta.closest("form") ?? ta.parentElement.parentElement) : null;
  return out;
}, NAMES);

async function capture(page, name) {
  await page.mouse.move(1430, 890);
  await page.waitForTimeout(600);
  await tidy(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const boxes = await measure(page);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ viewport: { w: 1440, h: 900 }, scale: SCALE, ...boxes }, null, 2));
  console.log("captured", name, `rail ${boxes.rail.length}, channels ${boxes.channels.length}, messages ${boxes.messages.length}, members ${boxes.members.length}`);
}

let page = await fresh();
await capture(page, "main");
page = await fresh();
await page.locator('[aria-label="Direct Messages"]').first().click();
await page.waitForTimeout(800);
await page.getByText("Mila Oduya", { exact: true }).first().click();
await page.waitForTimeout(900);
await capture(page, "dm");
await browser.close();
