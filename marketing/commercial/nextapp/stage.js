// Frame composer for "Not another boring app.": oversized typography and the
// word-to-mark flip over the WebGL product shots, everything a pure function of time.
import { T, DURATION, WIDTH, HEIGHT } from "./timeline.js";
import { ease, prog, lerp, clamp01 } from "../src/ease.js";
import { Engine3D } from "../src/engine3d.js";
import { createShots } from "./shots.js";

const $ = (id) => document.getElementById(id);
window.PREVIEW = new URLSearchParams(location.search).has("preview");
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const revealEase = ease.bezier(0.2, 0.75, 0.18, 1);
const landEase = ease.bezier(0.15, 0.7, 0.25, 1);     // the phone's own landing curve
const punch = ease.bezier(0.16, 1, 0.3, 1);

const markSvg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
$("markpath").setAttribute("d", markSvg.match(/ d="([^"]+)"/)[1]);

// Lines of words; every character in its own box, words never break.
// Returns { lines: [line elements], chars: [all character spans] }.
function kinetic(el, lines) {
  el.textContent = "";
  const rows = [], chars = [];
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
    rows.push(row);
  }
  return { lines: rows, chars };
}

/** Per-character reveal (rise, focus, scale). */
function animateChars(chars, t, o) {
  const dx = o.dx ?? 0, rise = o.rise ?? 0.3, scaleFrom = o.scaleFrom ?? 0.86, blur = o.blur ?? 0.09;
  chars.forEach((c, i) => {
    const p = prog(t, o.inStart + i * o.stagger, o.inStart + i * o.stagger + o.dur);
    const e = revealEase(p);
    c.style.opacity = smooth(p * 2.2).toFixed(4);
    c.style.transform = `translate3d(${((1 - e) * dx).toFixed(4)}em, ${((1 - e) * rise).toFixed(4)}em, 0) scale(${lerp(scaleFrom, 1, e).toFixed(4)})`;
    const b = (1 - e) * blur;
    c.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

const line1 = kinetic($("line1"), ["YOUR NEXT", "APP?"]);
const meet = kinetic($("meet"), ["MEET", "DISBAND."]);
kinetic($("wYour"), ["YOUR."]);
const people = kinetic($("wPeople"), ["PEOPLE."]).chars;
const disband = kinetic($("wDisband"), ["DISBAND."]).chars;
const slogan = kinetic($("slogan"), ["Privacy first, privacy always."]).chars;
const explore = kinetic($("explore"), ["Explore Disband."]).chars;
const url = kinetic($("url"), ["disband.dev"]).chars;
await document.fonts.load('800 150px "Inter"');
await document.fonts.load('600 54px "Inter"');

const layers = ["s1", "s2", "s4", "s5"];
const show = (v) => layers.forEach((id) => { $(id).style.display = v.includes(id) ? "block" : "none"; });

// ---- Scene 1: the lines land with the phone, on its curve -------------------
function scene1(t) {
  line1.lines.forEach((row, li) => {
    const land = T.land + li * 0.06;
    const p = prog(t, land - 0.26, land);
    const e = landEase(p);
    const q = ease.inCubic(prog(t, T.line1Out + li * 0.04, T.line1Out + li * 0.04 + 0.22));
    const x = (1 - e) * 1.6 - q * 1.7;
    row.style.transform = `translate3d(${x.toFixed(4)}em, 0, 0)`;
    row.style.opacity = (smooth(p * 3) * (1 - q)).toFixed(4);
    const b = (1 - e) * 0.07 + q * 0.07;
    row.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

// ---- Scene 2: MEET DISBAND. slams in on the beat --------------------------
function scene2(t) {
  meet.lines.forEach((row, li) => {
    const st = T.meet + li * 0.06;
    const a = punch(prog(t, st, st + 0.26));
    const q = ease.inCubic(prog(t, T.meetOut + li * 0.03, T.meetOut + li * 0.03 + 0.2));
    row.style.opacity = (smooth(a * 3) * (1 - q)).toFixed(4);
    row.style.transform = `translate3d(0, ${(-0.3 * q).toFixed(4)}em, 0) scale(${lerp(1.35, 1, a).toFixed(4)})`;
    const b = (1 - a) * 0.08 + q * 0.06;
    row.style.filter = b > 0.002 ? `blur(${b.toFixed(4)}em)` : "none";
  });
}

// ---- Scene 4: three words, three moves; the last turns into the mark -------
function scene4(t) {
  // YOUR. — out of a point.
  const y = $("wYour");
  const ya = prog(t, T.your, T.your + 0.3);
  const yq = ease.inCubic(prog(t, T.yourOut, T.yourOut + 0.2));
  y.style.display = t >= T.your - 0.01 && yq < 1 ? "block" : "none";
  y.style.opacity = (smooth(ya * 4) * (1 - yq)).toFixed(4);
  y.style.transform = `scale(${((0.02 + 0.98 * ease.bezier(0.2, 0.9, 0.3, 1.12)(ya)) * (1 + 2.2 * yq)).toFixed(4)})`;
  const yb = yq * 14;
  y.style.filter = yb > 0.05 ? `blur(${yb.toFixed(2)}px)` : "none";

  // PEOPLE. — a slide across with depth; the letters trail slightly.
  const pw = $("wPeople");
  const pa = ease.bezier(0.15, 0.75, 0.2, 1)(prog(t, T.people, T.people + 0.4));
  const pq = ease.inCubic(prog(t, T.peopleOut, T.peopleOut + 0.22));
  pw.style.display = t >= T.people - 0.01 && pq < 1 ? "block" : "none";
  pw.style.opacity = (smooth(pa * 3) * (1 - pq)).toFixed(4);
  pw.style.transform = `translate3d(${(1100 * (1 - pa) - 1100 * pq).toFixed(1)}px, 0, ${(-380 * (1 - pa) - 380 * pq).toFixed(1)}px) rotateY(${(-22 * (1 - pa) + 22 * pq).toFixed(2)}deg)`;
  people.forEach((c, i) => {
    const e = ease.bezier(0.15, 0.75, 0.2, 1)(prog(t, T.people + i * 0.02, T.people + i * 0.02 + 0.4));
    c.style.transform = `translate3d(${((pa - e) * 0.5).toFixed(4)}em, 0, 0)`;
  });

  // DISBAND. — letters rise out of their own line, then the word turns
  // edge-on and comes round as the mark.
  const dw = $("wDisband");
  dw.style.display = t >= T.disband - 0.01 && t < T.flipMid ? "block" : "none";
  disband.forEach((c, i) => {
    const e = ease.bezier(0.2, 0.8, 0.2, 1)(prog(t, T.disband + i * 0.03, T.disband + i * 0.03 + 0.32));
    c.style.transform = `translate3d(0, ${(1.05 * (1 - e)).toFixed(4)}em, 0)`;
  });
  const f = ease.inCubic(prog(t, T.flip, T.flipMid));
  dw.style.transform = `rotateY(${(90 * f).toFixed(2)}deg) scale(${lerp(1, 0.92, f).toFixed(4)})`;
}

// ---- Scene 5: the mark (from the flip), white world, the lines ------------
function scene5(t) {
  const logo = $("logo5");
  const f = ease.outCubic(prog(t, T.flipMid, T.climax));
  const ry = -90 * (1 - f);
  const mv = ease.bezier(0.55, 0, 0.2, 1)(prog(t, T.settle, T.lock));
  const seat = Math.sin(Math.PI * prog(t, T.lock, T.lock + 0.16));
  const climax = 1 + 0.05 * Math.sin(Math.PI * prog(t, T.climax - 0.05, T.climax + 0.25)) * (t > T.climax - 0.05 ? 1 : 0);
  const s = lerp(1, 0.75, mv) * (1 - 0.015 * seat) * climax;
  logo.style.transform = `perspective(1600px) translate3d(${(-240 * mv).toFixed(2)}px, ${(-200 * mv).toFixed(2)}px, 0) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  animateChars(slogan, t, { inStart: T.slogan, stagger: 0.012, dur: 0.6 });
  animateChars(explore, t, { inStart: T.explore, stagger: 0.02, dur: 0.55 });
  animateChars(url, t, { inStart: T.url, stagger: 0.03, dur: 0.5, dx: 0.25, rise: 0.06, scaleFrom: 0.92 });
}

const engine = new Engine3D($("gl"), WIDTH, HEIGHT);
const shots = await createShots(engine);
window.__engine = engine;

function render(t) {
  const v = [];
  const dark = t >= T.shotFEnd && t < T.whiteEnd;
  $("bg").style.background = dark ? "#000" : "#fff";
  // Black to white: a white circle opens out from behind the mark.
  const wipe = $("wipe");
  if (t >= T.white && t < T.whiteEnd) {
    const r = 1150 * ease.inOutCubic(prog(t, T.white, T.whiteEnd));
    wipe.style.background = `radial-gradient(circle at 540px 960px, #fff ${r.toFixed(1)}px, rgba(255,255,255,0) ${(r + 1.5).toFixed(1)}px)`;
    wipe.style.display = "block";
  } else {
    wipe.style.display = "none";
  }

  if (t >= T.land - 0.3 && t < T.line1Out + 0.35) { v.push("s1"); scene1(t); }
  if (t >= T.meet - 0.02 && t < T.meetOut + 0.3) { v.push("s2"); scene2(t); }
  if (t >= T.your - 0.05 && t < T.flipMid) { v.push("s4"); scene4(t); }
  if (t >= T.flipMid) { v.push("s5"); scene5(t); }
  show(v);

  const canvas = $("gl");
  if (shots.active(t)) {
    canvas.style.display = "block";
    engine.outMat.uniforms.exposure.value = shots.exposure(t);
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
