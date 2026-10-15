// Frame composer for "The internet is loud.": DOM typography and the
// silhouette-to-mark morph over the WebGL shot, everything a pure function of time.
import { T, DURATION, WIDTH, HEIGHT } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots, END } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);

const markSvg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
$("markpath").setAttribute("d", markSvg.match(/ d="([^"]+)"/)[1]);

// Lines of words; every character in its own box, words never break.
function kinetic(el, lines) {
  el.textContent = "";
  const chars = [];
  for (const line of lines) {
    const row = document.createElement("span");
    row.className = "line";
    line.split(" ").forEach((word, i) => {
      if (i > 0) { const sp = document.createElement("span"); sp.className = "k"; sp.textContent = " "; row.appendChild(sp); chars.push(sp); }
      const w = document.createElement("span");
      w.className = "w";
      for (const ch of word) { const c = document.createElement("span"); c.className = "k"; c.textContent = ch; w.appendChild(c); chars.push(c); }
      row.appendChild(w);
    });
    el.appendChild(row);
  }
  return chars;
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

const head = kinetic($("head"), ["The internet", "is loud."]);
const line2 = kinetic($("line2"), ["Your space", "doesn’t have to be."]);
kinetic($("meet"), ["Meet Disband."]);
const slogan = kinetic($("slogan"), ["Privacy first, privacy always."]);
const title = kinetic($("title"), ["DISBAND"]);
const find = kinetic($("find"), ["Find your space."]);
const url = kinetic($("url"), ["disband.dev"]);
await document.fonts.load('700 124px "Inter"');
await document.fonts.load('500 64px "Inter"');

const layers = ["s1", "s2", "s3", "s4"];
const show = (v) => layers.forEach((id) => { $(id).style.display = v.includes(id) ? "block" : "none"; });

// ---- The morph: the phone's silhouette becomes the hull of the mark --------
// Both outlines are resampled to the same number of points by arc length,
// starting at the top centre and running clockwise, then interpolated.
const N = 160;
const CX = 540, CY = 900;               // the phone ends here (shots.js END), the mark sits here
const PX_PER_UNIT = HEIGHT / (2 * END.dist * Math.tan(Math.PI / 12));
const PH = { w: 7.1 * PX_PER_UNIT, h: 15.01 * PX_PER_UNIT, r: 1.12 * PX_PER_UNIT };
const LOGO = { w: 420, h: 472 };

function resample(poly, n) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push([a, b, l]);
    total += l;
  }
  const out = [];
  let si = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (acc + seg[si][2] < d) { acc += seg[si][2]; si++; }
    const [a, b, l] = seg[si];
    const f = l > 0 ? (d - acc) / l : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
function roundedRectPoly(w, h, r) {
  const pts = [[0, -h / 2]];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 16; i++) { const a = a0 + (i / 16) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(w / 2 - r, -h / 2 + r, -Math.PI / 2);
  arc(w / 2 - r, h / 2 - r, 0);
  arc(-w / 2 + r, h / 2 - r, Math.PI / 2);
  arc(-w / 2 + r, -h / 2 + r, Math.PI);
  return pts;
}
// Convex hull of the mark (normalised to its viewBox; see connect/shots.js).
const HULL = [[0.5, 0], [1, 0.77], [0.5, 1], [0, 0.77]];
const rectPts = resample(roundedRectPoly(PH.w, PH.h, PH.r), N);
const kitePts = resample(HULL.map(([x, y]) => [(x - 0.5) * LOGO.w, (y - 0.5) * LOGO.h]), N);
const morphEase = ease.bezier(0.65, 0, 0.25, 1);

function scene4(t) {
  // Morph, then the mark itself fades in over the filled hull: only its
  // cut-outs change, from black to white.
  const m = morphEase(prog(t, T.silhouette + 0.04, T.morphEnd));
  const pts = rectPts.map((p, i) => `${(CX + lerp(p[0], kitePts[i][0], m)).toFixed(2)}px ${(CY + lerp(p[1], kitePts[i][1], m)).toFixed(2)}px`);
  const x = smooth(prog(t, T.morphEnd - 0.06, T.logoSet));
  const morph = $("morph");
  morph.style.clipPath = `polygon(${pts.join(",")})`;
  morph.style.opacity = (1 - x).toFixed(4);
  morph.style.display = x < 0.999 ? "block" : "none";

  // The mark settles, then moves up for the call to action.
  const up = ease.inOutCubic(prog(t, T.endMove, T.endMove + 0.7));
  const breathe = 1 + 0.015 * ease.inOutSine(prog(t, T.logoSet, T.endMove));
  const logo = $("logo");
  logo.style.opacity = x.toFixed(4);
  logo.style.transform = `translate3d(0, ${(-240 * up).toFixed(2)}px, 0) scale(${(breathe * lerp(1, 0.6, up)).toFixed(4)})`;
  morph.style.transformOrigin = `${CX}px ${CY}px`;
  morph.style.transform = `scale(${breathe.toFixed(4)})`;

  animateChars(slogan, t, { inStart: T.slogan, stagger: 0.014, dur: 0.65, outStart: T.sloganOut, outStagger: 0.006, outDur: 0.35 });
  const ls = lerp(0.7, 0.34, ease.outCubic(prog(t, T.endTitle, T.endTitle + 1.2)));
  $("title").style.letterSpacing = `${ls.toFixed(4)}em`;
  $("title").style.textIndent = `${ls.toFixed(4)}em`;
  animateChars(title, t, { inStart: T.endTitle, stagger: 0.05, dur: 0.7, rise: 0.3 });
  animateChars(find, t, { inStart: T.endLine, stagger: 0.018, dur: 0.6 });
  animateChars(url, t, { inStart: T.endUrl, stagger: 0.03, dur: 0.5, dx: 0.25, rise: 0.06, scaleFrom: 0.92 });
}

const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
const shots = await createShots(engine);
window.__engine = engine;

function render(t) {
  const v = [];
  $("bg").style.background = t >= T.silhouette ? "#fff" : "#000";

  if (t >= T.headline - 0.02 && t < T.headlineOut + 0.6) {
    v.push("s1");
    animateChars(head, t, { inStart: T.headline, stagger: 0.008, dur: 0.32, rise: 0.06, scaleFrom: 1.14, blur: 0.12 });
    // A hit on arrival; stillness on the way out: no movement, just a fade.
    const hit = Math.exp(-Math.max(0, t - T.headline) / 0.18) * smooth(prog(t, T.headline, T.headline + 0.03));
    const out = ease.inOutSine(prog(t, T.headlineOut, T.headlineOut + 0.5));
    $("head").style.transform = `scale(${(1 + 0.035 * hit).toFixed(4)})`;
    $("head").style.opacity = (1 - out).toFixed(4);
  }
  if (t >= T.line2 - 0.02 && t < T.line2Out + 0.5) {
    v.push("s2");
    animateChars(line2, t, { inStart: T.line2, stagger: 0.018, dur: 0.85, rise: 0.12, scaleFrom: 1, blur: 0.06 });
    const ls = lerp(0.09, 0.02, ease.outCubic(prog(t, T.line2, T.line2 + 1.4)));
    $("line2").style.letterSpacing = `${ls.toFixed(4)}em`;
    $("line2").style.opacity = (1 - ease.inOutSine(prog(t, T.line2Out, T.line2Out + 0.4))).toFixed(4);
  }
  if (t >= T.meet - 0.02 && t < T.meetOut + 0.45) {
    v.push("s3");
    const a = ease.outCubic(prog(t, T.meet, T.meet + 0.6));
    const out = ease.inOutSine(prog(t, T.meetOut, T.meetOut + 0.4));
    $("meet").style.opacity = (smooth(a * 1.3) * (1 - out)).toFixed(4);
    $("meet").style.transform = `scale(${lerp(0.94, 1, a).toFixed(4)})`;
  }
  if (t >= T.silhouette) { v.push("s4"); scene4(t); }
  show(v);

  const canvas = $("gl");
  if (shots.active(t)) {
    canvas.style.display = "block";
    engine.outMat.uniforms.bg.value.setScalar(shots.background(t));
    engine.outMat.uniforms.exposure.value = shots.exposure(t);
    shots.prepare(t);
    engine.renderFrame((ts) => shots.pose(ts), t, { samples: shots.samplesFor(t) });
  } else {
    canvas.style.display = "none";
  }
}

window.renderFrame = (t) => { render(t); return Promise.resolve(true); };
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
