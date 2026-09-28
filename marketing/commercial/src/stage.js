// Frame composer for the commercial. renderFrame(t) poses every layer for
// time t: the typography scenes are DOM (crisp text, real font rendering),
// the product shots are WebGL underneath. Nothing depends on wall-clock time.
import { T, DURATION } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "./ease.js";
import { Engine3D } from "./engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);

const markSvg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
$("markpath").setAttribute("d", markSvg.match(/ d="([^"]+)"/)[1]);

// ---------------------------------------------------------------------------
// Kinetic type: every character is its own box so it can travel into place.
// Words stay unbreakable; "\n" forces a line break.
function kinetic(el, text, tail = null) {
  el.textContent = "";
  const chars = [];
  text.split("\n").forEach((line, li) => {
    if (li) el.appendChild(document.createElement("br"));
    const parts = line.split(/(\s+)/).filter(Boolean);
    parts.forEach((part, pi) => {
      if (/^\s+$/.test(part)) {
        const sp = document.createElement("span");
        sp.className = "k";
        sp.textContent = part;
        el.appendChild(sp);
        chars.push(sp);
        return;
      }
      const w = document.createElement("span");
      w.className = "w";
      for (const ch of part) {
        const c = document.createElement("span");
        c.className = "k";
        c.textContent = ch;
        w.appendChild(c);
        chars.push(c);
      }
      if (tail && pi === parts.length - 1) w.appendChild(tail);
      el.appendChild(w);
    });
  });
  return chars;
}

/**
 * Per-character reveal: each glyph rises, grows from slightly smaller (moving
 * toward the viewer) and sharpens as it lands; the stagger reads as typing.
 */
function animateChars(chars, t, o) {
  const rise = o.rise ?? 0.34, scaleFrom = o.scaleFrom ?? 0.82, blur = o.blur ?? 0.085;
  chars.forEach((c, i) => {
    const start = o.inStart + i * o.stagger;
    const p = prog(t, start, start + o.dur);
    const e = revealEase(p);
    let op = smooth(p * 2.2);
    let y = (1 - e) * rise, s = lerp(scaleFrom, 1, e), b = (1 - e) * blur;
    if (o.outStart !== undefined) {
      const os = o.outStart + i * (o.outStagger ?? 0.012);
      const q = ease.inCubic(prog(t, os, os + (o.outDur ?? 0.42)));
      op *= 1 - q;
      y -= q * (o.outRise ?? 0.24);
      b += q * blur;
      s *= 1 + 0.03 * q;
    }
    c.style.opacity = op.toFixed(4);
    c.style.transform = `translate3d(0, ${y.toFixed(4)}em, 0) scale(${s.toFixed(4)})`;
    c.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

// ---------------------------------------------------------------------------
// Scene setup
const privacyChars = kinetic($("privacy"), "A new gateway to privacy");
const usersChars = kinetic($("usersText"), "users are already signed up within\nthe first three weeks of our release.");
const globeEl = document.createElement("span");
globeEl.className = "globe";
globeEl.innerHTML = `<svg viewBox="-50 -50 100 100"><g id="globeG" fill="none" stroke="currentColor" stroke-linecap="round"></g></svg>`;
const globeChars = kinetic($("globeLine"), "Available all around the globe", globeEl);
const syncChars = kinetic($("syncLine"), "Cross-device support with live syncing");
const titleChars = kinetic($("title"), "DISBAND");
const sloganChars = kinetic($("slogan"), "Privacy first, privacy always.");
const ctaChars = kinetic($("cta"), "Reserve your spot before it’s too late.");
const urlChars = kinetic($("url"), "https://www.disband.dev");

await document.fonts.load('600 248px "Inter"');
await document.fonts.load('500 46px "Inter"');
await document.fonts.ready;

// Optical centring for the big number: centre the digits' ink, not the line box.
const measure = document.createElement("canvas").getContext("2d");
measure.font = '600 248px "Inter"';
const digitMetrics = measure.measureText("10000");
// Baseline position inside a 248px line box, and the digits' ink centre above it.
const numBaseline = (248 - (digitMetrics.fontBoundingBoxAscent + digitMetrics.fontBoundingBoxDescent)) / 2 + digitMetrics.fontBoundingBoxAscent;
const digitInkCenter = (digitMetrics.actualBoundingBoxAscent - digitMetrics.actualBoundingBoxDescent) / 2;

const layers = ["s1", "s2", "s3", "s4", "s5", "s6"];
const show = (visible) => layers.forEach((id) => { $(id).style.display = visible.includes(id) ? "block" : "none"; });

// Thin-line globe: meridians turn about the axis, latitude rings stay put.
// Only the facing half of each meridian is drawn, which is what makes a
// flat line icon read as turning.
function drawGlobe(t, spin) {
  const R = 44, tilt = 0.32;
  const sw = 3.6;
  const g = document.getElementById("globeG");
  const parts = [`<circle r="${R}" stroke-width="${sw}"/>`];
  const project = (lat, lon) => {
    const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
    return [x * R, -y2 * R, z2];
  };
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("");
  const seg = (fn, n) => {
    // Split a curve into its front-facing runs.
    let run = [], out = [];
    for (let i = 0; i <= n; i++) {
      const p = fn(i / n);
      if (p[2] >= -0.02) run.push(p);
      else if (run.length) { out.push(run); run = []; }
    }
    if (run.length) out.push(run);
    return out.filter((r) => r.length > 1);
  };
  for (const lat of [-0.62, 0, 0.62]) {
    for (const run of seg((u) => project(lat, u * Math.PI * 2), 96)) parts.push(`<path d="${path(run)}" stroke-width="${sw}"/>`);
  }
  for (let k = 0; k < 6; k++) {
    const lon = spin + (k * Math.PI) / 6 * 2;
    for (const run of seg((u) => project(-Math.PI / 2 + u * Math.PI, lon), 64)) parts.push(`<path d="${path(run)}" stroke-width="${sw}"/>`);
  }
  g.innerHTML = parts.join("");
}

// Directional blur from on-screen velocity (px per frame).
const setBlur = (id, sx, sy) => $(id).setAttribute("stdDeviation", `${sx.toFixed(2)} ${sy.toFixed(2)}`);

// ---------------------------------------------------------------------------
// Scene 1 — the mark
const riseEase = ease.bezier(0.5, 0, 0.12, 1);
function logoY(t) {
  // Travels up from below the frame, accelerating then braking hard into place.
  return (1 - riseEase(prog(t, T.logoRise, T.logoLand))) * 760;
}
function scene1(t) {
  const n = T.inversions.filter((x) => t >= x).length;
  const dark = n % 2 === 0;
  $("bg").style.background = dark ? "#000" : "#fff";
  const logo = $("logo1");
  logo.style.color = dark ? "#fff" : "#0b0b0c";
  const y = logoY(t);
  const v = Math.abs(y - logoY(t - 1 / 60));
  // The "click": a 3px seat and a tiny compression as it locks in.
  const seat = prog(t, T.logoLand, T.logoLand + 0.16);
  const seatY = Math.sin(Math.PI * seat) * 3 * (1 - seat);
  const seatS = 1 - 0.016 * Math.sin(Math.PI * prog(t, T.logoLand, T.logoLand + 0.12));
  // A slow push-in while the inversions roll, then the zoom-through into the
  // mark's inner counter, which is white by then, into scene 2.
  const push = 1 + 0.04 * ease.inOutSine(prog(t, T.logoLand, T.zoomStart));
  const z = prog(t, T.zoomStart, T.zoomEnd);
  const zoom = Math.pow(70, ease.inCubic(z));
  logo.style.transformOrigin = "50.16% 53.44%";
  logo.style.transform = `translate3d(0, ${(y + seatY).toFixed(2)}px, 0) scale(${(seatS * push * zoom).toFixed(4)})`;
  logo.style.filter = v > 0.4 ? "url(#blurY)" : "none";
  setBlur("blurYv", 0, Math.min(16, v * 0.42));
  logo.style.visibility = t < T.logoRise ? "hidden" : "visible";
}

// ---------------------------------------------------------------------------
function scene3(t) {
  const p = prog(t, T.countStart, T.countEnd);
  const k = 7;
  const value = t >= T.countEnd ? 10000 : Math.round((10000 * (Math.exp(k * p) - 1)) / (Math.exp(k) - 1));
  const num = $("num");
  num.textContent = value.toLocaleString("en-US");
  const inP = prog(t, T.zeroIn, T.zeroIn + 0.4);
  const ie = revealEase(inP);
  const lift = ease.inOutCubic(prog(t, T.numberRise, T.numberRise + 0.75));
  const centerY = 540 - 104 * lift;
  num.style.top = `${(centerY - (numBaseline - digitInkCenter)).toFixed(2)}px`;
  num.style.opacity = smooth(inP * 1.8).toFixed(4);
  num.style.transform = `translate3d(0, ${((1 - ie) * 30).toFixed(2)}px, 0) scale(${lerp(0.94, 1, ie).toFixed(4)})`;
  num.style.filter = inP < 1 ? `blur(${((1 - ie) * 12).toFixed(2)}px)` : "none";
  const text = $("usersText");
  text.style.top = `${(centerY + 150).toFixed(2)}px`;
  animateChars(usersChars, t, { inStart: T.usersIn, stagger: 0.016, dur: 0.7, rise: 0.4, blur: 0.12 });
  // Exit: the whole block lifts away as the first phone rises into frame.
  const out = ease.inCubic(prog(t, T.usersOut, T.usersOut + 0.5));
  const group = $("s3group");
  group.style.transform = `translate3d(0, ${(-150 * out).toFixed(2)}px, 0)`;
  group.style.opacity = (1 - out).toFixed(4);
  group.style.filter = out > 0.01 ? `blur(${(out * 10).toFixed(2)}px)` : "none";
}

function scene4Text(t) {
  animateChars(globeChars, t, { inStart: T.globeIn, stagger: 0.03, dur: 0.7 });
  const pop = prog(t, T.globeIcon, T.globeIcon + 0.6);
  const back = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const s = pop <= 0 ? 0 : back(pop);
  globeEl.style.opacity = smooth(pop * 2.5).toFixed(4);
  globeEl.style.transform = `scale(${s.toFixed(4)}) rotate(${((1 - smooth(pop)) * -40).toFixed(2)}deg)`;
  drawGlobe(t, (t - T.globeIcon) * 0.9 + 0.3);
  // Whip left into the desktop shot; the monitor enters from the right.
  const line = $("globeLine");
  const x = (tt) => -1500 * ease.inCubic(prog(tt, T.globeOut, T.globeOut + 0.3));
  const vx = Math.abs(x(t) - x(t - 1 / 60));
  line.style.transform = `translate3d(${x(t).toFixed(2)}px, -50%, 0)`;
  line.style.filter = vx > 0.5 ? "url(#blurX)" : "none";
  setBlur("blurXv", Math.min(40, vx * 0.45), 0);
}

function scene6(t) {
  const logo = $("logo6");
  const lp = prog(t, T.endLogo, T.endLogoLand);
  const ly = (tt) => (1 - ease.bezier(0.3, 0, 0.12, 1)(prog(tt, T.endLogo, T.endLogoLand))) * 110;
  const v = Math.abs(ly(t) - ly(t - 1 / 60));
  const seat = Math.sin(Math.PI * prog(t, T.endLogoLand, T.endLogoLand + 0.16));
  logo.style.opacity = smooth(lp * 2.2).toFixed(4);
  logo.style.transform = `translate3d(0, ${(ly(t) + seat * 2).toFixed(2)}px, 0) scale(${(1 - 0.012 * seat).toFixed(4)})`;
  logo.style.filter = v > 0.4 ? "url(#blurY)" : "none";
  setBlur("blurYv", 0, Math.min(10, v * 0.4));

  // DISBAND tracks in from wide spacing while each letter lands.
  const track = ease.outCubic(prog(t, T.endTitle, T.endTitle + 1.4));
  const ls = lerp(0.7, 0.34, track);
  $("title").style.letterSpacing = `${ls.toFixed(4)}em`;
  $("title").style.textIndent = `${ls.toFixed(4)}em`;
  animateChars(titleChars, t, { inStart: T.endTitle, stagger: 0.055, dur: 0.8, rise: 0.3, scaleFrom: 0.86 });
  animateChars(sloganChars, t, { inStart: T.endSlogan, stagger: 0.022, dur: 0.7 });
  animateChars(urlChars, t, { inStart: T.endUrl, stagger: 0.012, dur: 0.6, rise: 0.25, blur: 0.06 });
  animateChars(ctaChars, t, { inStart: T.endCta, stagger: 0.02, dur: 0.7 });
  const lg = prog(t, T.endLegal, T.endLegal + 0.9);
  $("legal").style.opacity = smooth(lg).toFixed(4);
  $("legal").style.transform = `translate3d(0, ${((1 - ease.outCubic(lg)) * 10).toFixed(2)}px, 0)`;
  const push = 1 + 0.018 * ease.inOutSine(prog(t, T.endLogo, DURATION));
  $("endGroup").style.transform = `scale(${push.toFixed(5)})`;
}

// ---------------------------------------------------------------------------
const engine = new Engine3D($("gl"));
const shots = await createShots(engine);
window.__engine = engine; // for tools/debug.mjs

function render(t) {
  const visible = [];
  if (t < T.zoomEnd) { visible.push("s1"); scene1(t); } else $("bg").style.background = "#fff";
  if (t >= T.zoomEnd - 0.05 && t < T.privacyOut + 0.9) {
    visible.push("s2");
    const push = 1 + 0.035 * ease.inOutSine(prog(t, T.privacyIn, T.privacyOut + 0.5));
    $("privacy").style.transform = `translateY(-50%) scale(${push.toFixed(5)})`;
    animateChars(privacyChars, t, { inStart: T.privacyIn, stagger: 0.034, dur: 0.72, outStart: T.privacyOut, outStagger: 0.014, outDur: 0.45 });
  }
  if (t >= T.zeroIn - 0.05 && t < T.usersOut + 0.55) { visible.push("s3"); scene3(t); }
  if (t >= T.globeIn - 0.05 && t < T.globeOut + 0.35) { visible.push("s4"); scene4Text(t); }
  if (t >= T.syncIn - 0.05 && t < T.syncOut + 0.55) {
    visible.push("s5");
    animateChars(syncChars, t, { inStart: T.syncIn, stagger: 0.026, dur: 0.7, outStart: T.syncOut, outStagger: 0.012, outDur: 0.45 });
  }
  if (t >= T.endLogo - 0.05) { visible.push("s6"); scene6(t); }
  show(visible);

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

window.renderFrame = (t) => {
  render(t);
  return document.fonts.ready.then(() => true);
};
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
