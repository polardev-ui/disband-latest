// Frame composer for "The Way It Used to Feel.": dimensional type and the end
// lines over the one continuous WebGL scene, everything a pure function of time.
import { T, DURATION, WIDTH, HEIGHT, COPY } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);

await document.fonts.load('800 100px "Inter"');
await document.fonts.load('500 46px "Inter"');

function kineticWords(el, text) {
  el.textContent = "";
  const words = [];
  for (const line of text.split("|")) {
    const row = document.createElement("span");
    row.className = "line";
    line.split(" ").forEach((word, i) => {
      if (i > 0) { const sp = document.createElement("span"); sp.className = "k"; sp.textContent = " "; row.appendChild(sp); }
      const w = document.createElement("span");
      w.className = "w";
      const chars = [];
      for (const ch of word) { const c = document.createElement("span"); c.className = "k"; c.textContent = ch; w.appendChild(c); chars.push(c); }
      row.appendChild(w);
      words.push(chars);
    });
    el.appendChild(row);
  }
  return words;
}

function animateChars(chars, t, o) {
  const rise = o.rise ?? 0.3, scaleFrom = o.scaleFrom ?? 0.88, blur = o.blur ?? 0.06;
  chars.forEach((c, i) => {
    const st = o.inStart + i * o.stagger;
    const p = prog(t, st, st + o.dur);
    const e = revealEase(p);
    let op = smooth(p * 2.2), y = (1 - e) * rise, s = lerp(scaleFrom, 1, e), b = (1 - e) * blur;
    if (o.outStart !== undefined) {
      const q = ease.inCubic(prog(t, o.outStart + i * 0.008, o.outStart + i * 0.008 + 0.32));
      op *= 1 - q; y -= q * 0.15; b += q * blur;
    }
    c.style.opacity = op.toFixed(4);
    c.style.transform = `translate3d(0, ${y.toFixed(4)}em, 0) scale(${s.toFixed(4)})`;
    c.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}
function animateWords(words, t, { start, step = 0.1, outStart, dur = 0.6, stagger = 0.018 }) {
  let n = 0;
  words.forEach((chars, i) => {
    animateChars(chars, t, { inStart: start + i * step, stagger, dur, outStart: outStart === undefined ? undefined : outStart + n * 0.008 });
    n += chars.length;
  });
}

// ---- dimensional type -----------------------------------------------------------
// Front layer in the headline white; eight layers behind it in the app's own
// greys, darkest at the back.
const DEPTH = ["#949ba4", "#80848e", "#6d6f78", "#4e5058", "#3f4147", "#313338", "#2b2d31", "#1e1f22"];
const measure = document.createElement("canvas").getContext("2d");
function fitSize(text, { max, min = 64, width = 880, tracking = -0.02 }) {
  measure.font = `800 ${max}px "Inter"`;
  const widest = Math.max(...text.split("|").map((l) => measure.measureText(l).width + tracking * max * l.length));
  return Math.max(min, Math.min(max, Math.floor((max * width) / widest)));
}
function dimText(id, text, { max = 112, tracking = -0.02 } = {}) {
  const el = $(id);
  el.textContent = "";
  const rig = document.createElement("div");
  rig.className = "rig";
  el.appendChild(rig);
  const size = fitSize(text, { max, tracking });
  const layers = [];
  for (let k = DEPTH.length; k >= 0; k--) {
    const L = document.createElement("div");
    L.className = `layer txt${k === 0 ? " front" : ""}`;
    L.style.fontSize = `${size}px`;
    L.style.letterSpacing = `${tracking}em`;
    if (tracking > 0) L.style.textIndent = `${tracking}em`;
    if (k > 0) L.style.color = DEPTH[k - 1];
    rig.appendChild(L);
    layers[k] = { el: L, words: kineticWords(L, text) };
  }
  return { el, rig, layers, size };
}

// In: the layers arrive spread in depth and tilted, each a beat behind the one
// in front, and close into a short extrusion; the front lands flat and still.
// Out: the stack opens again as the letters leave.
function animateDim(d, t, { start, out, step = 0.09, settleDur = 1.1 }) {
  const on = t >= start - 0.02 && (out === undefined || t < out + 0.75);
  d.el.style.display = on ? "block" : "none";
  if (!on) return;
  const inP = prog(t, start, start + settleDur);
  const settle = ease.outCubic(inP);
  const tilt = ease.bezier(0.2, 0.8, 0.2, 1)(inP);
  const outP = out === undefined ? 0 : ease.inCubic(prog(t, out, out + 0.55));
  const gap = lerp(30, 2.4, settle) + 34 * outP;
  const rx = lerp(-32, 0, tilt) + 22 * outP;
  const ry = lerp(12, 0, settle) - 9 * outP;
  d.rig.style.transform = inP >= 1 && outP <= 0 ? "none" : `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
  d.layers.forEach((L, k) => {
    L.el.style.transform = k ? `translate3d(${(k * 0.8).toFixed(2)}px, ${(k * 1.3).toFixed(2)}px, ${(-k * gap).toFixed(2)}px)` : "none";
    animateWords(L.words, t - k * 0.02, { start, step, outStart: out === undefined ? undefined : out + k * 0.012 });
  });
}

const says = [
  [dimText("title", COPY.title), { start: T.title, out: T.titleOut, step: 0.08 }],
  [dimText("home", COPY.home), { start: T.home, out: T.homeOut }],
  [dimText("familiar", COPY.familiar), { start: T.familiar, out: T.familiarOut, step: 0.12 }],
  [dimText("next", COPY.next), { start: T.next, out: T.nextOut, step: 0.1 }],
  [dimText("name", COPY.name, { max: 104, tracking: 0.22 }), { start: T.name, out: T.settle, step: 0, settleDur: 1.4 }],
  [dimText("cta", COPY.cta, { max: 84 }), { start: T.cta, step: 0.07 }],
];
const slogan = kineticWords($("slogan"), COPY.slogan).flat();
$("url").style.fontSize = `${fitSize(COPY.url, { max: 156, width: 900, tracking: -0.04 })}px`;
const url = kineticWords($("url"), COPY.url).flat();

// ---- the 3D ------------------------------------------------------------------------
const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
// The shared output pass, minus the neutral tone curve's toe, so the captured
// UI keeps its exact dark greys; highlights still roll off.
engine.outMat.fragmentShader = engine.outMat.fragmentShader.replace("float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;", "float offset = 0.0;");
engine.outMat.needsUpdate = true;
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
engine.outMat.uniforms.bg.value.setRGB(toLinear(11), toLinear(12), toLinear(14));
const shots = await createShots(engine);
window.__engine = engine;

function render(t) {
  for (const [d, o] of says) animateDim(d, t, o);
  const slOn = t >= T.slogan - 0.02 && t < T.settle + 0.6;
  $("slogan").style.display = slOn ? "block" : "none";
  if (slOn) animateChars(slogan, t, { inStart: T.slogan, stagger: 0.012, dur: 0.6, outStart: T.settle + 0.05 });
  const urlOn = t >= T.url - 0.02;
  $("url").style.display = urlOn ? "block" : "none";
  if (urlOn) animateChars(url, t, { inStart: T.url, stagger: 0.03, dur: 0.5, rise: 0.08, scaleFrom: 0.92 });
  engine.renderFrame((ts) => shots.pose(ts), t, { samples: shots.samplesFor(t), shutter: 0.4, fps: 30 });
}

window.renderFrame = (t) => { render(t); return Promise.resolve(true); };
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
