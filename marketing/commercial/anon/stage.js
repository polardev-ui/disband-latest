// Frame composer for the Anonymous Accounts launch spot: captions, reels,
// atmosphere and the end card over the WebGL shots, everything a pure function
// of time. Burn-beat wipes composite the outgoing shot over the incoming one.
import { T, DURATION, WIDTH, HEIGHT, COPY, WIPES } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const snapEase = ease.bezier(0.16, 1, 0.3, 1);
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

await document.fonts.load('800 104px "Inter"');
await document.fonts.load('700 84px "JetBrains Mono"');
await document.fonts.load('500 36px "JetBrains Mono"');
await document.fonts.load('500 40px "Inter"');

// ---- Captions ------------------------------------------------------------------
const CAPS = [
  ["hook", 0.0, T.hookOut, "title"],
  ["number", 1.6, 2.95, "body"], ["email", 3.1, 4.95, "body"], ["chips", 5.1, 7.45, "body"],
  ["tiers", 7.6, 9.95, "body"], ["split", 10.1, 12.45, "body"], ["burn", T.poof, 14.45, "body"],
  ["vault", 14.6, 15.7, "body"], ["app", 15.85, 16.95, "body"],
];
const measure = document.createElement("canvas").getContext("2d");
const caps = CAPS.map(([key, tin, tout, layer]) => {
  const el = document.createElement("div");
  el.className = "cap";
  el.dataset.layer = layer;
  el.dataset.key = key;
  el.style.display = "none";
  const lines = COPY[key].split("|");
  // Fit the widest line to 85% of the frame, between 84 and 104 px.
  measure.font = '800 104px "Inter"';
  const widest = Math.max(...lines.map((l) => measure.measureText(l.replace(/[*_]/g, "")).width - 0.03 * 104 * l.length));
  const fs = Math.max(84, Math.min(104, Math.floor(104 * 918 / widest)));
  el.style.fontSize = `${fs}px`;
  const words = [];
  for (const line of lines) {
    const row = document.createElement("span");
    row.className = "line";
    line.split(" ").forEach((w, i) => {
      const span = document.createElement("span");
      span.className = "wd";
      let txt = w;
      if (/^\*.*\*[.,!?]?$/.test(w)) { span.classList.add("hl"); txt = w.replace(/\*/g, ""); }
      if (/^_.*_[.,!?]?$/.test(w)) { span.classList.add("burn"); txt = w.replace(/_/g, ""); }
      span.textContent = (i > 0 ? " " : "") + txt;
      if (span.classList.contains("hl")) { const ul = document.createElement("span"); ul.className = "ul"; span.appendChild(ul); }
      row.appendChild(span);
      words.push(span);
    });
    el.appendChild(row);
  }
  $("caps").appendChild(el);
  return { key, tin, tout, el, words };
});

function captions(t) {
  for (const c of caps) {
    const on = t >= c.tin - 0.001 && t < c.tout;
    c.el.style.display = on ? "block" : "none";
    if (!on) continue;
    const out = ease.inCubic(prog(t, c.tout - 0.12, c.tout));
    if (c.key === "hook") {
      // On screen from frame 0: a flash, not an entrance.
      const f = Math.exp(-t / 0.18);
      c.el.style.transform = `scale(${(1 + 0.05 * f).toFixed(4)})`;
      c.el.style.filter = `brightness(${(1 + 0.6 * f).toFixed(3)})`;
      c.words.forEach((w) => { w.style.opacity = (1 - out).toFixed(4); w.style.transform = "none"; });
      const ul = c.el.querySelector(".ul");
      if (ul) ul.style.transform = `scaleX(${snapEase(prog(t, 0.2, 0.55)).toFixed(4)})`;
      continue;
    }
    if (c.key === "burn") {
      const a = snapEase(prog(t, c.tin, c.tin + 0.22));
      c.el.style.transform = `scale(${lerp(1.7, 1, a).toFixed(4)})`;
      c.el.style.filter = a < 0.99 ? `blur(${((1 - a) * 10).toFixed(2)}px)` : "none";
      c.words.forEach((w) => { w.style.opacity = (smooth(a * 3) * (1 - out)).toFixed(4); w.style.transform = "none"; });
      continue;
    }
    c.el.style.transform = "none";
    c.el.style.filter = "none";
    c.words.forEach((w, i) => {
      const st = c.tin + i * 0.045;
      const a = snapEase(prog(t, st, st + 0.28));
      w.style.opacity = (smooth(a * 2.5) * (1 - out)).toFixed(4);
      w.style.transform = `translate3d(0, ${(0.42 * (1 - a) - 0.15 * out).toFixed(4)}em, 0) scale(${lerp(1.1, 1, a).toFixed(4)})`;
      w.style.filter = a < 0.99 ? `blur(${(0.07 * (1 - a)).toFixed(4)}em)` : "none";
      const ul = w.querySelector(".ul");
      if (ul) ul.style.transform = `scaleX(${snapEase(prog(t, st + 0.12, st + 0.45)).toFixed(4)})`;
    });
  }
}

// ---- Hook reels -----------------------------------------------------------------
const reelRow = $("reelRow");
const reels = [];
{
  const r = mulberry32(5);
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) { const g = document.createElement("div"); g.className = "gap"; reelRow.appendChild(g); }
    const reel = document.createElement("div");
    reel.className = "reel";
    const strip = document.createElement("div");
    strip.className = "strip";
    strip.innerHTML = Array.from({ length: 40 }, (_, k) => `<div>${k % 10}</div>`).join("");
    reel.appendChild(strip);
    reelRow.appendChild(reel);
    reels.push({ strip, phase: r() * 10, speed: 16 + r() * 14 });
  }
}
function hookReels(t) {
  const a = snapEase(prog(t, T.reels, T.reels + 0.35));
  $("reels").style.opacity = smooth(a * 2).toFixed(4);
  $("reels").style.transform = `translate3d(0, ${(40 * (1 - a)).toFixed(2)}px, 0) scale(${lerp(0.9, 1, a).toFixed(4)})`;
  for (const rl of reels) {
    const dt = Math.max(0, t - T.reels);
    const spun = rl.phase + rl.speed * dt - 0.25 * rl.speed * Math.max(0, t - 1.1) ** 2;
    const y = -((spun % 10) + 10) % 10 * 104 - 104 * 10;
    rl.strip.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    const v = rl.speed * (1 - 0.5 * Math.max(0, t - 1.1));
    rl.strip.style.filter = `url(#${v > 24 ? "mb3" : v > 14 ? "mb2" : "mb1"})`;
  }
}

// ---- Atmosphere: bokeh, fog, grain ---------------------------------------------------
const bokeh = $("bokeh").getContext("2d");
const sprites = {};
for (const [name, rgb] of [["v", "124,92,255"], ["i", "88,101,242"], ["w", "235,238,255"]]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.45, `rgba(${rgb},0.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  sprites[name] = c;
}
const motes = [];
{
  const r = mulberry32(99);
  for (let i = 0; i < 90; i++) {
    const z = r();
    motes.push({ x: r() * WIDTH, y: r() * HEIGHT, z, s: lerp(6, 70, z * z * z) + 4, vx: (r() - 0.5) * 12, vy: -(8 + 30 * z), a: lerp(0.08, 0.32, r()) * (z > 0.85 ? 0.5 : 1), k: ["v", "i", "w"][Math.floor(r() * 3)], ph: r() * 6.28 });
  }
}
function drawBokeh(t) {
  bokeh.clearRect(0, 0, WIDTH, HEIGHT);
  for (const m of motes) {
    const x = ((m.x + m.vx * t + 30 * Math.sin(t * 0.4 + m.ph)) % (WIDTH + 200) + WIDTH + 200) % (WIDTH + 200) - 100;
    const y = ((m.y + m.vy * t) % (HEIGHT + 200) + HEIGHT + 200) % (HEIGHT + 200) - 100;
    bokeh.globalAlpha = m.a * (0.75 + 0.25 * Math.sin(t * 1.3 + m.ph));
    bokeh.drawImage(sprites[m.k], x - m.s, y - m.s, m.s * 2, m.s * 2);
  }
  bokeh.globalAlpha = 1;
}
function fog(t) {
  const x1 = 30 + 10 * Math.sin(t * 0.21), y1 = 35 + 6 * Math.cos(t * 0.17);
  const x2 = 70 + 10 * Math.cos(t * 0.19), y2 = 60 + 8 * Math.sin(t * 0.23);
  $("fog").style.background = `radial-gradient(60% 40% at ${x1}% ${y1}%, rgba(124,92,255,.10), transparent 70%), radial-gradient(55% 35% at ${x2}% ${y2}%, rgba(88,101,242,.08), transparent 70%)`;
}
const grainCtx = $("grain").getContext("2d");
const grains = [];
{
  const r = mulberry32(3);
  for (let k = 0; k < 4; k++) {
    const img = grainCtx.createImageData(540, 960);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() - 0.5) * 70; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    grains.push(img);
  }
}

// ---- End card -----------------------------------------------------------------------
function endCard(t) {
  const fadeLoop = 1 - smooth(prog(t, T.loopFade, DURATION));
  const show = (id, at, dur = 0.4, rise = 24) => {
    const a = snapEase(prog(t, at, at + dur));
    const el = $(id);
    el.style.opacity = (smooth(a * 2) * fadeLoop).toFixed(4);
    el.style.transform = `translate3d(0, ${(rise * (1 - a)).toFixed(2)}px, 0)`;
    return a;
  };
  const ls = lerp(0.6, 0.3, ease.outCubic(prog(t, T.wordmark, T.wordmark + 0.9)));
  $("wordmark").style.letterSpacing = `${ls.toFixed(4)}em`;
  $("wordmark").style.textIndent = `${ls.toFixed(4)}em`;
  show("wordmark", T.wordmark);
  show("tagline", T.tagline);
  show("open", T.pill - 0.1);
  const pa = snapEase(prog(t, T.pill, T.pill + 0.4));
  const pulse = T.pulses.reduce((s, p) => s + Math.sin(Math.PI * prog(t, p, p + 0.35)) * (t >= p ? 1 : 0), 0);
  const pill = $("pill");
  pill.style.opacity = (smooth(pa * 2) * fadeLoop).toFixed(4);
  pill.style.transform = `scale(${(lerp(0.85, 1, pa) * (1 + 0.03 * pulse)).toFixed(4)})`;
  const rp = T.pulses.map((p) => prog(t, p, p + 0.5)).find((k) => k > 0 && k < 1) ?? 0;
  $("pillRing").style.opacity = (rp > 0 ? (1 - rp) * 0.9 : 0).toFixed(3);
  $("pillRing").style.transform = `scale(${(1 + 0.12 * rp).toFixed(4)})`;
  const nb = ease.bezier(0.2, 1.6, 0.4, 1)(prog(t, T.newBadge, T.newBadge + 0.3));
  $("newBadge").style.opacity = smooth(nb * 3).toFixed(3);
  $("newBadge").style.transform = `scale(${Math.max(0, nb).toFixed(4)}) rotate(${(8 * (1 - nb)).toFixed(2)}deg)`;
  show("url", T.endHold - 0.2, 0.4, 12);
  $("legal").style.opacity = (0.4 * smooth(prog(t, T.endHold - 0.2, T.endHold + 0.2)) * fadeLoop).toFixed(3);
}

// ---- 3D -----------------------------------------------------------------------------
const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
engine.outMat.uniforms.bg.value.set("#0d1117");
const shots = await createShots(engine);
window.__engine = engine;
window.__shots = shots;

const wipeCtx = $("wipe").getContext("2d");
function renderShot(t, name) {
  shots.prepare(t, name);
  engine.renderFrame((ts) => shots.pose(ts, name), t, { samples: shots.samplesFor(t) });
}

function render(t) {
  drawBokeh(t);
  fog(t);
  grainCtx.putImageData(grains[Math.floor(t * 30) % 4], 0, 0);

  $("hook").style.display = t < T.hookOut ? "block" : "none";
  if (t < T.hookOut) hookReels(t);
  captions(t);
  $("end").style.display = t >= T.end ? "block" : "none";
  if (t >= T.end) endCard(t);
  engine.outMat.uniforms.exposure.value = t >= T.end ? 1 - smooth(prog(t, T.loopFade, DURATION)) : 1;

  const wipe = WIPES.find(([at, d]) => t >= at && t < at + d);
  const name = shots.shotAt(t).name;
  if (wipe) {
    // The outgoing shot, held on its last moment, is wiped off diagonally to
    // reveal the incoming one; an ember line rides the edge.
    const [at, d] = wipe;
    const prev = shots.shotAt(at - 1e-3).name;
    renderShot(at - 1e-3, prev);
    wipeCtx.clearRect(0, 0, WIDTH, HEIGHT);
    const p = ease.inOutCubic(prog(t, at, at + d));
    const x = lerp(-700, WIDTH + 700, p);
    wipeCtx.save();
    wipeCtx.beginPath();
    wipeCtx.moveTo(x + 500, 0); wipeCtx.lineTo(WIDTH + 800, 0); wipeCtx.lineTo(WIDTH + 800, HEIGHT); wipeCtx.lineTo(x - 500, HEIGHT); wipeCtx.closePath();
    wipeCtx.clip();
    wipeCtx.drawImage($("gl"), 0, 0);
    wipeCtx.restore();
    wipeCtx.save();
    wipeCtx.translate(x, HEIGHT / 2);
    wipeCtx.rotate(Math.atan2(1000, HEIGHT)); // along the clip edge
    const g = wipeCtx.createLinearGradient(-30, 0, 30, 0);
    g.addColorStop(0, "rgba(245,158,11,0)"); g.addColorStop(0.5, "rgba(255,190,90,0.95)"); g.addColorStop(1, "rgba(242,63,67,0)");
    wipeCtx.fillStyle = g;
    wipeCtx.fillRect(-30, -1400, 60, 2800);
    wipeCtx.restore();
    $("wipe").style.display = "block";
    renderShot(t, name);
  } else {
    $("wipe").style.display = "none";
    renderShot(t, name);
  }
}

window.renderFrame = (t) => { render(t); return Promise.resolve(true); };
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
