// Frame composer for the Android beta announcement: DOM typography over the
// WebGL product shots, everything a pure function of time.
import { T, DURATION } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);

const markSvg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
$("markpath").setAttribute("d", markSvg.match(/ d="([^"]+)"/)[1]);

// Every character in its own box; words never break.
function kinetic(el, text) {
  el.textContent = "";
  const chars = [];
  for (const part of text.split(/(\s+)/).filter(Boolean)) {
    if (/^\s+$/.test(part)) {
      const sp = document.createElement("span");
      sp.className = "k"; sp.textContent = part; el.appendChild(sp); chars.push(sp);
      continue;
    }
    const w = document.createElement("span");
    w.className = "w";
    for (const ch of part) {
      const c = document.createElement("span");
      c.className = "k"; c.textContent = ch; w.appendChild(c); chars.push(c);
    }
    el.appendChild(w);
  }
  return chars;
}

/**
 * Staggered per-character reveal. `dx`/`rise` (em) set where each glyph starts
 * relative to its final place; `dx` gives the horizontal "placed by hand"
 * motion of scene 2, `rise` the upward settle used elsewhere.
 */
function animateChars(chars, t, o) {
  const dx = o.dx ?? 0, rise = o.rise ?? 0.32, scaleFrom = o.scaleFrom ?? 0.84, blur = o.blur ?? 0.085;
  chars.forEach((c, i) => {
    const start = o.inStart + i * o.stagger;
    const p = prog(t, start, start + o.dur);
    const e = revealEase(p);
    let op = smooth(p * 2.2);
    let x = (1 - e) * dx, y = (1 - e) * rise, s = lerp(scaleFrom, 1, e), b = (1 - e) * blur;
    if (o.outStart !== undefined) {
      const os = o.outStart + i * (o.outStagger ?? 0.012);
      const q = ease.inCubic(prog(t, os, os + (o.outDur ?? 0.42)));
      op *= 1 - q; y -= q * 0.24; b += q * blur; s *= 1 + 0.03 * q;
    }
    c.style.opacity = op.toFixed(4);
    c.style.transform = `translate3d(${x.toFixed(4)}em, ${y.toFixed(4)}em, 0) scale(${s.toFixed(4)})`;
    c.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

const comingChars = kinetic($("coming"), "Disband is coming to Android.");
const connectChars = kinetic($("connect"), "Your community. More ways to connect.");
const betaChars = kinetic($("beta"), "The Android beta is here.");
const earlyChars = kinetic($("early"), "Sign up for early access.");
const ctaHeadChars = kinetic($("ctaHead"), "Be among the first.");
const ctaSubChars = kinetic($("ctaSub"), "Sign up for the Disband Android beta.");
const ctaUrlChars = kinetic($("ctaUrl"), "https://disband.dev/android");
const titleChars = kinetic($("title"), "DISBAND");
const sloganChars = kinetic($("slogan"), "Privacy first, privacy always.");
const noteChars = kinetic($("note"), "Now welcoming Android beta signups.");
const urlChars = kinetic($("url"), "https://disband.dev/android");
await document.fonts.load('600 96px "Inter"');
await document.fonts.load('500 40px "Inter"');

const layers = ["s1", "s2", "s4", "s5", "s6", "s7"];
const show = (v) => layers.forEach((id) => { $(id).style.display = v.includes(id) ? "block" : "none"; });
const setBlur = (sx, sy) => $("blurYv").setAttribute("stdDeviation", `${sx.toFixed(2)} ${sy.toFixed(2)}`);

// Scene 1 — identical to the launch commercial, so the two read as one series.
const riseEase = ease.bezier(0.5, 0, 0.12, 1);
const logoY = (t) => (1 - riseEase(prog(t, T.logoRise, T.logoLand))) * 760;
function scene1(t) {
  const dark = T.inversions.filter((x) => t >= x).length % 2 === 0;
  $("bg").style.background = dark ? "#000" : "#fff";
  const logo = $("logo1");
  logo.style.color = dark ? "#fff" : "#0b0b0c";
  const y = logoY(t), v = Math.abs(y - logoY(t - 1 / 60));
  const seat = prog(t, T.logoLand, T.logoLand + 0.16);
  const seatY = Math.sin(Math.PI * seat) * 3 * (1 - seat);
  const seatS = 1 - 0.016 * Math.sin(Math.PI * prog(t, T.logoLand, T.logoLand + 0.12));
  const push = 1 + 0.04 * ease.inOutSine(prog(t, T.logoLand, T.zoomStart));
  const zoom = Math.pow(70, ease.inCubic(prog(t, T.zoomStart, T.zoomEnd)));
  logo.style.transformOrigin = "50.16% 53.44%";
  logo.style.transform = `translate3d(0, ${(y + seatY).toFixed(2)}px, 0) scale(${(seatS * push * zoom).toFixed(4)})`;
  logo.style.filter = v > 0.4 ? "url(#blurY)" : "none";
  setBlur(0, Math.min(16, v * 0.42));
  logo.style.visibility = t < T.logoRise ? "hidden" : "visible";
}

function scene5(t) {
  animateChars(betaChars, t, { inStart: T.betaIn, stagger: 0.03, dur: 0.85, rise: 0.28, scaleFrom: 0.88 });
  animateChars(earlyChars, t, { inStart: T.earlyIn, stagger: 0.018, dur: 0.7, rise: 0.3 });
  const push = 1 + 0.025 * ease.inOutSine(prog(t, T.betaIn, T.betaOut + 0.5));
  const out = ease.inCubic(prog(t, T.betaOut, T.betaOut + 0.5));
  const g = $("s5g");
  g.style.transformOrigin = "50% 50%";
  g.style.transform = `translate3d(0, ${(-120 * out).toFixed(2)}px, 0) scale(${push.toFixed(5)})`;
  g.style.opacity = (1 - out).toFixed(4);
  g.style.filter = out > 0.01 ? `blur(${(out * 10).toFixed(2)}px)` : "none";
}

function scene6(t) {
  animateChars(ctaHeadChars, t, { inStart: T.ctaHead, stagger: 0.026, dur: 0.75 });
  animateChars(ctaSubChars, t, { inStart: T.ctaSub, stagger: 0.012, dur: 0.6 });
  animateChars(ctaUrlChars, t, { inStart: T.ctaUrl, stagger: 0.016, dur: 0.6, dx: 0.35, rise: 0.05, scaleFrom: 0.94 });
  // The arrow draws from its tail, then nudges once towards the URL.
  const a = ease.outCubic(prog(t, T.ctaArrow, T.ctaArrow + 0.55));
  const nudge = Math.sin(Math.PI * prog(t, T.ctaArrow + 0.55, T.ctaArrow + 1.0)) * 6;
  const path = $("arrowPath");
  path.style.strokeDasharray = "120";
  path.style.strokeDashoffset = `${(120 * (1 - a)).toFixed(2)}`;
  $("ctaArrow").style.transform = `translateX(${nudge.toFixed(2)}px)`;
  $("ctaArrow").style.opacity = smooth(a * 3).toFixed(3);
  const out = ease.inCubic(prog(t, T.ctaOut, T.ctaOut + 0.45));
  const box = $("ctaText");
  box.style.transform = `translate3d(0, ${(-90 * out).toFixed(2)}px, 0)`;
  box.style.opacity = (1 - out).toFixed(4);
  box.style.filter = out > 0.01 ? `blur(${(out * 10).toFixed(2)}px)` : "none";
}

function scene7(t) {
  const logo = $("logo7");
  const lp = prog(t, T.endLogo, T.endLogoLand);
  const ly = (tt) => (1 - ease.bezier(0.3, 0, 0.12, 1)(prog(tt, T.endLogo, T.endLogoLand))) * 110;
  const v = Math.abs(ly(t) - ly(t - 1 / 60));
  const seat = Math.sin(Math.PI * prog(t, T.endLogoLand, T.endLogoLand + 0.16));
  logo.style.opacity = smooth(lp * 2.2).toFixed(4);
  logo.style.transform = `translate3d(0, ${(ly(t) + seat * 2).toFixed(2)}px, 0) scale(${(1 - 0.012 * seat).toFixed(4)})`;
  logo.style.filter = v > 0.4 ? "url(#blurY)" : "none";
  setBlur(0, Math.min(10, v * 0.4));
  const ls = lerp(0.7, 0.34, ease.outCubic(prog(t, T.endTitle, T.endTitle + 1.4)));
  $("title").style.letterSpacing = `${ls.toFixed(4)}em`;
  $("title").style.textIndent = `${ls.toFixed(4)}em`;
  animateChars(titleChars, t, { inStart: T.endTitle, stagger: 0.055, dur: 0.8, rise: 0.3, scaleFrom: 0.86 });
  animateChars(sloganChars, t, { inStart: T.endSlogan, stagger: 0.022, dur: 0.7 });
  animateChars(noteChars, t, { inStart: T.endNote, stagger: 0.016, dur: 0.65 });
  animateChars(urlChars, t, { inStart: T.endUrl, stagger: 0.02, dur: 0.7, dx: 0.3, rise: 0.08, scaleFrom: 0.92 });
  $("endGroup").style.transform = `scale(${(1 + 0.016 * ease.inOutSine(prog(t, T.endLogo, DURATION))).toFixed(5)})`;
}

const engine = new Engine3D($("gl"));
const shots = await createShots(engine);
window.__engine = engine;

function render(t) {
  const v = [];
  if (t < T.zoomEnd) { v.push("s1"); scene1(t); } else $("bg").style.background = "#fff";
  if (t >= T.zoomEnd - 0.05 && t < T.comingOut + 0.9) {
    v.push("s2");
    $("coming").style.transform = `translateY(-50%) scale(${(1 + 0.03 * ease.inOutSine(prog(t, T.comingIn, T.comingOut + 0.5))).toFixed(5)})`;
    animateChars(comingChars, t, { inStart: T.comingIn, stagger: 0.036, dur: 0.75, dx: 0.42, rise: 0, scaleFrom: 0.96, outStart: T.comingOut, outStagger: 0.012, outDur: 0.45 });
  }
  if (t >= T.connectIn - 0.05 && t < T.connectOut + 0.55) {
    v.push("s4");
    animateChars(connectChars, t, { inStart: T.connectIn, stagger: 0.026, dur: 0.72, outStart: T.connectOut, outStagger: 0.012, outDur: 0.45 });
  }
  if (t >= T.betaIn - 0.05 && t < T.betaOut + 0.55) { v.push("s5"); scene5(t); }
  if (t >= T.ctaHead - 0.05 && t < T.ctaOut + 0.5) { v.push("s6"); scene6(t); }
  if (t >= T.endLogo - 0.05) { v.push("s7"); scene7(t); }
  show(v);
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
