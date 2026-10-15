// The 3D for "The internet is loud." One continuous shot, pure functions of time:
//   0–3 s   a field of abstract interface fragments (notification panels,
//           message bubbles, windows, rings, frames) rushes past the camera;
//   3 s     everything stops dead; the fragments drift off into the dark;
//   3–6 s   one phone rises out of the black, a strip of light runs over its
//           edges, the screen wakes;
//   6–12 s  the phone turns, its screen lifts into seven layers (chassis,
//           display, rail, panel header, message rows, dock, cover glass) and
//           comes home, then shows Disband Demo HQ, #random and You;
//   12–13 s the phone recedes as the world turns white and goes to silhouette,
//           ending exactly where the stage draws the flat outline that
//           becomes the mark.
// The fragments carry no text: their marks are bars, dots and circles.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { T } from "./timeline.js";
import { makePhone, panel, roundedRect } from "../src/devices.js";
import { prog, lerp, ease, clamp01 } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Where the phone ends: straight ahead, far enough to be 300 px tall, 60 px
// above centre (the stage's silhouette and logo sit on the same spot).
export const CAM_Z = 46;
export const END = { dist: 179.3, y: 3.0 };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`failed to load ${src}`));
  img.src = src;
});

class Screen {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  mix(a, b, p) {
    const key = `${a.src}|${b ? b.src : ""}|${p.toFixed(3)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.globalAlpha = 1;
    g.drawImage(a, 0, 0, this.canvas.width, this.canvas.height);
    if (b && p > 0) { g.globalAlpha = p; g.drawImage(b, 0, 0, this.canvas.width, this.canvas.height); g.globalAlpha = 1; }
    this.texture.needsUpdate = true;
  }
}

// Black stage with two rim strips, a narrow front strip that runs across the
// glass when the environment turns, and a dim overhead softbox for the
// product turn.
function darkStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const emit = (w, h, k) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  place(emit(3.0, 46, 22), -36, 8, -22);
  place(emit(2.2, 40, 15), 38, 4, -26);
  place(emit(1.0, 44, 70), -22, 4, 40);
  place(emit(30, 18, 2.0), 0, 40, 14);
  place(emit(16, 22, 1.2), 30, 6, 28);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return env;
}

// ---- Fragments ---------------------------------------------------------------

const PX = 100; // decal pixels per world unit
function decal(kind, w, h, rnd) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * PX); c.height = Math.round(h * PX);
  const g = c.getContext("2d");
  const u = PX;
  const bar = (x, y, len, a, th = 0.15) => { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.roundRect(x * u, (y - th / 2) * u, len * u, th * u, (th / 2) * u); g.fill(); };
  const dot = (x, y, r, a) => { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(x * u, y * u, r * u, 0, Math.PI * 2); g.fill(); };
  const ring = (x, y, r, a) => { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 0.05 * u; g.beginPath(); g.arc(x * u, y * u, r * u, 0, Math.PI * 2); g.stroke(); };
  if (kind === "notif") {
    dot(0.8, h / 2, 0.42, 0.7);
    bar(1.5, h / 2 - 0.22, 2.2 + rnd() * 1.6, 0.68);
    bar(1.5, h / 2 + 0.24, 1.4 + rnd() * 1.4, 0.32);
    dot(w - 0.5, h / 2 - 0.25, 0.11, 0.65);
  } else if (kind === "bubble") {
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) bar(0.6, 0.6 + i * 0.36, (w - 1.2) * (i === n - 1 ? 0.45 + rnd() * 0.3 : 0.8 + rnd() * 0.2), i === 0 ? 0.6 : 0.34);
  } else if (kind === "window") {
    for (let i = 0; i < 3; i++) dot(0.45 + i * 0.32, 0.4, 0.09, 0.6);
    bar(0, 0.78, w, 0.12, 0.03);
    g.fillStyle = "rgba(255,255,255,0.1)"; g.beginPath(); g.roundRect(0.4 * u, 1.1 * u, w * 0.5 * u, (h - 1.5) * u, 0.18 * u); g.fill();
    for (let i = 0; i < 4; i++) bar(w * 0.5 + 0.7, 1.3 + i * 0.42, (w * 0.5 - 1.2) * (0.6 + rnd() * 0.4), i === 0 ? 0.55 : 0.28);
  } else if (kind === "pill") {
    dot(0.55, h / 2, 0.3, 0.7);
    bar(1.1, h / 2, 1.6 + rnd() * 1.6, 0.5);
  } else if (kind === "card") {
    ring(w / 2, 1.05, 0.55, 0.6);
    dot(w / 2, 1.05, 0.34, 0.35);
    bar(w / 2 - 0.9, 2.05, 1.8, 0.6);
    bar(w / 2 - 0.6, 2.45, 1.2, 0.3);
  }
  return c;
}

const KINDS = [
  { kind: "notif", w: 6.2, h: 1.6, r: 0.42, p: 0.26 },
  { kind: "bubble", w: 5.0, h: 1.75, r: 0.82, p: 0.2 },
  { kind: "window", w: 6.0, h: 4.2, r: 0.36, p: 0.13 },
  { kind: "pill", w: 4.4, h: 1.1, r: 0.55, p: 0.12 },
  { kind: "card", w: 3.2, h: 3.0, r: 0.42, p: 0.09 },
  { kind: "ring", p: 0.08 },
  { kind: "frame", p: 0.07 },
  { kind: "cube", p: 0.05 },
];

function makeFragments(env, count, seed) {
  const rnd = mulberry32(seed);
  const pick = () => { let x = rnd(); for (const k of KINDS) { if ((x -= k.p) <= 0) return k; } return KINDS[0]; };
  const group = new THREE.Group();
  const frags = [];
  const glassMat = () => new THREE.MeshStandardMaterial({ color: 0xa4a7ae, metalness: 0, roughness: 0.2, envMap: env, envMapIntensity: 1.5, transparent: true, depthWrite: false });
  const metalMat = () => new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.4, transparent: true });
  for (let i = 0; i < count; i++) {
    const k = pick();
    const obj = new THREE.Group();
    const mats = [];
    if (k.w) {
      const slabM = glassMat();
      const slab = new THREE.Mesh(new RoundedBoxGeometry(k.w, k.h, 0.09, 3, Math.min(k.r, k.h / 2 - 0.01)), slabM);
      const dTex = new THREE.CanvasTexture(decal(k.kind, k.w, k.h, rnd));
      dTex.colorSpace = THREE.SRGBColorSpace;
      dTex.anisotropy = 8;
      const dM = new THREE.MeshBasicMaterial({ map: dTex, transparent: true, depthWrite: false, toneMapped: false });
      const d = new THREE.Mesh(new THREE.PlaneGeometry(k.w, k.h), dM);
      d.position.z = 0.05;
      obj.add(slab, d);
      mats.push([slabM, 0.42], [dM, 0.9]);
    } else if (k.kind === "ring" || k.kind === "frame") {
      const m = metalMat();
      const r = 0.9 + rnd() * 1.4;
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 10, k.kind === "ring" ? 96 : 4), m);
      if (k.kind === "frame") mesh.rotation.z = Math.PI / 4;
      obj.add(mesh);
      mats.push([m, 1]);
    } else {
      const m = glassMat();
      const s = 0.9 + rnd() * 0.8;
      obj.add(new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 3, 0.12), m));
      mats.push([m, 0.6]);
    }
    group.add(obj);

    // Trajectory in camera space: most fly at the lens from deep in the dark;
    // some cross the frame sideways at mid distance.
    const ts = 0.12 + 2.55 * Math.pow(i / count, 1.25) + rnd() * 0.15;
    let p0, v;
    if (rnd() < 0.74) {
      const th = rnd() * Math.PI * 2, r0 = 3.2 + rnd() * 15;
      const dist = 70 + rnd() * 70;
      p0 = V(Math.cos(th) * r0, Math.sin(th) * r0 * 1.5, CAM_Z - dist);
      const vr = 1 + rnd() * 4;
      v = V(Math.cos(th) * vr, Math.sin(th) * vr * 1.5, 30 + rnd() * 36);
    } else {
      const dist = 16 + rnd() * 30, side = rnd() < 0.5 ? -1 : 1;
      const halfW = dist * Math.tan(Math.PI / 12) * (1080 / 1920) + 4;
      p0 = V(side * halfW, (rnd() - 0.5) * dist * 0.5, CAM_Z - dist);
      v = V(-side * (16 + rnd() * 22), (rnd() - 0.5) * 3, rnd() * 8);
    }
    const rot0 = V((rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.8);
    const w = V((rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 1.0);
    const out = V(p0.x, p0.y, 0).normalize().multiplyScalar(6 + rnd() * 8);
    out.z = -(12 + rnd() * 24);
    frags.push({ obj, mats, ts, p0, v, rot0, w, out, lag: rnd() * 0.35 });
  }
  return { group, frags };
}

function poseFragments(field, t) {
  const tf = Math.min(t, T.freeze); // dead stop at the freeze
  for (const f of field.frags) {
    const dt = tf - f.ts;
    const p = f.p0.clone().addScaledVector(f.v, dt);
    const d = ease.inOutSine(prog(t, T.drift + f.lag, T.driftEnd));
    p.addScaledVector(f.out, d);
    f.obj.position.copy(p);
    const rt = dt + (t > T.freeze ? 0.12 * (t - T.freeze) * d : 0);
    f.obj.rotation.set(f.rot0.x + f.w.x * rt, f.rot0.y + f.w.y * rt, f.rot0.z + f.w.z * rt);
    // Out of the dark with distance; gone before the near plane; away on the drift.
    const dist = CAM_Z - p.z;
    const a = smooth((150 - dist) / 55) * smooth((dist - 6) / 4) * (1 - smooth(d * 1.1)) * smooth(prog(t, T.rushStart, T.rushStart + 0.12));
    f.obj.visible = a > 0.002;
    for (const [m, base] of f.mats) m.opacity = base * a;
  }
}

// ---- Shots -------------------------------------------------------------------

export async function createShots(engine) {
  const img = {};
  await Promise.all([
    ["inbox", "ios-inbox"], ["server", "ios-server"], ["random", "ios-random"], ["you", "ios-you"],
    ["base", "layer-base"], ["rail", "layer-rail"], ["panel", "layer-panel"], ["dock", "layer-dock"],
  ].map(async ([k, f]) => { img[k] = await loadImage(`../build/textures/${f}.png`); }));
  const W = img.inbox.naturalWidth, H = img.inbox.naturalHeight;
  const { scene, renderer } = engine;
  const env = darkStudio(renderer);

  const field = makeFragments(env, 84, 20261014);
  scene.add(field.group);

  // The phone, re-grouped so its parts can separate.
  const screen = new Screen(engine, W, H);
  const ph = makePhone(screen.texture);
  const { D, SW, SH } = ph.size;
  const chassis = new THREE.Group();
  for (const c of [...ph.group.children]) if (c !== ph.screen && c !== ph.glare) chassis.add(c);
  const display = new THREE.Group();
  display.add(ph.screen);
  const glass = new THREE.Group();
  glass.add(ph.glare);
  const edgeShape = roundedRect(SW + 0.16, SH + 0.16, 1.0);
  edgeShape.holes.push(roundedRect(SW + 0.08, SH + 0.08, 0.96));
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(edgeShape, 32), edgeMat);
  edge.position.z = D / 2 + 0.024;
  glass.add(edge);
  glass.children.forEach((c) => { c.renderOrder = 8; });

  // The panel splits at the bottom of its header (title + filter chips, 168 pt).
  const split = 168 * 3;
  const part = (y0, y1) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    c.getContext("2d").drawImage(img.panel, 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
    return c;
  };
  const uiLayer = (image, order) => {
    const tex = engine.canvasTexture(image);
    const m = new THREE.Mesh(panel(SW, SH, 0.93), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, toneMapped: false, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3 - order, polygonOffsetUnits: -3 - order,
    }));
    m.position.z = D / 2 + 0.014 + order * 0.001;
    m.renderOrder = 2 + order;
    const g = new THREE.Group();
    g.add(m);
    return g;
  };
  const rail = uiLayer(img.rail, 1), rows = uiLayer(part(split, H), 2), header = uiLayer(part(0, split), 3), dock = uiLayer(img.dock, 4);
  const phone = new THREE.Group();
  phone.add(chassis, display, rail, rows, header, dock, glass);
  scene.add(phone);
  phone.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.needsUpdate = true; } });
  ph.glare.material.envMapIntensity = 0.07;
  // Polished frame, so the strip of light reads as a crisp line on the edges.
  phone.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && o.material.metalness === 1) o.material.roughness = 0.14; });
  const envMats = [];
  phone.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && !envMats.includes(o.material)) envMats.push(o.material); });
  const envBase = new Map(envMats.map((m) => [m, m.envMapIntensity]));

  const layered = (t) => t >= T.explode - 0.4 && t < T.assembleClicks[3] + 0.1;
  const fade = (t, at, d = 0.32) => ease.inOutCubic(prog(t, at, at + d));

  function prepare(t) {
    const on = layered(t);
    rail.visible = rows.visible = header.visible = dock.visible = on;
    if (on) screen.mix(img.base, null, 0);
    else if (t < T.glimpse2) screen.mix(img.inbox, t >= T.glimpse1 ? img.server : null, fade(t, T.glimpse1));
    else if (t < T.glimpse3) screen.mix(img.server, img.random, fade(t, T.glimpse2));
    else screen.mix(img.random, img.you, fade(t, T.glimpse3));
  }

  // Layers lift on successive 8ths and land on their own clicks.
  const outEase = ease.bezier(0.3, 0, 0.15, 1);
  const inEase = ease.bezier(0.55, 0, 0.25, 1);
  const C = T.assembleClicks;
  const LAYERS = [
    { g: chassis, out: T.explode, land: C[0] - 0.125, off: [0, 0, -3.6], rot: [0, 0] },
    { g: rail, out: T.explode + 0.125, land: C[2], off: [-1.3, 0, 1.6], rot: [0, 0.15] },
    { g: rows, out: T.explode + 0.25, land: C[0], off: [0.3, -0.3, 3.0], rot: [0, -0.04] },
    { g: header, out: T.explode + 0.375, land: C[1], off: [0.3, 1.7, 4.1], rot: [0.12, 0] },
    { g: dock, out: T.explode + 0.5, land: C[2], off: [0, -2.0, 5.1], rot: [-0.12, 0] },
    { g: glass, out: T.explode + 0.625, land: C[3], off: [0, 0.2, 6.7], rot: [0, 0] },
  ];
  const sep = (L, t) => outEase(prog(t, L.out, L.out + 0.95)) * (1 - inEase(prog(t, L.land - 0.62, L.land)));

  function pose(t) {
    poseFragments(field, t);
    engine.key.intensity = lerp(0.35, 0.9, smooth(prog(t, T.turn, T.explode)));
    const bob = (f, phs, a) => Math.sin(2 * Math.PI * (t * f + phs)) * a;

    // ---- phone ----
    phone.visible = t >= T.phoneIn;
    const emerge = ease.bezier(0.2, 0.6, 0.2, 1)(prog(t, T.phoneIn, T.driftEnd - 0.1));
    const turn = ease.inOutCubic(prog(t, T.turn, T.explode + 0.2));
    const showTurn = ease.inOutSine(prog(t, C[3], T.recede - 0.2));
    const home = ease.inOutCubic(prog(t, T.recede - 0.3, T.recede + 0.6));
    const recede = ease.inOutCubic(prog(t, T.recede, T.silhouette - 0.08));
    const calm = 1 - home;
    const ry = (lerp(0.5, 0, emerge) - 0.68 * turn + 1.05 * showTurn) * calm;
    phone.rotation.set(lerp(0.18, 0, emerge) + 0.08 * turn * (1 - showTurn) * calm, ry, 0);
    phone.position.set(0, (bob(0.22, 0, 0.1)) * calm + END.y * recede, lerp(-95, 0, emerge) - (END.dist - CAM_Z) * recede);

    for (const L of LAYERS) {
      const e = sep(L, t), k = LAYERS.indexOf(L);
      const drift = e * bob(0.31, k * 0.21, 0.14);
      L.g.position.set(L.off[0] * e, L.off[1] * e + drift, L.off[2] * e);
      L.g.rotation.set(L.rot[0] * e, L.rot[1] * e, 0);
    }
    edgeMat.opacity = 0.3 * sep(LAYERS[5], t);
    // The screen wakes; the light gets fuller for the product turn.
    ph.screen.material.color.setScalar(smooth(prog(t, T.screenOn, T.screenOn + 0.45)));
    const fill = lerp(0.75, 1.3, smooth(prog(t, T.turn, T.explode)));
    for (const m of envMats) m.envMapIntensity = envBase.get(m) * fill;
    // One pass of the strip over the edges, then a slow walk.
    const envRot = lerp(-2.3, 1.2, ease.inOutSine(prog(t, T.sweep, T.sweepEnd))) + 0.5 * ease.inOutSine(prog(t, T.sweepEnd, T.recede));
    for (const m of envMats) m.envMapRotation.set(0, envRot, 0);

    // ---- camera ----
    // 0–3: straight down the tunnel, easing forward; it stops with everything else.
    const push1 = ease.inOutSine(prog(Math.min(t, T.freeze), 0, T.freeze));
    // 3–6: slow push to the phone; 6–12: orbit; 12+: back on axis for the recede.
    const push2 = ease.inOutSine(prog(t, T.drift, T.turn + 0.4));
    const orbit = ease.inOutSine(prog(t, T.turn, C[3] + 0.3));
    const late = ease.inOutSine(prog(t, C[3], T.recede));
    const a = (0.34 * orbit - 0.5 * late) * calm;
    const r = lerp(lerp(CAM_Z + 2 - 2 * push1, 40, push2), 46, orbit) + 6 * Math.sin(Math.PI * prog(t, T.explode - 0.2, C[3] + 0.1));
    const rr = lerp(r, CAM_Z, home);
    const ty = lerp(lerp(0, -1.2, push2), 1.0, smooth(prog(t, T.turn, T.explode))) * calm;
    const pos = V(Math.sin(a) * rr, (0.8 * orbit + 0.6 * late) * calm, Math.cos(a) * rr);
    const target = V(0, ty, lerp(0, -(END.dist - CAM_Z), recede));
    const phonePos = phone.position.clone();
    return { pos, target, fov: 30, aperture: t < T.phoneIn ? 0.1 : lerp(0.14, 0, recede), focus: t < T.phoneIn ? 30 : pos.distanceTo(phonePos.add(V(0, 0, 1.2))) };
  }

  return {
    active: (t) => t < T.shotEnd,
    pose,
    prepare,
    background: (t) => smooth(prog(t, T.white, T.silhouette - 0.1)),
    exposure: (t) => 1 - ease.inOutSine(prog(t, T.white, T.silhouette - 0.12)),
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      if (t < T.freeze) return 16;
      if ((t > T.explode && t < C[3] + 0.1) || t > T.recede) return 10;
      return 8;
    },
  };
}
