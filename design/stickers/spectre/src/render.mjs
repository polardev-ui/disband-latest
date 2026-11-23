// Renders Lottie frames to PNG with the pinned lottie-web build in headless Chrome.
//
//   node render.mjs <animation.json> <outDir> [--size 320] [--frames all|every:N|0,12,40] [--bg #313338]
//
// Needs playwright-core and a Chrome/Chromium binary. By default it uses the copy of
// playwright-core in marketing/commercial and Puppeteer's cached chrome-headless-shell;
// override with PLAYWRIGHT_CORE and CHROME_PATH.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const require = createRequire(import.meta.url);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), '.cache/puppeteer/chrome-headless-shell');
  if (fs.existsSync(base)) {
    for (const v of fs.readdirSync(base).sort().reverse()) {
      const dir = path.join(base, v);
      for (const sub of fs.readdirSync(dir)) {
        const bin = path.join(dir, sub, 'chrome-headless-shell');
        if (fs.existsSync(bin)) return bin;
      }
    }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  throw new Error('No Chrome found; set CHROME_PATH');
}

export async function openRenderer() {
  const pwPath = process.env.PLAYWRIGHT_CORE || path.join(repo, 'marketing/commercial/node_modules/playwright-core');
  const { chromium } = require(pwPath);
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--force-color-profile=srgb'] });
  const lottieSrc = fs.readFileSync(path.join(here, '../vendor/lottie_light-5.13.0.min.js'), 'utf8');
  return {
    browser,
    async page(size, bg) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;background:${bg || 'transparent'}}#s{width:${size}px;height:${size}px}</style></head><body><div id="s"></div><script>${lottieSrc}</script></body></html>`,
      );
      return page;
    },
  };
}

export async function renderFrames(renderer, json, outDir, { size = 320, frames = 'all', bg = null, prefix = 'f' } = {}) {
  const page = await renderer.page(size, bg);
  await page.evaluate((data) => {
    window.anim = lottie.loadAnimation({
      container: document.getElementById('s'),
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: data,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
  }, json);
  for (let k = 0; k < 200; k++) {
    if (await page.evaluate(() => !!(window.anim && window.anim.isLoaded))) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  const N = json.op - json.ip;
  let list;
  if (frames === 'all') list = Array.from({ length: N }, (_, k) => k);
  else if (typeof frames === 'string' && frames.startsWith('every:')) {
    const step = +frames.slice(6);
    list = Array.from({ length: Math.ceil(N / step) }, (_, k) => k * step);
  } else if (Array.isArray(frames)) list = frames;
  else list = String(frames).split(',').map(Number);
  fs.mkdirSync(outDir, { recursive: true });
  const el = await page.$('#s');
  const written = [];
  for (const f of list) {
    await page.evaluate((fr) => window.anim.goToAndStop(fr, true), f);
    const file = path.join(outDir, `${prefix}${String(f).padStart(4, '0')}.png`);
    await el.screenshot({ path: file, omitBackground: !bg });
    written.push(file);
  }
  await page.close();
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , input, outDir, ...rest] = process.argv;
  const opt = {};
  for (let k = 0; k < rest.length; k += 2) opt[rest[k].replace(/^--/, '')] = rest[k + 1];
  const json = JSON.parse(fs.readFileSync(input, 'utf8'));
  const r = await openRenderer();
  try {
    const files = await renderFrames(r, json, outDir, {
      size: +(opt.size || 320),
      frames: opt.frames || 'all',
      bg: opt.bg || null,
    });
    console.log(`rendered ${files.length} frames to ${outDir}`);
  } finally {
    await r.browser.close();
  }
}
