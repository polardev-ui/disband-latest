// Frame composer for "A Familiar Feeling. A New Home.": statements, the mark
// and the end card over the WebGL shots, everything a pure function of time.
import { T, DURATION, WIDTH, HEIGHT, COPY } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);

const markSvg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
$("markpath").setAttribute("d", markSvg.match(/ d="([^"]+)"/)[1]);
await document.fonts.load('700 100px "Inter"');
await document.fonts.load('500 48px "Inter"');
await new Promise((r) => { const im = $("thumb").querySelector("img"); if (im.complete) r(); else im.onload = r; });

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
  const rise = o.rise ?? 0.3, scaleFrom = o.scaleFrom ?? 0.88, blur = o.blur ?? 0.08;
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
function animateWords(words, t, { times, start, step = 0.1, outStart, dur = 0.6 }) {
  let n = 0;
  words.forEach((chars, i) => {
    animateChars(chars, t, { inStart: times ? times[i] : start + i * step, stagger: 0.018, dur, outStart: outStart === undefined ? undefined : outStart + n * 0.008 });
    n += chars.length;
  });
}

// Statements, each fitted to a 900 px safe width (70–104 px).
const measure = document.createElement("canvas").getContext("2d");
const says = [
  ["headline", COPY.headline, T.headline[0], T.headlineOut, { times: T.headline }],
  ["meet", COPY.meet, T.meet, T.meetOut, { start: T.meet }],
  ["home", COPY.home, T.home, T.homeOut, { start: T.home, step: 0.09 }],
  ["familiar", COPY.familiar, T.familiar, T.familiarOut, { start: T.familiar, step: 0.12 }],
  ["built", COPY.built, T.built, T.builtOut, { start: T.built, step: 0.1 }],
].map(([id, text, from, out, opts]) => {
  measure.font = '700 104px "Inter"';
  const widest = Math.max(...text.split("|").map((l) => measure.measureText(l).width - 0.03 * 104 * l.length));
  $(id).style.fontSize = `${Math.max(70, Math.min(104, Math.floor(104 * 880 / widest)))}px`;
  return { id, words: kineticWords($(id), text), from, out, opts: { ...opts, outStart: out } };
});
const end = {
  title: kineticWords($("title"), COPY.title).flat(),
  slogan: kineticWords($("slogan"), COPY.slogan).flat(),
  cta: kineticWords($("cta"), COPY.cta).flat(),
  url: kineticWords($("url"), COPY.url).flat(),
};

// ---- the mark in the opening: cut from the shape, forward, lock, up --------
const LOGO1_H = 360;
function logo1(t) {
  const el = $("logo1");
  const on = t >= T.match && t < T.headlineOut + 0.5;
  el.style.display = on ? "block" : "none";
  if (!on) return;
  const fwd = ease.bezier(0.3, 0, 0.2, 1.25)(prog(t, T.match, T.lock));
  const seat = Math.sin(Math.PI * prog(t, T.lock, T.lock + 0.14)) * (t > T.lock ? 1 : 0);
  const up = ease.inOutCubic(prog(t, T.logoAway - 0.15, T.logoAway + 0.45));
  const out = ease.inCubic(prog(t, T.headlineOut, T.headlineOut + 0.4));
  const s = lerp(1, 1.16, fwd) * (1 - 0.015 * seat) * lerp(1, 0.42, up);
  el.style.transform = `translate3d(0, ${(-560 * up).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
  el.style.opacity = (1 - out).toFixed(4);
}

// ---- end: the mark on white, the name and slogan; then the end card -------
function endCard(t) {
  const fl = ease.outCubic(prog(t, T.edge, T.climax + 0.1));
  const seat = Math.sin(Math.PI * prog(t, T.climax, T.climax + 0.2)) * (t > T.climax ? 1 : 0);
  const mv = ease.inOutCubic(prog(t, T.endMove, T.endMove + 0.6));
  const logo = $("logo2");
  logo.style.opacity = smooth(fl * 2).toFixed(4);
  logo.style.transform = `perspective(1600px) translate3d(0, ${(-470 * mv).toFixed(2)}px, 0) rotateY(${(-90 * (1 - fl)).toFixed(2)}deg) scale(${((1 - 0.02 * seat) * lerp(1, 0.6, mv)).toFixed(4)})`;
  const outTS = ease.inCubic(prog(t, T.endMove, T.endMove + 0.3));
  ls($("title"), lerp(0.62, 0.32, ease.outCubic(prog(t, T.title, T.title + 1.2))));
  animateChars(end.title, t, { inStart: T.title, stagger: 0.05, dur: 0.7 });
  animateChars(end.slogan, t, { inStart: T.slogan, stagger: 0.012, dur: 0.6 });
  $("title").style.opacity = $("slogan").style.opacity = (1 - outTS).toFixed(4);
  const th = ease.bezier(0.2, 0.8, 0.2, 1)(prog(t, T.thumb, T.thumb + 0.7));
  const thumb = $("thumb");
  thumb.style.opacity = smooth(th * 2).toFixed(4);
  thumb.style.transform = `perspective(1800px) translate3d(0, ${(60 * (1 - th)).toFixed(2)}px, 0) rotateX(${(10 * (1 - th) + 4).toFixed(2)}deg) scale(${lerp(0.94, 1, th).toFixed(4)})`;
  animateChars(end.cta, t, { inStart: T.cta, stagger: 0.012, dur: 0.6 });
  animateChars(end.url, t, { inStart: T.url, stagger: 0.03, dur: 0.5, rise: 0.08, scaleFrom: 0.92 });
}
function ls(el, v) { el.style.letterSpacing = `${v.toFixed(4)}em`; el.style.textIndent = `${v.toFixed(4)}em`; }

const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
const matchHeight = LOGO1_H * (2 * 30 * Math.tan(Math.PI / 12)) / HEIGHT;
const shots = await createShots(engine, { matchHeight });
window.__engine = engine;

function render(t) {
  const w = smooth(prog(t, T.white, T.white + 0.6));
  const c = [14, 15, 18].map((v) => Math.round(lerp(v, 255, w)));
  $("bg").style.background = `rgb(${c.join(",")})`;
  $("vig").style.opacity = (1 - w).toFixed(4);

  for (const s of says) {
    const on = t >= s.from - 0.02 && t < s.out + 0.4;
    $(s.id).style.display = on ? "block" : "none";
    if (on) animateWords(s.words, t, s.opts);
  }
  logo1(t);
  $("end").style.display = t >= T.edge - 0.02 ? "block" : "none";
  if (t >= T.edge - 0.02) endCard(t);

  const canvas = $("gl");
  if (shots.active(t)) {
    canvas.style.display = "block";
    engine.outMat.uniforms.bg.value.setRGB(...c.map((v) => Math.pow(v / 255, 2.2)));
    shots.prepare(t);
    engine.renderFrame((ts) => shots.pose(ts), t, { samples: shots.samplesFor(t), shutter: 0.35 });
  } else {
    canvas.style.display = "none";
  }
}

window.renderFrame = (t) => { render(t); return Promise.resolve(true); };
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
