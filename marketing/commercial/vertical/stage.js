// Frame composer for the 9:16 social spot: DOM typography, light and haze over
// the WebGL product shots, everything a pure function of time.
import { T, DURATION, WIDTH, HEIGHT } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);

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
      const os = o.outStart + (o.outIndex ?? i) * (o.outStagger ?? 0.012);
      const q = ease.inCubic(prog(t, os, os + (o.outDur ?? 0.42)));
      op *= 1 - q; y -= q * 0.22; b += q * blur; s *= 1 + 0.03 * q;
    }
    c.style.opacity = op.toFixed(4);
    c.style.transform = `translate3d(${x.toFixed(4)}em, ${y.toFixed(4)}em, 0) scale(${s.toFixed(4)})`;
    c.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

/** Each word lands on its own beat; its letters follow within it. */
function animateWords(words, times, t, o) {
  let n = 0;
  words.forEach((chars, i) => {
    // Exits run through the whole line in reading order.
    const outStart = o.outStart === undefined ? undefined : o.outStart + n * (o.outStagger ?? 0.012);
    animateChars(chars, t, { ...o, inStart: times[i], outStart });
    n += chars.length;
  });
}

const line1 = kineticWords($("line1"), ["Your digital life", "is yours."]);
const line2 = kineticWords($("line2"), ["Meet Disband."]);
const line3 = kineticWords($("line3"), ["Privacy first,", "privacy always."]);
const title = kineticWords($("title"), ["DISBAND"])[0];
const disc = kineticWords($("disc"), ["Discover Disband at"]).flat();
const url = kineticWords($("url"), ["disband.dev"]).flat();
await document.fonts.load('600 104px "Inter"');
await document.fonts.load('500 46px "Inter"');

const layers = ["atmo", "s1", "beamLayer", "s2", "s3", "s4", "s5"];
const show = (v) => layers.forEach((id) => { $(id).style.display = v.includes(id) ? "block" : "none"; });

// ---- Light: the beam and the haze ------------------------------------------
const BEAM_ANGLE = 18; // degrees from vertical, top leaning right
const SWEEPS = [
  { from: T.beamStart, to: T.beamEnd, x0: -420, x1: 1500, k: 1 },
  { from: T.flashPeak - 0.55, to: T.flashPeak + 0.05, x0: -480, x1: 1560, k: 1.5 },
];
function beamAt(t) {
  const s = SWEEPS.find((w) => t >= w.from && t < w.to);
  if (!s) return null;
  const p = prog(t, s.from, s.to);
  return { x: lerp(s.x0, s.x1, ease.inOutSine(p)), k: s.k * Math.pow(Math.sin(Math.PI * p), 0.6), wide: s.k };
}
function drawBeam(b) {
  const el = $("beam");
  el.style.left = `${b.x.toFixed(2)}px`;
  el.style.transform = `rotate(${BEAM_ANGLE}deg) scaleX(${b.wide.toFixed(3)})`;
  el.style.opacity = clamp01(b.k).toFixed(4);
}

function haze(t, amount) {
  const d = (f, ph, a) => Math.sin(2 * Math.PI * (t * f + ph)) * a;
  const spots = [
    ["h1", 1500, 380 + d(0.05, 0, 60), 860 + d(0.04, 0.3, 40), 0.075],
    ["h2", 1300, 980 + d(0.045, 0.6, 70), 1500 + d(0.05, 0.1, 50), 0.06],
    ["h3", 1800, 740 + d(0.03, 0.2, 80), 300 + d(0.035, 0.7, 40), 0.045],
  ];
  for (const [id, size, x, y, a] of spots) {
    const el = $(id);
    el.style.width = el.style.height = `${size}px`;
    el.style.left = `${(x - size / 2).toFixed(1)}px`;
    el.style.top = `${(y - size / 2).toFixed(1)}px`;
    el.style.background = `radial-gradient(circle, rgba(235,238,245,${(a * amount).toFixed(4)}) 0%, rgba(235,238,245,${(a * amount * 0.4).toFixed(4)}) 35%, rgba(235,238,245,0) 70%)`;
  }
}

// ---- Scene 1: the mark found by the light, brought forward, locked ---------
const forwardEase = ease.bezier(0.45, 0, 0.08, 1);
function scene1(t, beam) {
  const box = $("logoBox");
  const e = forwardEase(prog(t, T.logoForward, T.logoLock));
  const seat = prog(t, T.logoLock, T.logoLock + 0.2);
  const seatS = 1 - 0.018 * Math.sin(Math.PI * seat) * (1 - seat * 0.5);
  const out = ease.inCubic(prog(t, T.logoOut, T.logoGone));
  const breathe = 1 + 0.012 * ease.inOutSine(prog(t, T.logoLock, T.logoOut));
  const scale = lerp(0.74, 1, e) * seatS * breathe * lerp(1, 0.9, out);
  const focus = (1 - e) * 4 + out * 10;
  box.style.transform = `translate3d(0, ${(-14 * out).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  box.style.filter = focus > 0.05 ? `blur(${focus.toFixed(2)}px)` : "none";

  // The base mark: a trace of light after the beam passes, full at the lock.
  const base = 0.24 * smooth(prog(t, 0.62, 0.9)) + 0.86 * ease.inCubic(prog(t, 0.95, T.logoLock));
  $("logoBase").style.opacity = (base * (1 - out)).toFixed(4);
  // The lit band follows the beam across the glyph.
  const lit = $("logoLit");
  if (beam && t < T.logoLock) {
    const L = 300 * 0.951 + 337 * 0.309;
    const c = 50 + ((beam.x - 540) * 0.951) / scale / L * 100, hw = 24;
    const m = `linear-gradient(${90 + BEAM_ANGLE}deg, rgba(0,0,0,0) ${(c - hw).toFixed(2)}%, rgba(0,0,0,1) ${c.toFixed(2)}%, rgba(0,0,0,0) ${(c + hw).toFixed(2)}%)`;
    lit.style.webkitMaskImage = lit.style.maskImage = m;
    lit.style.opacity = clamp01(beam.k * 1.2).toFixed(4);
  } else {
    lit.style.opacity = "0";
  }
  // A brief bloom behind the mark as it locks.
  const glow = Math.exp(-Math.max(0, t - T.logoLock) / 0.35) * smooth(prog(t, T.logoLock - 0.04, T.logoLock + 0.02));
  $("logoGlow").style.opacity = ((glow * 0.9 + 0.25 * base) * (1 - out)).toFixed(4);
}

function scene5(t) {
  const logo = $("logo5");
  const lp = prog(t, T.endLogo, T.endLogoLand);
  const ly = (tt) => (1 - ease.bezier(0.3, 0, 0.12, 1)(prog(tt, T.endLogo, T.endLogoLand))) * 120;
  const v = Math.abs(ly(t) - ly(t - 1 / 60));
  const seat = Math.sin(Math.PI * prog(t, T.endLogoLand, T.endLogoLand + 0.16));
  logo.style.opacity = smooth(lp * 2.2).toFixed(4);
  logo.style.transform = `translate3d(0, ${(ly(t) + seat * 2).toFixed(2)}px, 0) scale(${(1 - 0.012 * seat).toFixed(4)})`;
  logo.style.filter = v > 0.4 ? "url(#blurZ)" : "none";
  $("blurZv").setAttribute("stdDeviation", `0 ${Math.min(10, v * 0.4).toFixed(2)}`);
  const ls = lerp(0.7, 0.34, ease.outCubic(prog(t, T.endTitle, T.endTitle + 1.3)));
  $("title").style.letterSpacing = `${ls.toFixed(4)}em`;
  $("title").style.textIndent = `${ls.toFixed(4)}em`;
  animateChars(title, t, { inStart: T.endTitle, stagger: 0.05, dur: 0.75, rise: 0.3 });
  animateChars(disc, t, { inStart: T.endLine, stagger: 0.016, dur: 0.6 });
  animateChars(url, t, { inStart: T.endUrl, stagger: 0.035, dur: 0.5, dx: 0.25, rise: 0.06, scaleFrom: 0.92 });
  $("endGroup").style.transform = `scale(${(1 + 0.014 * ease.inOutSine(prog(t, T.endLogo, DURATION))).toFixed(5)})`;
}

const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
const shots = await createShots(engine);
window.__engine = engine;

function render(t) {
  const v = [];
  const white = t >= T.flashPeak;
  $("bg").style.background = white ? "#fff" : "#000";
  const beam = beamAt(t);

  if (!white) {
    v.push("atmo");
    // Haze breathes up with the beam, then stays as faint air in the dark.
    haze(t, 0.35 * smooth(prog(t, 0.1, 0.9)) + 0.65 * smooth(prog(t, T.logoLock - 0.2, T.phoneEmerged)));
  }
  if (beam) { v.push("beamLayer"); drawBeam(beam); }
  if (t < T.logoGone) { v.push("s1"); scene1(t, beam); }
  if (t >= T.words1[0] - 0.05 && t < T.line1Out + 0.6) {
    v.push("s2");
    animateWords(line1, T.words1, t, { stagger: 0.022, dur: 0.6, outStart: T.line1Out, outStagger: 0.01, outDur: 0.42 });
  }
  if (t >= T.words2[0] - 0.05 && t < T.line2Out + 0.55) {
    v.push("s3");
    animateWords(line2, T.words2, t, { stagger: 0.024, dur: 0.6, outStart: T.line2Out, outStagger: 0.012, outDur: 0.4 });
  }
  if (t >= T.words3[0] - 0.05 && t < T.line3Out + 0.6) {
    v.push("s4");
    animateWords(line3, T.words3, t, { stagger: 0.02, dur: 0.6, outStart: T.line3Out, outStagger: 0.01, outDur: 0.42 });
  }
  if (t >= T.endLogo - 0.05) { v.push("s5"); scene5(t); }
  show(v);

  // The second sweep floods the frame with white; the studio is behind it.
  const up = ease.inCubic(prog(t, T.flashPeak - 0.3, T.flashPeak));
  const down = ease.outCubic(prog(t, T.flashPeak + 0.06, T.flashPeak + 0.6));
  const f = up * (1 - down);
  $("flash").style.display = f > 0.001 ? "block" : "none";
  $("flash").style.opacity = f.toFixed(4);

  const canvas = $("gl");
  if (shots.active(t)) {
    canvas.style.display = "block";
    engine.outMat.uniforms.bg.value.setScalar(shots.background(t));
    engine.outMat.uniforms.exposure.value = t < T.shotLight ? ease.inOutSine(prog(t, T.shotDark, T.shotDark + 1.2)) : 1;
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
