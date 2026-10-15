// Frame composer for "A New Way to Connect.": DOM typography and graphic
// transitions over the WebGL product shots, everything a pure function of time.
import { T, DURATION, WIDTH, HEIGHT } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);
const punch = ease.bezier(0.16, 1, 0.3, 1);

const markSvg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
$("markpath").setAttribute("d", markSvg.match(/ d="([^"]+)"/)[1]);

// Lines of words; every character in its own box, words never break.
// Returns one array of character spans per word.
function kineticWords(el, lines) {
  el.textContent = "";
  const words = [];
  for (const line of lines) {
    const row = document.createElement("span");
    row.className = "line";
    line.split(" ").forEach((word, i) => {
      if (i > 0) { const sp = document.createElement("span"); sp.className = "k"; sp.textContent = " "; row.appendChild(sp); }
      const w = document.createElement("span");
      w.className = "w";
      const chars = [];
      for (const ch of word) {
        const c = document.createElement("span");
        c.className = "k"; c.textContent = ch; w.appendChild(c); chars.push(c);
      }
      row.appendChild(w);
      words.push(chars);
    });
    el.appendChild(row);
  }
  return words;
}

/** Per-character reveal (rise, focus, scale) and optional exit. */
function animateChars(chars, t, o) {
  const dx = o.dx ?? 0, rise = o.rise ?? 0.3, scaleFrom = o.scaleFrom ?? 0.86, blur = o.blur ?? 0.09;
  chars.forEach((c, i) => {
    const start = o.inStart + i * o.stagger;
    const p = prog(t, start, start + o.dur);
    const e = revealEase(p);
    let op = smooth(p * 2.2);
    let x = (1 - e) * dx, y = (1 - e) * rise, s = lerp(scaleFrom, 1, e), b = (1 - e) * blur;
    if (o.outStart !== undefined) {
      const os = o.outStart + i * (o.outStagger ?? 0.012);
      const q = ease.inCubic(prog(t, os, os + (o.outDur ?? 0.42)));
      op *= 1 - q; y -= q * 0.22; b += q * blur; s *= 1 + 0.03 * q;
    }
    c.style.opacity = op.toFixed(4);
    c.style.transform = `translate3d(${x.toFixed(4)}em, ${y.toFixed(4)}em, 0) scale(${s.toFixed(4)})`;
    c.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

/** Each word lands on its own beat; exits run through the line in reading order. */
function animateWords(words, times, t, o) {
  let n = 0;
  words.forEach((chars, i) => {
    const outStart = o.outStart === undefined ? undefined : o.outStart + n * (o.outStagger ?? 0.012);
    animateChars(chars, t, { ...o, inStart: times[i], outStart });
    n += chars.length;
  });
}

const line1 = kineticWords($("line1"), ["Meet your next", "social platform."]);
const line2 = kineticWords($("line2"), ["Connect on", "your terms."]);
const simple = kineticWords($("wSimple"), ["SIMPLE."]).flat();
const social = kineticWords($("wSocial"), ["SOCIAL."]).flat();
const disband = kineticWords($("wDisband"), ["DISBAND."]).flat();
const slogan = kineticWords($("slogan"), ["Privacy first, privacy always."]).flat();
const disc = kineticWords($("disc"), ["Discover Disband at"]).flat();
const url = kineticWords($("url"), ["disband.dev"]).flat();
await document.fonts.load('700 176px "Inter"');
await document.fonts.load('600 96px "Inter"');
await document.fonts.load('500 44px "Inter"');

// Where each letter of DISBAND. sits relative to the word's centre, for the
// collapse into the mark.
$("s4").style.display = "block";
const dRect = $("wDisband").getBoundingClientRect();
const dOffsets = disband.map((c) => { const r = c.getBoundingClientRect(); return dRect.left + dRect.width / 2 - (r.left + r.width / 2); });
$("s4").style.display = "none";

const layers = ["s1", "s3", "s4", "s5"];
const show = (v) => layers.forEach((id) => { $(id).style.display = v.includes(id) ? "block" : "none"; });

// ---- Scene 1: the cut to the mark, then the first line ---------------------
const LOGO1_H = 472;
function scene1(t) {
  const logo = $("logo1");
  const p = prog(t, T.match, T.match + 0.24);
  const pop = 1 + 0.06 * Math.sin(Math.PI * p) * (1 - p);
  const m = ease.bezier(0.6, 0, 0.2, 1)(prog(t, T.logoUp, T.logoSet));
  const out = ease.inCubic(prog(t, T.line1Out, T.line1Out + 0.4));
  logo.style.transform = `translate3d(0, ${(-320 * m - 140 * out).toFixed(2)}px, 0) scale(${(pop * lerp(1, 0.6, m)).toFixed(4)})`;
  logo.style.opacity = (1 - out).toFixed(4);
  logo.style.filter = out > 0.01 ? `blur(${(out * 8).toFixed(2)}px)` : "none";
  // One thin ring leaves the mark as it cuts in.
  const rp = ease.outCubic(prog(t, T.match, T.match + 0.5));
  const r = lerp(300, 780, rp);
  const ring = $("ring");
  ring.style.width = ring.style.height = `${(2 * r).toFixed(1)}px`;
  ring.style.margin = `${(-r).toFixed(1)}px 0 0 ${(-r).toFixed(1)}px`;
  ring.style.opacity = (0.55 * (1 - rp)).toFixed(4);
  ring.style.borderWidth = `${lerp(4, 1, rp).toFixed(2)}px`;
  animateWords(line1, T.words1, t, { stagger: 0.014, dur: 0.42, rise: 0.36, outStart: T.line1Out, outStagger: 0.008, outDur: 0.34 });
}

// ---- Iris: a black disc out of the edge-on phone, then a hole out of black --
function iris(t) {
  const el = $("iris");
  const R = 1180, cx = 540, cy = 968;
  if (t >= T.iris && t < T.irisFull) {
    const r = R * ease.inCubic(prog(t, T.iris, T.irisFull));
    el.style.background = `radial-gradient(circle at ${cx}px ${cy}px, #0b0b0c ${r.toFixed(1)}px, rgba(11,11,12,0) ${(r + 1.5).toFixed(1)}px)`;
    el.style.display = "block";
  } else if (t >= T.irisFull && t < T.irisOpen) {
    const r = R * ease.outCubic(prog(t, T.irisFull, T.irisOpen));
    el.style.background = `radial-gradient(circle at ${cx}px 960px, rgba(11,11,12,0) ${r.toFixed(1)}px, #0b0b0c ${(r + 1.5).toFixed(1)}px)`;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

// ---- Scene 4: three words, three moves -------------------------------------
function scene4(t) {
  // SIMPLE. — scale: drops in from big and soft to sharp.
  const sp = punch(prog(t, T.simple, T.simple + 0.34));
  const so = ease.inCubic(prog(t, T.simpleOut, T.simpleOut + 0.22));
  const ws = $("wSimple");
  ws.style.opacity = (smooth(sp * 3) * (1 - so)).toFixed(4);
  ws.style.transform = `scale(${(lerp(2.6, 1, sp) * lerp(1, 0.86, so)).toFixed(4)})`;
  const sb = (1 - sp) * 22 + so * 10;
  ws.style.filter = sb > 0.05 ? `blur(${sb.toFixed(2)}px)` : "none";
  ws.style.display = t >= T.simple - 0.02 && so < 1 ? "block" : "none";

  // SOCIAL. — slide: the letters run in from the right and out to the left.
  const wo = $("wSocial");
  wo.style.display = t >= T.social - 0.02 && t < T.socialOut + 0.5 ? "block" : "none";
  social.forEach((c, i) => {
    const a = punch(prog(t, T.social + i * 0.028, T.social + i * 0.028 + 0.34));
    const b = ease.inCubic(prog(t, T.socialOut + i * 0.022, T.socialOut + i * 0.022 + 0.24));
    const x = (1 - a) * 1.5 - b * 1.5;
    c.style.opacity = (smooth(a * 2.5) * (1 - b)).toFixed(4);
    c.style.transform = `translate3d(${x.toFixed(4)}em, 0, 0) skewX(${(-14 * (1 - a) + 14 * b).toFixed(2)}deg)`;
    const bl = (1 - a) * 0.06 + b * 0.06;
    c.style.filter = bl > 0.002 ? `blur(${bl.toFixed(4)}em)` : "none";
  });

  // DISBAND. — depth: letters swing up out of the distance from the centre
  // outwards, then fold into the mark.
  const wd = $("wDisband");
  wd.style.display = t >= T.disband - 0.02 && t < T.logoResolve + 0.05 ? "block" : "none";
  const mid = (disband.length - 1) / 2;
  disband.forEach((c, i) => {
    const st = T.disband + Math.abs(i - mid) * 0.04;
    const a = ease.bezier(0.2, 0.85, 0.2, 1)(prog(t, st, st + 0.48));
    const r = ease.inCubic(prog(t, T.resolve, T.logoResolve));
    const z = -1700 * (1 - a), rx = -78 * (1 - a);
    c.style.opacity = (smooth(a * 2) * (1 - smooth(r * 1.4))).toFixed(4);
    c.style.transform = `translate3d(${(dOffsets[i] * r).toFixed(2)}px, 0, ${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) scale(${lerp(1, 0.25, r).toFixed(4)})`;
    const bl = r * 0.08;
    c.style.filter = bl > 0.002 ? `blur(${bl.toFixed(4)}em)` : "none";
  });
}

// ---- Scene 5: the mark from the word, then everything settles --------------
function scene5(t) {
  const logo = $("logo4");
  const a = prog(t, T.resolve + 0.12, T.logoResolve + 0.3);
  const grow = a < 0.45 ? lerp(0.25, 1.07, ease.outCubic(a / 0.45)) : lerp(1.07, 1, ease.inOutSine((a - 0.45) / 0.55));
  const settle = ease.inOutCubic(prog(t, T.calm, T.endSet));
  const breathe = 1 + 0.02 * ease.inOutSine(prog(t, T.logoResolve + 0.3, T.calm));
  logo.style.opacity = smooth(a * 3).toFixed(4);
  logo.style.transform = `translate3d(0, ${(-300 * settle).toFixed(2)}px, 0) scale(${(grow * lerp(breathe, 0.9, settle)).toFixed(4)})`;
  animateChars(slogan, t, { inStart: T.slogan, stagger: 0.014, dur: 0.6 });
  animateChars(disc, t, { inStart: T.endLine, stagger: 0.014, dur: 0.55 });
  animateChars(url, t, { inStart: T.endUrl, stagger: 0.03, dur: 0.5, dx: 0.25, rise: 0.06, scaleFrom: 0.92 });
  $("s5").style.transform = `scale(${(1 + 0.012 * ease.inOutSine(prog(t, T.endSet, DURATION))).toFixed(5)})`;
  $("s5").style.transformOrigin = "50% 46%";
}

const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
// The prism ends exactly the size the mark is drawn at in scene 1.
const matchHeight = LOGO1_H * (2 * 40 * Math.tan(Math.PI / 12)) / HEIGHT;
const shots = await createShots(engine, { matchHeight });
window.__engine = engine;

function render(t) {
  const v = [];
  if (t >= T.match && t < T.line1Out + 0.45) { v.push("s1"); scene1(t); }
  if (t >= T.words2[0] - 0.05 && t < T.line2Out + 0.6) {
    v.push("s3");
    animateWords(line2, T.words2, t, { stagger: 0.016, dur: 0.45, rise: 0.34, outStart: T.line2Out, outStagger: 0.01, outDur: 0.36 });
  }
  if (t >= T.simple - 0.05 && t < T.logoResolve + 0.05) { v.push("s4"); scene4(t); }
  if (t >= T.resolve) { v.push("s5"); scene5(t); }
  show(v);
  iris(t);

  const canvas = $("gl");
  if (shots.active(t)) {
    canvas.style.display = "block";
    shots.prepare(t);
    const shot = shots.shotAt(t);
    engine.renderFrame((ts) => shots.pose(ts, shot), t, { samples: shots.samplesFor(t) });
  } else {
    canvas.style.display = "none";
  }
}

window.renderFrame = (t) => { render(t); return Promise.resolve(true); };
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
