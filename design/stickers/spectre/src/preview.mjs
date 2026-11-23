// Writes ../preview.html: a self-contained review page (pinned lottie-web + every
// stickers inlined, so it works straight from disk with no network).
//
//   node preview.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STICKERS } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const LOTTIE_VERSION = '5.13.0';
const lottieSrc = fs.readFileSync(path.join(root, `vendor/lottie_light-${LOTTIE_VERSION}.min.js`), 'utf8');

const BLURBS = {
  hello: 'Anticipation dip, overshooting arm raise, four waves with the wrist and upper arm lagging the forearm.',
  lol: 'Eight chuckles in two laughing fits, leaning side to side; “HA” pops and tears of joy squirt out.',
  sad: 'Two sobs: a slow breath in, a sharp catch and a shudder. Ear drooped, one hand rubbing an eye.',
  love: 'Lub-dub heartbeat twice a loop, driving the big heart, heart eyes and a slow swoon.',
  party: 'Crouch, stretched take-off, hang time, squashed landing with overshoot, confetti burst.',
  typing: 'Sitting behind a laptop mashing the keys with both fists; the laptop hops and rocks, keys fly off.',
  sleepy: 'Dozing on his feet: slow breaths, a drooping nod and a jerk awake, a sleep bubble that pops, Zs.',
  thinking: 'Mitt on chin, eyes glancing up and across, head tilting; a question mark pops and wobbles.',
  shocked: 'A flinch, then a jolt: hop, arms up to the face, wide eyes, ear straight up, "!" and sweat.',
  angry: 'Stomping in place with fists clenched, shaking, steam puffing out and an anger mark throbbing.',
  cool: 'Shades on, hand on hip, nodding to a beat; pushes the shades up and a glint flashes across.',
  dance: 'A bounce on every beat, hips swaying, disco points switching every two beats, music notes.',
  shrug: 'Shoulders up, mitts turned up and out, head tilted with a flat look, then back down.',
};

const stickers = STICKERS.map((def) => {
  const file = path.join(root, `lottie/spectre-${def.id}.json`);
  const text = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(text);
  const webp = path.join(root, `fallback/spectre-${def.id}.webp`);
  return {
    id: def.id,
    name: def.name,
    blurb: BLURBS[def.id] || '',
    frames: json.op - json.ip,
    fps: json.fr,
    w: json.w,
    h: json.h,
    bytes: Buffer.byteLength(text),
    webpBytes: fs.existsSync(webp) ? fs.statSync(webp).size : null,
    data: json,
  };
});

const safe = (s) => s.replace(/<\//g, '<\\/');

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spectre Sticker Pack</title>
<style>
:root {
  --bg: #1a181e; --panel: #1f1d23; --panel-2: #2a2730; --line: #34303c;
  --text: #e5e4e9; --muted: #9d97aa; --brand: #4641d9; --brand-soft: #4641d933; --ok: #3ccf91;
  --chat: #1f1d23; --checker-a: #2a2730; --checker-b: #232027;
  color-scheme: dark;
}
:root[data-bg="light"] { --chat: #ffffff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 28px 16px 64px; }
header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; margin-bottom: 22px; }
h1 { font-size: 26px; line-height: 1.2; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 34px 0 12px; font-weight: 600; }
.sub { color: var(--muted); margin: 0; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--brand-soft); color: #c9c7ff; font-size: 12px; font-weight: 600; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg { display: inline-flex; background: var(--panel-2); border-radius: 10px; padding: 3px; gap: 2px; }
.seg button, .btn { appearance: none; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; padding: 6px 11px; border-radius: 8px; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--brand); color: #fff; }
.btn { background: var(--panel-2); color: var(--text); }
.btn:hover, .seg button:hover { color: var(--text); }
.btn:focus-visible, .seg button:focus-visible { outline: 2px solid #8f8cff; outline-offset: 2px; }

/* Side-by-side row */
.row { background: var(--chat); border-radius: 16px; padding: 14px 10px 10px; border: 1px solid var(--line); display: flex; flex-wrap: wrap; justify-content: space-around; gap: 6px 10px; transition: background 160ms ease; }
.row figure { margin: 0; text-align: center; }
.row figcaption { font-size: 12px; color: var(--muted); font-weight: 600; }
[data-bg="light"] .row figcaption { color: #5c5866; }
:root[data-bg="checker"] .row { background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 20px 20px; }

/* Chat mock */
.chat { background: var(--chat); border-radius: 16px; padding: 18px 18px 8px; border: 1px solid var(--line); transition: background 160ms ease; }
.msg { display: grid; grid-template-columns: 40px 1fr; gap: 12px; padding: 6px 0 14px; }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #4641d9, #8f8cff); display: grid; place-items: center; font-weight: 700; color: #fff; }
.who { font-weight: 650; font-size: 14px; }
[data-bg="light"] .who { color: #1f1d23; }
.when { color: var(--muted); font-size: 12px; margin-left: 8px; font-weight: 400; }
.sticker-160 { width: 160px; height: 160px; margin-top: 4px; }

/* Cards */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(330px, 100%), 1fr)); gap: 16px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
.stage { background: var(--chat); display: grid; place-items: center; padding: 10px 0; transition: background 160ms ease; }
:root[data-bg="checker"] .stage, :root[data-bg="checker"] .chat { background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 20px 20px; }
.sticker-320 { width: min(320px, 100%); aspect-ratio: 1; }
.meta { padding: 12px 14px 14px; display: grid; gap: 6px; }
.meta h3 { margin: 0; font-size: 16px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.meta p { margin: 0; color: var(--muted); font-size: 13px; }
.stats { display: flex; flex-wrap: wrap; gap: 6px; }
.stat { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--panel-2); color: var(--text); font-variant-numeric: tabular-nums; }
.stat.ok::before { content: "✓ "; color: var(--ok); }

/* Inspector */
.inspect { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
.big { background: var(--chat); border: 1px solid var(--line); border-radius: 16px; display: grid; place-items: center; padding: 12px; min-height: 360px; min-width: 0; transition: background 160ms ease; }
:root[data-bg="checker"] .big { background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 20px 20px; }
.big .pair { display: flex; flex-wrap: wrap; gap: 18px; justify-content: center; align-items: flex-end; width: 100%; }
.big figure { margin: 0; text-align: center; color: var(--muted); font-size: 12px; min-width: 0; max-width: 100%; }
.sticker-big { width: min(440px, 100%); aspect-ratio: 1; }
.webp { display: block; width: min(320px, 100%); height: auto; aspect-ratio: 1; }
.big .pair figure:first-child { flex: 0 1 440px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: grid; gap: 12px; align-content: start; }
.panel label { font-size: 12px; color: var(--muted); display: grid; gap: 6px; }
.readout { font-variant-numeric: tabular-nums; font-size: 13px; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
.readout b { font-weight: 600; text-align: right; }
input[type="range"] { width: 100%; accent-color: var(--brand); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; width: 34%; }
.note { color: var(--muted); font-size: 12px; }
@media (max-width: 820px) { .inspect { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .seg button, .chat, .stage, .big { transition: none; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <span class="pill">Unpublished mascot · local review only</span>
      <h1>Spectre sticker pack</h1>
      <p class="sub">Five Lottie stickers at 320 × 320, 60 fps, vector only, seamless loops.</p>
    </div>
    <div class="toolbar" role="group" aria-label="Background">
      <div class="seg" id="bg">
        <button type="button" data-bg="dark" aria-pressed="true">Dark chat</button>
        <button type="button" data-bg="light" aria-pressed="false">Light chat</button>
        <button type="button" data-bg="checker" aria-pressed="false">Transparent</button>
      </div>
      <button type="button" class="btn" id="playAll">Pause all</button>
    </div>
  </header>

  <h2>Side by side at sticker size (160 px)</h2>
  <div class="row" id="row"></div>

  <h2>Full size (320 px)</h2>
  <div class="grid" id="grid"></div>

  <h2>Inspect</h2>
  <div class="inspect">
    <div class="big"><div class="pair">
      <figure><div class="sticker-big" id="bigStage"></div><figcaption>Lottie (lottie-web ${LOTTIE_VERSION})</figcaption></figure>
      <figure id="webpFig"><img class="webp" id="webp" alt="" width="320" height="320"><figcaption id="webpCap">Animated WebP fallback</figcaption></figure>
    </div></div>
    <div class="panel">
      <label>Sticker <span class="seg" id="pick"></span></label>
      <label>Speed <span class="seg" id="speed">
        <button type="button" data-speed="1" aria-pressed="true">1×</button>
        <button type="button" data-speed="0.5" aria-pressed="false">½×</button>
        <button type="button" data-speed="0.25" aria-pressed="false">¼×</button>
      </span></label>
      <label>Frame <input type="range" id="scrub" min="0" max="1" step="1" value="0"></label>
      <div class="toolbar">
        <button type="button" class="btn" id="toggle">Pause</button>
        <button type="button" class="btn" id="prev" aria-label="Previous frame">◀ 1</button>
        <button type="button" class="btn" id="next" aria-label="Next frame">1 ▶</button>
        <button type="button" class="btn" id="seam">Loop seam</button>
      </div>
      <div class="readout">
        <span>Frame</span><b id="frameOut">0 / 0</b>
        <span>Timeline</span><b id="tlOut">60 fps</b>
        <span>Frames drawn</span><b id="fpsOut">–</b>
        <span>Mode</span><b id="modeOut">Playing</b>
      </div>
      <p class="note">“Frames drawn” counts distinct animation frames rendered per second with sub-frame interpolation off, so it reads the sticker's own frame rate rather than the display's refresh rate. “Loop seam” plays the last and first 30 frames back to back at ¼ speed.</p>
    </div>
  </div>

  <h2>In a chat</h2>
  <div class="chat" id="chat"></div>

  <h2>Specs and checks</h2>
  <table id="specs"></table>
  <p class="note">Discord's limits: stickers are exactly 320 × 320; files up to 512 KiB; animated stickers up to 5 s; Lottie JSON must be vector only (no raster images) and can only be uploaded by Verified or Partnered servers. Sources: Discord developer docs (Sticker resource), Discord blog “How to create and upload your own stickers on Discord” and “Unleash your creativity with stickers”.</p>
</main>

<script>/* lottie-web ${LOTTIE_VERSION} (lottie_light build), MIT licence, pinned and inlined */
${lottieSrc}</script>
<script>window.STICKERS = ${safe(JSON.stringify(stickers))};</script>
<script>
(() => {
  const S = window.STICKERS;
  const kib = (b) => (b / 1024).toFixed(1) + ' KiB';
  const all = [];
  let pausedAll = false;
  // Players scrolled out of view pause, so the page stays light with sixteen of them.
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const a = e.target.__anim;
      if (!a || a === big) return;
      if (e.isIntersecting && !pausedAll) a.play(); else a.pause();
    });
  }, { rootMargin: '120px' }) : null;
  const mount = (el, data, opts = {}) => {
    const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: true, animationData: data, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
    if (opts.subframe === false) anim.setSubframe(false);
    all.push(anim);
    el.__anim = anim;
    if (io && !opts.noObserve) io.observe(el);
    return anim;
  };

  // Background switcher
  const root = document.documentElement;
  const bgBtns = [...document.querySelectorAll('#bg button')];
  const setBg = (v) => {
    root.dataset.bg = v;
    bgBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bg === v)));
    try { localStorage.setItem('spectre-bg', v); } catch (e) {}
  };
  bgBtns.forEach((b) => b.addEventListener('click', () => setBg(b.dataset.bg)));
  try { const v = localStorage.getItem('spectre-bg'); if (v) setBg(v); } catch (e) {}

  // Side-by-side row
  const row = document.getElementById('row');
  S.forEach((s) => {
    const fig = document.createElement('figure');
    fig.innerHTML = '<div class="sticker-160" role="img" aria-label="Spectre ' + s.name + ' sticker"></div><figcaption>' + s.name + '</figcaption>';
    row.appendChild(fig);
    mount(fig.querySelector('.sticker-160'), s.data);
  });

  // Chat mock
  const chat = document.getElementById('chat');
  const people = ['Ash', 'Bo', 'Cass', 'Dee', 'Eli'];
  S.forEach((s, k) => {
    const row = document.createElement('div');
    row.className = 'msg';
    row.innerHTML = '<div class="avatar">' + people[k][0] + '</div><div><div class="who">' + people[k] + '<span class="when">Today at 12:0' + k + '</span></div><div class="sticker-160" role="img" aria-label="Spectre ' + s.name + ' sticker"></div></div>';
    chat.appendChild(row);
    mount(row.querySelector('.sticker-160'), s.data);
  });

  // Cards
  const grid = document.getElementById('grid');
  S.forEach((s) => {
    const card = document.createElement('article');
    card.className = 'card';
    const secs = (s.frames / s.fps).toFixed(2);
    card.innerHTML = '<div class="stage"><div class="sticker-320" role="img" aria-label="Spectre ' + s.name + ' sticker"></div></div>' +
      '<div class="meta"><h3>' + s.name + '<span class="stat">' + secs + ' s</span></h3><p>' + s.blurb + '</p>' +
      '<div class="stats"><span class="stat ok">' + s.w + ' × ' + s.h + '</span><span class="stat ok">' + s.fps + ' fps · ' + s.frames + ' frames</span>' +
      '<span class="stat ok">Lottie ' + kib(s.bytes) + '</span>' + (s.webpBytes ? '<span class="stat">WebP ' + kib(s.webpBytes) + '</span>' : '') + '</div></div>';
    grid.appendChild(card);
    mount(card.querySelector('.sticker-320'), s.data);
  });

  // Inspector
  const bigEl = document.getElementById('bigStage');
  const scrub = document.getElementById('scrub');
  const frameOut = document.getElementById('frameOut');
  const fpsOut = document.getElementById('fpsOut');
  const tlOut = document.getElementById('tlOut');
  const modeOut = document.getElementById('modeOut');
  const toggle = document.getElementById('toggle');
  const webp = document.getElementById('webp');
  const webpCap = document.getElementById('webpCap');
  const pick = document.getElementById('pick');
  let big = null, cur = 0, speed = 1, seamMode = false;
  let lastFrame = -1, stamps = [];

  const show = (k) => {
    cur = k;
    [...pick.children].forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    if (big) { big.destroy(); all.splice(all.indexOf(big), 1); }
    const s = S[k];
    big = mount(bigEl, s.data, { subframe: false, noObserve: true });
    big.setSpeed(speed);
    seamMode = false;
    scrub.max = String(s.frames - 1);
    tlOut.textContent = s.fps + ' fps · ' + (s.frames / s.fps).toFixed(2) + ' s';
    webp.src = 'fallback/spectre-' + s.id + '.webp';
    webp.alt = 'Animated WebP fallback of the ' + s.name + ' sticker';
    webpCap.textContent = 'Animated WebP fallback' + (s.webpBytes ? ' (' + kib(s.webpBytes) + ')' : '');
    big.addEventListener('enterFrame', () => {
      const f = Math.round(big.currentFrame) % s.frames;
      if (f !== lastFrame) { stamps.push(performance.now()); lastFrame = f; }
      scrub.value = String(f);
      frameOut.textContent = f + ' / ' + (s.frames - 1);
    });
    toggle.textContent = 'Pause';
    modeOut.textContent = 'Playing';
  };
  S.forEach((s, k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = s.name; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => show(k));
    pick.appendChild(b);
  });
  webp.addEventListener('error', () => { webpCap.textContent = 'WebP fallback not found next to this page'; });

  // Distinct frames drawn over the last two seconds.
  setInterval(() => {
    const now = performance.now();
    stamps = stamps.filter((t) => now - t <= 2000);
    fpsOut.textContent = big && !big.isPaused ? (stamps.length / 2).toFixed(1) + ' fps' : 'paused';
  }, 500);

  toggle.addEventListener('click', () => {
    if (big.isPaused) { big.play(); toggle.textContent = 'Pause'; modeOut.textContent = seamMode ? 'Loop seam' : 'Playing'; }
    else { big.pause(); toggle.textContent = 'Play'; modeOut.textContent = 'Paused'; }
  });
  const step = (d) => {
    const s = S[cur];
    big.pause(); toggle.textContent = 'Play'; modeOut.textContent = 'Paused';
    const f = (Math.round(big.currentFrame) + d + s.frames) % s.frames;
    big.goToAndStop(f, true);
    scrub.value = String(f); frameOut.textContent = f + ' / ' + (s.frames - 1);
  };
  document.getElementById('prev').addEventListener('click', () => step(-1));
  document.getElementById('next').addEventListener('click', () => step(1));
  scrub.addEventListener('input', () => {
    big.pause(); toggle.textContent = 'Play'; modeOut.textContent = 'Paused';
    big.goToAndStop(+scrub.value, true); frameOut.textContent = scrub.value + ' / ' + (S[cur].frames - 1);
  });
  document.getElementById('seam').addEventListener('click', () => {
    const n = S[cur].frames;
    seamMode = true;
    big.setSpeed(0.25);
    big.playSegments([[n - 30, n], [0, 30]], true);
    toggle.textContent = 'Pause'; modeOut.textContent = 'Loop seam';
  });
  [...document.querySelectorAll('#speed button')].forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('#speed button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (seamMode) { seamMode = false; big.resetSegments(true); }
    big.setSpeed(speed); big.play(); toggle.textContent = 'Pause'; modeOut.textContent = 'Playing';
  }));

  const playAll = document.getElementById('playAll');
  playAll.addEventListener('click', () => {
    pausedAll = !pausedAll;
    all.forEach((a) => (pausedAll ? a.pause() : a.play()));
    playAll.textContent = pausedAll ? 'Play all' : 'Pause all';
    if (!pausedAll) { toggle.textContent = 'Pause'; modeOut.textContent = 'Playing'; }
  });

  // Spec table
  const rows = [
    ['Format', 'Lottie JSON (Bodymovin 5.12 schema), shape layers only, no images, no expressions'],
    ['Canvas', S.map((s) => s.name + ' ' + s.w + '×' + s.h).join(', ')],
    ['Frame rate', S.map((s) => s.name + ' ' + s.fps + ' fps').join(', ') + '; every frame differs from the last (no held frames)'],
    ['Length', S.map((s) => s.name + ' ' + (s.frames / s.fps).toFixed(2) + ' s').join(', ') + ' (limit 5 s)'],
    ['File size', S.map((s) => s.name + ' ' + kib(s.bytes)).join(', ') + ' (limit 512 KiB)'],
    ['Fallback', 'Animated WebP, 320 × 320, 60 fps (17/17/16 ms frames), lossy with alpha'],
    ['Player', 'lottie-web ' + '${LOTTIE_VERSION}' + ' (light SVG build), pinned and inlined in this page'],
  ];
  document.getElementById('specs').innerHTML = rows.map((r) => '<tr><th scope="row">' + r[0] + '</th><td>' + r[1] + '</td></tr>').join('');

  show(0);
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'preview.html'), html);
console.log(`preview.html written (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB)`);
