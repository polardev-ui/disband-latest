// Product shots for the 9:16 social spot. Pure functions of time, like the
// other films' shots.js. Two sets share the scene:
//   dark  — one phone on black, lit only by narrow strip lights, that comes
//           apart into its layers (chassis, display, rail, panel, dock, glass)
//           and goes back together;
//   light — the same phone in the white studio, with the Disband mark
//           extruded behind it.
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { T } from "./timeline.js";
import { makePhone, panel, roundedRect } from "../src/devices.js";
import { prog, lerp, ease } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

class Screen {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  // Cross-fade from one capture to the next; redraws only when the mix changes.
  mix(a, b, p) {
    const key = `${a.src}|${b ? b.src : ""}|${p.toFixed(3)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.globalAlpha = 1;
    g.drawImage(a, 0, 0, this.canvas.width, this.canvas.height);
    if (b && p > 0) {
      g.globalAlpha = p;
      g.drawImage(b, 0, 0, this.canvas.width, this.canvas.height);
      g.globalAlpha = 1;
    }
    this.texture.needsUpdate = true;
  }
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`failed to load ${src}`));
  img.src = src;
});

// Black stage: no fill at all, two thin rim strips behind the subject, a faint
// overhead and one narrow strip in front that draws a single streak across the
// cover glass. Rotating it (envMapRotation) walks the highlights over the phone.
function darkEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const strip = (w, h, k) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  place(strip(3.2, 46, 26), -36, 8, -22);
  place(strip(2.4, 40, 18), 38, 4, -26);
  place(strip(34, 5, 1.1), 0, 42, 8);
  place(strip(1.4, 34, 6), -22, 4, 40);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  return env;
}

// Reverses triangle winding of a non-indexed geometry (after a mirror).
function flipWinding(g) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const v1 = a.array[(i + 1) * n + k];
        a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k];
        a.array[(i + 2) * n + k] = v1;
      }
    }
    a.needsUpdate = true;
  }
}

async function makeMark3D(height) {
  const svg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
  const data = new SVGLoader().parse(svg);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  let g = new THREE.ExtrudeGeometry(shapes, { depth: 150, bevelEnabled: true, bevelThickness: 22, bevelSize: 14, bevelSegments: 4, curveSegments: 24 });
  if (g.index) g = g.toNonIndexed();
  g.center();
  const s = height / 2142;
  g.scale(s, -s, s); // SVG y runs down
  flipWinding(g);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9e9ed, metalness: 0, roughness: 0.38, envMapIntensity: 1.0, transparent: true });
  return new THREE.Mesh(g, mat);
}

export async function createShots(engine) {
  const img = {};
  await Promise.all([
    ["inbox", "ios-inbox"], ["server", "ios-server"], ["random", "ios-random"],
    ["base", "layer-base"], ["rail", "layer-rail"], ["panel", "layer-panel"], ["dock", "layer-dock"],
  ].map(async ([k, f]) => { img[k] = await loadImage(`../build/textures/${f}.png`); }));
  const W = img.inbox.naturalWidth, H = img.inbox.naturalHeight;
  const { scene, renderer } = engine;
  const studio = scene.environment;
  const dark = darkEnvironment(renderer);
  const sets = {};
  const addSet = (name, ...objs) => { const g = new THREE.Group(); g.visible = false; g.add(...objs); scene.add(g); sets[name] = g; };
  const useEnv = (root, env) => root.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.needsUpdate = true; }
  });

  // ---- Dark set: the layered phone ----------------------------------------
  const darkScreen = new Screen(engine, W, H);
  const ph = makePhone(darkScreen.texture);
  const { D, SW, SH } = ph.size;
  const chassis = new THREE.Group();
  for (const c of [...ph.group.children]) if (c !== ph.screen && c !== ph.glare) chassis.add(c);
  const display = new THREE.Group();
  display.add(ph.screen);
  const glass = new THREE.Group();
  glass.add(ph.glare);
  // Hairline edge so the cover glass reads as a sheet once it lifts off.
  const edgeShape = roundedRect(SW + 0.16, SH + 0.16, 1.0);
  edgeShape.holes.push(roundedRect(SW + 0.08, SH + 0.08, 0.96));
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(edgeShape, 32), edgeMat);
  edge.position.z = D / 2 + 0.024;
  glass.add(edge);
  const uiLayer = (image, order) => {
    const tex = engine.canvasTexture(image);
    const m = new THREE.Mesh(panel(SW, SH, 0.93), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 - order, polygonOffsetUnits: -3 - order }));
    m.position.z = D / 2 + 0.014 + order * 0.001;
    m.renderOrder = 2 + order;
    const g = new THREE.Group();
    g.add(m);
    return { g, m };
  };
  const rail = uiLayer(img.rail, 1), panelL = uiLayer(img.panel, 2), dock = uiLayer(img.dock, 3);
  glass.children.forEach((c) => { c.renderOrder = 6; });
  const darkPhone = new THREE.Group();
  darkPhone.add(chassis, display, rail.g, panelL.g, dock.g, glass);
  addSet("dark", darkPhone);
  useEnv(darkPhone, dark);

  // ---- Light set: phone + the mark behind it ------------------------------
  const lightScreen = new Screen(engine, W, H);
  const lp = makePhone(lightScreen.texture);
  const mark = await makeMark3D(30);
  addSet("light", lp.group, mark);
  useEnv(lp.group, studio);
  useEnv(mark, studio);

  const shots = [
    { name: "dark", from: T.shotDark, to: T.shotDarkEnd },
    { name: "light", from: T.shotLight, to: T.shotLightEnd },
  ];
  const shotAt = (t) => shots.find((s) => t >= s.from && t < s.to) ?? null;
  const fade = (t, at, d = 0.36) => ease.inOutCubic(prog(t, at, at + d));
  const layered = (t) => t >= T.turn;

  function prepare(t) {
    const s = shotAt(t);
    if (!s) return;
    if (s.name === "dark") {
      const on = layered(t);
      // Before the shot comes apart the display shows whole screens; from the
      // turn it shows only the base and the UI layers sit on top of it, which
      // composes to the same Messages screen.
      if (on) darkScreen.mix(img.base, null, 0);
      else darkScreen.mix(img.server, img.inbox, fade(t, T.screenSwitch, 0.4));
      rail.g.visible = panelL.g.visible = dock.g.visible = on;
    } else {
      lightScreen.mix(img.inbox, img.random, fade(t, T.screenSwitch2, 0.4));
    }
  }

  // Per-layer separation: out with a long settle, back in on its own click.
  const outEase = ease.bezier(0.3, 0, 0.15, 1);
  const inEase = ease.bezier(0.55, 0, 0.25, 1);
  const LAYERS = [
    // obj, explode start, land, offset [x, y, z], rotation [x, y]
    { g: chassis, out: T.explode, land: T.assembleClicks[0] - 0.125, off: [0, 0, -3.4], rot: [0, 0] },
    { g: rail.g, out: T.explode + 0.1, land: T.assembleClicks[2], off: [-1.1, 0.2, 1.9], rot: [0, 0.14] },
    { g: panelL.g, out: T.explode + 0.2, land: T.assembleClicks[1], off: [0.55, 0.35, 3.5], rot: [0.03, -0.05] },
    { g: dock.g, out: T.explode + 0.3, land: T.assembleClicks[0], off: [0, -1.8, 5.1], rot: [-0.12, 0] },
    { g: glass, out: T.explode + 0.4, land: T.assembleClicks[3], off: [0, 0.2, 6.8], rot: [0, 0] },
  ];
  function explodeAmount(L, t) {
    const a = outEase(prog(t, L.out, L.out + 1.15));
    const b = inEase(prog(t, L.land - 0.7, L.land));
    return a * (1 - b);
  }

  function pose(t, s = shotAt(t)) {
    for (const g of Object.values(sets)) g.visible = false;
    if (!s) return null;
    sets[s.name].visible = true;
    const u = t - s.from;
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (u * f + ph)) * a;

    if (s.name === "dark") {
      engine.key.intensity = 0.12;
      // Emerge from deep in the dark, turning; then a slow orbit.
      const rise = ease.bezier(0.2, 0.6, 0.2, 1)(prog(t, s.from, T.phoneEmerged));
      const turn = ease.inOutCubic(prog(t, T.turn, T.explode + 0.2));
      const front = ease.inOutCubic(prog(t, T.assembleClicks[3] - 0.1, s.to + 0.4));
      darkPhone.position.set(0, lerp(-5, 0, rise) + bob(0.2, 0, 0.12), lerp(-70, 0, rise));
      const ry = lerp(-1.25, -0.3, rise) + 0.32 * ease.inOutSine(prog(t, T.phoneEmerged, T.turn)) - 0.62 * turn + 0.45 * front;
      darkPhone.rotation.set(lerp(0.25, -0.04, rise), ry, lerp(-0.12, 0, rise));

      for (const L of LAYERS) {
        const e = explodeAmount(L, t);
        const k = LAYERS.indexOf(L);
        const drift = e * bob(0.31, k * 0.21, 0.18);
        L.g.position.set(L.off[0] * e, L.off[1] * e + drift, L.off[2] * e);
        L.g.rotation.set(L.rot[0] * e, L.rot[1] * e + e * bob(0.17, k * 0.37, 0.05), 0);
      }
      const ge = explodeAmount(LAYERS[4], t);
      edgeMat.opacity = 0.32 * ge;
      ph.glare.material.envMapIntensity = lerp(0.09, 0.5, ge);
      // The rim light walks across the glass as the phone turns.
      const envRot = lerp(-0.9, 0.7, ease.inOutSine(prog(t, s.from, s.to)));
      darkPhone.traverse((o) => { if (o.isMesh && o.material.envMapRotation) o.material.envMapRotation.set(0, envRot, 0); });

      const orbit = ease.inOutSine(prog(t, s.from, T.turn + 0.5));
      const late = ease.inOutSine(prog(t, T.turn, s.to));
      const a = lerp(-0.5, 0.32, orbit) - 0.2 * late;
      const r = lerp(46, 43, orbit) + 7 * Math.sin(Math.PI * prog(t, T.explode - 0.2, T.assembleClicks[3] + 0.1));
      const target = V(0, lerp(1.4, 0.9, late), lerp(0, 2.2, Math.sin(Math.PI * prog(t, T.explode, T.assembleClicks[3]))));
      const pos = V(Math.sin(a) * r, lerp(2.6, 1.2, orbit) + 1.5 * late, Math.cos(a) * r);
      return { pos, target, fov: 30, aperture: 0.22, focus: pos.distanceTo(V(0, 0, 1.5)) };
    }

    if (s.name === "light") {
      engine.key.intensity = 1.6;
      const glide = ease.inOutCubic(prog(t, T.glide, T.glide + 1.6));
      const out = ease.inCubic(prog(t, T.phoneOut, s.to));
      const g = lp.group;
      g.position.set(lerp(1.4, 0, glide), lerp(-1.3, 1.9, glide) + bob(0.2, 0.1, 0.1) - out * 30, lerp(0, 2, glide));
      g.rotation.set(lerp(-0.02, -0.04, glide), lerp(-0.55, -0.12, ease.outCubic(prog(t, s.from, T.glide))) + 0.12 * glide + 0.04 * Math.sin(u * 0.6), lerp(0.03, 0, glide));

      const markIn = ease.bezier(0.25, 0, 0.1, 1)(prog(t, T.logo3dIn, T.logo3dIn + 1.6));
      const markOut = ease.inOutSine(prog(t, T.phoneOut - 0.05, s.to - 0.1));
      mark.visible = markIn > 0.001 && markOut < 0.999;
      mark.material.opacity = markIn * (1 - markOut);
      mark.position.set(0, lerp(-6, 3.2, markIn), -24);
      mark.rotation.set(0, lerp(-0.35, 0, markIn) + 0.03 * Math.sin(u * 0.5), 0);

      const push = ease.inOutSine(prog(t, T.glide, T.phoneOut));
      const a = lerp(0.28, 0.0, ease.inOutSine(prog(t, s.from, T.glide + 1.6)));
      const r = lerp(lerp(47, 48, glide), 42, push) - 4 * out;
      const pos = V(Math.sin(a) * r, lerp(1.6, 1.0, glide) + 3 * out, Math.cos(a) * r);
      const target = V(0, lerp(1.4, 0.0, glide) + 2.5 * out, 0);
      return { pos, target, fov: 30, aperture: 0.06, focus: pos.distanceTo(g.position) };
    }
    return null;
  }

  return {
    active: (t) => shotAt(t) !== null,
    shotAt,
    prepare,
    pose,
    background: (t) => (t < T.shotLight ? 0 : 1),
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      const s = shotAt(t);
      if (!s) return 0;
      const moving = (t > T.explode && t < T.assembleClicks[3] + 0.1) || t > T.phoneOut || t < T.phoneEmerged;
      return moving ? 12 : 8;
    },
  };
}
