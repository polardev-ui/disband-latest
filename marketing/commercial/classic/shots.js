// The 3D for "A Familiar Feeling. A New Home." Pure functions of time.
// The app is never redrawn: the window's face and every floating panel are
// pixel captures of the running classic UI (build/classic/*.png, 1440×900 at
// 3×). World units are CSS pixels / 100, so a region of the app maps straight
// to a camera framing.
//   1  a white kite (the mark's hull) turns in the dark, a strip of light runs
//      over it, it cuts to the mark; panels cropped from the real UI emerge and
//      the camera flies through them to the window;
//   2  the window, three-quarter to frontal, pushing in to the chat;
//   3  six framings of real states (rail, channels, composer, members + profile,
//      DM, the whole app), hard cuts on beats;
//   4  slower push into the chat, panels receding behind;
//   5  the window folds to a panel, turns edge-on (the stage takes over with the mark).
import * as THREE from "three";
import { T, REGION } from "./timeline.js";
import { roundedRect } from "../src/devices.js";
import { prog, lerp, ease, clamp01 } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const TAN = Math.tan(Math.PI / 12);
const WVIS = 2 * TAN * (1080 / 1920);    // visible width per unit distance
const HVIS = 2 * TAN;                     // visible height per unit distance
const WIN_Z = -60;
const CAP = 3;                            // capture scale (px per CSS px)

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`failed to load ${src}`));
  img.src = src;
});

function darkStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const strip = (w, h, k) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  place(strip(2.6, 46, 18), -36, 8, -22);
  place(strip(2.0, 40, 12), 38, 4, -26);
  place(strip(1.2, 44, 80), -20, 4, 40);
  place(strip(30, 14, 0.5), 0, 40, 12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  return env;
}

// The window's face: one or two captures cross-faded on a canvas.
class Face {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  mix(a, b, p) {
    const key = `${a.src}|${b ? b.src : ""}|${p.toFixed(2)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.globalAlpha = 1;
    g.drawImage(a, 0, 0, this.canvas.width, this.canvas.height);
    if (b && p > 0) { g.globalAlpha = p; g.drawImage(b, 0, 0, this.canvas.width, this.canvas.height); g.globalAlpha = 1; }
    this.texture.needsUpdate = true;
  }
}

function slab(w, h, r, depth, env) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -depth - 0.04);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.25, roughness: 0.32, envMap: env, envMapIntensity: 1.2, transparent: true }));
}

// A face with rounded corners: the capture is drawn into a clipped canvas.
function panelFace(engine, img, crop, r) {
  const c = document.createElement("canvas");
  c.width = Math.round(crop.w * CAP); c.height = Math.round(crop.h * CAP);
  const g = c.getContext("2d");
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, r * 100 * CAP); g.clip();
  g.drawImage(img, crop.x * CAP, crop.y * CAP, crop.w * CAP, crop.h * CAP, 0, 0, c.width, c.height);
  const tex = engine.canvasTexture(c);
  return new THREE.Mesh(new THREE.PlaneGeometry(crop.w / 100, crop.h / 100), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
}

const HULL = [[0.5, 0], [1, 0.77], [0.5, 1], [0, 0.77]];
export const MARK_ASPECT = 1905 / 2142;
function makePrism(height, env) {
  const w = height * MARK_ASPECT;
  const s = new THREE.Shape(HULL.map(([x, y]) => new THREE.Vector2((x - 0.5) * w, (0.5 - y) * height)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 4 });
  g.translate(0, 0, -0.76);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.05, roughness: 0.1, envMap: env, envMapIntensity: 1.8 }));
}

export async function createShots(engine, { matchHeight }) {
  const names = ["main", "rail-hover", "channel-hover", "compose-0", "compose-1", "compose-2", "compose-3", "compose-4", "profile", "dm"];
  const img = {};
  await Promise.all(names.map(async (n) => { img[n] = await loadImage(`../build/classic/${n}.png`); }));
  const { scene, renderer } = engine;
  const env = darkStudio(renderer);
  const sets = {};
  const addSet = (name, ...objs) => { const g = new THREE.Group(); g.visible = false; g.add(...objs); scene.add(g); sets[name] = g; return g; };

  // ---- the white shape ---------------------------------------------------------
  const prism = makePrism(matchHeight, env);
  addSet("shape", prism);

  // ---- floating panels of the real UI ------------------------------------------
  const PANELS = [
    { img: "main", crop: { x: 0, y: 0, w: 72, h: 900 }, at: [-4.3, 0.4, -8], rot: [0, 0.38, 0] },
    { img: "main", crop: { x: 72, y: 0, w: 240, h: 430 }, at: [3.9, 2.8, -14], rot: [0, -0.3, 0] },
    { img: "main", crop: { x: 312, y: 232, w: 620, h: 150 }, at: [-2.4, -3.8, -20], rot: [0.06, 0.22, 0] },
    { img: "main", crop: { x: 1200, y: 0, w: 240, h: 430 }, at: [4.6, -2.4, -24], rot: [0, -0.36, 0] },
    { img: "main", crop: { x: 312, y: 820, w: 888, h: 80 }, at: [0.4, 4.9, -28], rot: [0.2, 0, 0] },
    { img: "profile", crop: { x: 857, y: 168, w: 340, h: 445 }, at: [-4.9, 3.1, -32], rot: [0, 0.32, 0] },
    { img: "dm", crop: { x: 312, y: 120, w: 520, h: 300 }, at: [2.9, -5.1, -36], rot: [0, -0.2, 0] },
  ].map((p) => {
    const g = new THREE.Group();
    const r = 0.08;
    g.add(slab(p.crop.w / 100 + 0.04, p.crop.h / 100 + 0.04, r, 0.12, env), panelFace(engine, img[p.img], p.crop, r));
    g.children[1].position.z = 0.012;
    return { ...p, g };
  });
  addSet("panels", ...PANELS.map((p) => p.g));
  const setPanelOpacity = (p, a) => p.g.children.forEach((m) => { m.material.opacity = a; m.visible = a > 0.002; });

  // ---- the window ---------------------------------------------------------------
  const W = REGION.window.w / 100, H = REGION.window.h / 100;
  const face = new Face(engine, REGION.window.w * CAP, REGION.window.h * CAP);
  const win = new THREE.Group();
  const body = slab(W + 0.08, H + 0.08, 0.12, 0.3, env);
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false }));
  faceMesh.position.z = 0.012;
  win.add(body, faceMesh);
  win.position.set(0, 0, WIN_Z);
  addSet("window", win);

  // World point of a CSS-px location on the window (after its transform).
  const onWin = (x, y) => { win.updateMatrixWorld(true); return V(x / 100 - W / 2, H / 2 - y / 100, 0.02).applyMatrix4(win.matrixWorld); };
  // Frame a CSS-px region: `fill` is the fraction of the frame width it takes;
  // yaw/pitch orbit about the window normal; `lift` moves the content up the
  // frame (in units of frame height) to leave room for type below.
  function frame(cx, cy, regionW, { fill = 0.92, yaw = 0, pitch = 0, lift = 0, d } = {}) {
    const dist = d ?? (regionW / 100) / (WVIS * fill);
    const target = onWin(cx, cy).add(V(0, -lift * HVIS * dist, 0));
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    return { pos: target.clone().addScaledVector(dir, dist), target, dist };
  }

  function prepare(t) {
    const tc = T.typing;
    if (t < T.shotA) face.mix(img.main, null, 0);
    else if (t < T.shotB) face.mix(img["rail-hover"], null, 0);
    else if (t < T.shotC) face.mix(img["channel-hover"], null, 0);
    else if (t < T.shotD) {
      let k = 0;
      for (let i = 0; i < tc.length; i++) if (t >= tc[i]) k = i;
      face.mix(img[`compose-${k}`], null, 0);
    } else if (t < T.shotE) face.mix(img.main, img.profile, ease.inOutCubic(prog(t, T.profile, T.profile + 0.25)));
    else if (t < T.shotF) face.mix(img.dm, null, 0);
    else face.mix(img.main, null, 0);
  }

  function pose(t) {
    for (const g of Object.values(sets)) g.visible = false;
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (t * f + ph)) * a;
    win.scale.setScalar(1);
    win.rotation.set(0, 0, 0);
    body.material.opacity = 1;

    // 1 — the shape, then panels and the flight.
    if (t < T.window) {
      if (t < T.match) {
        sets.shape.visible = true;
        const e = ease.bezier(0.2, 0.6, 0.2, 1)(prog(t, T.shapeIn, T.match));
        prism.position.set(0, 0, lerp(-6, 0, e));
        prism.rotation.set(lerp(1.4, 0, e), lerp(-2.6, 0, e), lerp(0.5, 0, e));
        // The strip of light walks across the faces.
        prism.material.envMapRotation.set(0, lerp(-1.6, 1.2, ease.inOutSine(prog(t, 0.45, T.match))), 0);
        prism.material.opacity = 1;
      }
      sets.panels.visible = true;
      sets.window.visible = t > T.fly;
      PANELS.forEach((p, i) => {
        const a = smooth(prog(t, T.panelsIn + i * 0.1, T.panelsIn + i * 0.1 + 0.7));
        setPanelOpacity(p, a);
        p.g.position.set(p.at[0] + bob(0.2, i * 0.13, 0.1), p.at[1] + bob(0.17, i * 0.21, 0.1), p.at[2] + lerp(-4, 0, a));
        p.g.rotation.set(...p.rot);
      });
      const fly = ease.inOutCubic(prog(t, T.fly, T.window));
      const start = { pos: V(0, 0, 30), target: V(0, 0, 0) };
      const end = frame(720, 450, 0, { d: 44, yaw: 0.55, lift: 0.03 });
      const pos = start.pos.clone().lerp(end.pos, fly);
      const target = start.target.clone().lerp(end.target, fly);
      const push = ease.inOutSine(prog(t, 0, T.fly));
      pos.z -= 3 * push * (1 - fly);
      return { pos, target, fov: 30, aperture: lerp(0.04, 0.1, fly), focus: pos.distanceTo(target) };
    }

    sets.window.visible = true;
    win.position.set(0, bob(0.15, 0, 0.04), WIN_Z);

    // 2 — three-quarter to frontal, then into the chat.
    if (t < T.shotA) {
      const turn = ease.inOutSine(prog(t, T.window, T.frontal));
      const push = ease.inOutCubic(prog(t, T.frontal, T.shotA - 0.2));
      const cx = lerp(720, REGION.chat.x + REGION.chat.w / 2, push);
      const f = frame(cx, 450, 0, { d: lerp(44, 31, push), yaw: lerp(0.55, 0.05, turn), lift: lerp(0.03, 0.045, push) });
      return { pos: f.pos, target: f.target, fov: 30, aperture: 0.06, focus: f.dist };
    }

    // 3 — the montage.
    if (t < T.montageEnd) {
      const shot = (a, b) => prog(t, a, b);
      let f;
      if (t < T.shotB) {
        const u = ease.inOutSine(shot(T.shotA, T.shotB));
        f = frame(156, lerp(300, 560, u), 312, { fill: 0.92, yaw: 0.1, lift: 0 });
      } else if (t < T.shotC) {
        const u = ease.inOutCubic(shot(T.shotB, T.shotC));
        f = frame(lerp(560, 205, u), 240, 400, { fill: 0.95, yaw: lerp(-0.12, -0.04, u) });
      } else if (t < T.shotD) {
        const u = ease.inOutSine(shot(T.shotC, T.shotD));
        // Tight on the composer so the typed line reads: ~2.4 screen px per CSS px.
        f = frame(lerp(540, 560, u), lerp(560, 580, u), 420, { fill: 0.95, pitch: -0.06, yaw: 0.05 });
      } else if (t < T.shotE) {
        const u = ease.inOutSine(shot(T.shotD, T.shotE));
        f = frame(1145, 320, lerp(620, 590, u), { fill: 0.95, yaw: -0.07 });
      } else if (t < T.shotF) {
        const u = ease.inOutSine(shot(T.shotE, T.shotF));
        f = frame(lerp(1060, 1080, u), 330, 740, { fill: 0.95, yaw: -0.08 });
      } else {
        const u = ease.inOutCubic(shot(T.shotF, T.montageEnd));
        f = frame(720, 450, 0, { d: lerp(30, 48, u), yaw: lerp(0.02, 0.12, u) });
      }
      return { pos: f.pos, target: f.target, fov: 30, aperture: 0.03, focus: f.dist };
    }

    // 4 — the familiar feeling: panels recede behind; a slow push into the chat.
    if (t < T.pullBack) {
      sets.panels.visible = true;
      const fade = smooth(prog(t, T.montageEnd, T.familiar + 1.4));
      PANELS.forEach((p, i) => {
        setPanelOpacity(p, (1 - fade) * 0.8);
        p.g.position.set(p.at[0] * 2.2, p.at[1] * 1.8, WIN_Z - 12 - i * 3 - 30 * fade);
        p.g.rotation.set(...p.rot);
      });
      const u = ease.inOutSine(prog(t, T.montageEnd, T.pullBack));
      const cx = lerp(720, 756, u);
      const f = frame(cx, 450, 0, { d: lerp(48, 34, u), yaw: lerp(0.12, 0.0, u), lift: 0.005 });
      return { pos: f.pos, target: f.target, fov: 30, aperture: 0.05, focus: f.dist };
    }

    // 5 — pull back, fold to a panel, turn edge-on.
    const back = ease.inOutCubic(prog(t, T.pullBack, T.compress));
    const fold = ease.inOutCubic(prog(t, T.compress, T.spin));
    const spin = ease.inCubic(prog(t, T.spin, T.edge));
    win.scale.set(lerp(1, 0.42, fold), lerp(1, 0.52, fold), 1);
    win.rotation.set(0.08 * fold, (Math.PI / 2) * spin, 0);
    const f = frame(720, 450, 0, { d: lerp(34, 50, back), lift: 0 });
    f.target.copy(V(0, 0, WIN_Z));
    f.pos.copy(V(0, 0, WIN_Z + lerp(34, 50, back)));
    return { pos: f.pos, target: f.target, fov: 30, aperture: 0.04, focus: f.dist };
  }

  return {
    active: (t) => t < T.edge,
    prepare,
    pose,
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      if (t < T.match || (t > T.fly && t < T.window) || (t > T.spin && t < T.edge)) return 10;
      return 8;
    },
  };
}
