// Product shots for "Not another boring app." All in the white studio, pure
// functions of time:
//   hero  (0.3–5)   a phone spins in from the right and lands; its screen lifts
//                   off as a floating panel, four more panels slide out behind
//                   it, and the camera flies down the corridor they make into
//                   the dark of the last one;
//   solo  (5–7.75)  cut on black to the back of a phone: it turns to its screen;
//                   the Messages panel comes out toward the camera; the screen
//                   pushes to Disband Demo HQ (three angles, cut on beats);
//   cross (7.75–8.75) two phones at different depths pass each other;
//   row   (8.75–10) three phones snap into a row on the floor, and the camera
//                   flies over them to the black Disband mark behind;
//   final (14.4–20) one phone glides in beside the mark for the end card.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { T } from "./timeline.js";
import { makePhone, panel, MATERIALS } from "../src/devices.js";
import { bakeContactShadow, softBlob } from "../src/contact-shadow.js";
import { prog, lerp, ease } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The end card's phone: 900 px tall, centred at (760, 760) in the frame.
export const FINAL = { camZ: 59.75, x: 3.67, y: 3.34 };

class Screen {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  // draw(key, fn): redraws only when the key changes.
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    this.ctx.save();
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.texture.needsUpdate = true;
  }
  show(img) { this.draw(img.src, (g, w, h) => g.drawImage(img, 0, 0, w, h)); }
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`failed to load ${src}`));
  img.src = src;
});

function cardCanvas(img, sx, sy, sw, sh, r) {
  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  const g = c.getContext("2d");
  g.beginPath(); g.roundRect(0, 0, sw, sh, r); g.clip();
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
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
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p));
  let g = new THREE.ExtrudeGeometry(shapes, { depth: 160, bevelEnabled: true, bevelThickness: 20, bevelSize: 12, bevelSegments: 4, curveSegments: 24 });
  if (g.index) g = g.toNonIndexed();
  g.center();
  const s = height / 2142;
  g.scale(s, -s, s); // SVG y runs down
  flipWinding(g);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0, roughness: 0.22, envMapIntensity: 1.2 }));
}

export async function createShots(engine) {
  const img = {};
  await Promise.all([
    ["inbox", "ios-inbox"], ["server", "ios-server"], ["random", "ios-random"], ["you", "ios-you"], ["discover", "ios-discover"], ["dm", "ios-dm"],
    ["base", "layer-base"], ["rail", "layer-rail"], ["panel", "layer-panel"], ["dock", "layer-dock"],
  ].map(async ([k, f]) => { img[k] = await loadImage(`../build/textures/${f}.png`); }));
  const W = img.inbox.naturalWidth, H = img.inbox.naturalHeight;
  const { scene, renderer } = engine;
  const studio = scene.environment;
  const sets = {};
  const addSet = (name, ...objs) => { const g = new THREE.Group(); g.visible = false; g.add(...objs); scene.add(g); sets[name] = g; return g; };
  const tex = (image) => engine.canvasTexture(image);

  // ---- hero: phone + five floating screen panels ---------------------------
  const heroScreen = new Screen(engine, W, H);
  const hero = makePhone(heroScreen.texture);
  const { D, SW, SH } = hero.size;
  const black = document.createElement("canvas");
  black.width = black.height = 4;
  black.getContext("2d").fillStyle = "#050506";
  black.getContext("2d").fillRect(0, 0, 4, 4);
  black.src = "black";
  // A floating panel is a screen on a thin black glass slab.
  const makePanel = (image) => {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new RoundedBoxGeometry(SW + 0.16, SH + 0.16, 0.16, 4, 0.98), MATERIALS.blackGlass());
    slab.position.z = -0.09;
    const face = new THREE.Mesh(panel(SW, SH, 0.93), new THREE.MeshBasicMaterial({ map: tex(image), toneMapped: false }));
    face.position.z = 0.002;
    g.add(slab, face);
    return g;
  };
  const panels = {
    inbox: makePanel(img.inbox), server: makePanel(img.server), random: makePanel(img.random),
    you: makePanel(img.you), discover: makePanel(img.discover),
  };
  addSet("hero", hero.group, ...Object.values(panels));

  // ---- solo: one phone, its screen in layers for the panel shot ------------
  const soloScreen = new Screen(engine, W, H);
  const solo = makePhone(soloScreen.texture);
  const layered = document.createElement("canvas");
  layered.width = W; layered.height = H;
  { const g = layered.getContext("2d"); for (const k of ["base", "rail", "dock"]) g.drawImage(img[k], 0, 0, W, H); }
  layered.src = "layered";
  const P = { x: 72 * 3, y: 62 * 3, w: W - 72 * 3, h: H - 62 * 3 };
  const CW = (P.w / W) * SW, CH = (P.h / H) * SH;
  const slot = V(((P.x + P.w / 2) / W - 0.5) * SW, (0.5 - (P.y + P.h / 2) / H) * SH, D / 2 + 0.016);
  const card = new THREE.Group();
  {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({
      map: tex(cardCanvas(img.panel, P.x, P.y, P.w, P.h, 84)), transparent: true, toneMapped: false, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    face.renderOrder = 3;
    card.add(face);
  }
  solo.group.add(card);
  addSet("solo", solo.group);

  // ---- cross: two phones passing ------------------------------------------
  const crossScreens = [new Screen(engine, W, H), new Screen(engine, W, H)];
  const cross = crossScreens.map((s) => makePhone(s.texture));
  addSet("cross", ...cross.map((p) => p.group));

  // ---- row: three phones on the floor and the mark behind them -------------
  const rowScreens = [new Screen(engine, W, H), new Screen(engine, W, H), new Screen(engine, W, H)];
  const row = rowScreens.map((s) => makePhone(s.texture));
  for (const p of row) {
    bakeContactShadow(renderer, p.group, { floorY: -p.size.H / 2, width: 22, depth: 9, height: 3.5, blur: 1.6, opacity: 0.6 });
    softBlob(p.group, { floorY: -p.size.H / 2, width: 16, depth: 6, opacity: 0.2 });
  }
  const mark = await makeMark3D(22);
  const markHolder = new THREE.Group();
  markHolder.add(mark);
  bakeContactShadow(renderer, markHolder, { floorY: -11, width: 40, depth: 14, height: 3, blur: 2.0, opacity: 0.55 });
  addSet("row", ...row.map((p) => p.group), markHolder);

  // ---- final: the end card's phone -----------------------------------------
  const finalScreen = new Screen(engine, W, H);
  const fin = makePhone(finalScreen.texture);
  addSet("final", fin.group);

  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.envMap) { o.material.envMap = studio; o.material.needsUpdate = true; }
  });

  const shots = [
    { name: "hero", from: T.phoneIn - 0.05, to: T.shotHeroEnd },
    { name: "solo", from: T.shotA, to: T.shotD },
    { name: "cross", from: T.shotD, to: T.shotE },
    { name: "row", from: T.shotE, to: T.shotFEnd },
    { name: "final", from: T.shotFinal, to: Infinity },
  ];
  const shotAt = (t) => shots.find((s) => t >= s.from && t < s.to) ?? null;

  function prepare(t) {
    const s = shotAt(t);
    if (!s) return;
    if (s.name === "hero") heroScreen.show(t < T.lift ? img.inbox : black);
    else if (s.name === "solo") {
      if (t < T.shotB) soloScreen.show(img.inbox);
      else if (t < T.shotC) soloScreen.show(layered);
      else {
        // An iOS-style push: the new screen slides in from the right, the
        // status bar stays put.
        const p = ease.bezier(0.3, 0, 0.1, 1)(prog(t, T.cPush, T.cPush + 0.32));
        soloScreen.draw(`push${p.toFixed(3)}`, (g, w, h) => {
          g.drawImage(img.inbox, -p * w * 0.3, 0, w, h);
          g.fillStyle = `rgba(0,0,0,${(0.35 * p).toFixed(3)})`;
          g.fillRect(0, 0, w, h);
          g.drawImage(img.server, (1 - p) * w, 0, w, h);
          g.drawImage(img.inbox, 0, 0, w, 162, 0, 0, w, 162);
        });
      }
    } else if (s.name === "cross") {
      crossScreens[0].show(img.random);
      crossScreens[1].show(img.you);
    } else if (s.name === "row") {
      rowScreens[0].show(img.server);
      rowScreens[1].show(img.inbox);
      rowScreens[2].show(img.dm);
    } else {
      finalScreen.show(img.inbox);
    }
  }

  const land = ease.bezier(0.15, 0.7, 0.25, 1);     // fast in, zero velocity at rest
  const snap = ease.bezier(0.2, 0.9, 0.25, 1);
  const glide = ease.bezier(0.55, 0, 0.2, 1);

  // Corridor of panels for the fly-through (world positions, y-rotation).
  const CORRIDOR = {
    inbox: { p: V(-4.4, 0.3, 6), ry: 0.5 },
    server: { p: V(4.4, 0.6, 0), ry: -0.5 },
    you: { p: V(-4.4, 0.8, -6), ry: 0.5 },
    discover: { p: V(4.4, 0.4, -11), ry: -0.5 },
    random: { p: V(0, 0.5, -16), ry: 0 },
  };
  const SPREAD = ["server", "you", "discover", "random"];

  function pose(t, s = shotAt(t)) {
    for (const g of Object.values(sets)) g.visible = false;
    if (!s) return null;
    sets[s.name].visible = true;
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (t * f + ph)) * a;

    if (s.name === "hero") {
      const g = hero.group;
      // Scene 1: in from the right, 1.25 turns, landing three-quarter on.
      const e = land(prog(t, T.phoneIn, T.land));
      const since = Math.max(0, t - T.land);
      const wobble = t > T.land ? Math.exp(-since / 0.12) * Math.sin(2 * Math.PI * since * 4.5) * 0.06 : 0;
      const face = ease.inOutCubic(prog(t, T.face, T.lift));
      const away = ease.inCubic(prog(t, T.lift + 0.05, T.spread + 0.35));
      g.visible = away < 0.999;
      g.position.set(lerp(17, 0, e), lerp(1.2, 0, e) + bob(0.25, 0, 0.08) * (1 - face) - 9 * away, lerp(-6, 0, e) - 22 * away);
      g.rotation.set(lerp(0.9, 0, e) + 0.45 * away, lerp(-2.5 * Math.PI, 0.38, e) + wobble - 0.38 * face, lerp(-0.4, 0, e) + wobble * 0.3);

      // Panels: the screen lifts forward and grows; the rest slide out behind it.
      const liftE = snap(prog(t, T.lift, T.spread));
      const toSide = ease.inOutCubic(prog(t, T.spread, T.meet));
      g.updateMatrixWorld(true);
      const screenPos = V(0, 0, D / 2 + 0.02);
      const lifted = V(0, 0.3, 7);
      const ip = panels.inbox;
      ip.visible = t >= T.lift;
      ip.position.copy(screenPos.lerp(lifted, liftE)).lerp(CORRIDOR.inbox.p, toSide);
      ip.rotation.set(0, lerp(0, CORRIDOR.inbox.ry, toSide), 0);
      ip.scale.setScalar(lerp(1, 1.18, liftE) * lerp(1, 1 / 1.18, toSide));
      SPREAD.forEach((k, i) => {
        const pn = panels[k];
        const a = snap(prog(t, T.spread + i * 0.125, T.spread + i * 0.125 + 0.55));
        pn.visible = t >= T.spread + i * 0.125 - 0.02;
        const from = V(lifted.x, lifted.y, lifted.z - 1.2 - 0.2 * i);
        pn.position.copy(from).lerp(CORRIDOR[k].p, a);
        pn.rotation.set(0, lerp(0, CORRIDOR[k].ry, a), 0);
      });

      // Camera: low, framing the phone under the headline; then centred; then
      // down the corridor and into the dark lower half of the last panel.
      const centre = ease.inOutCubic(prog(t, T.face, T.lift + 0.2));
      const fly = ease.inOutSine(prog(t, T.spread + 0.25, T.flyInto));
      const into = ease.inCubic(prog(t, T.flyInto, s.to));
      const end = V(0, 0.5 - 3.06, CORRIDOR.random.p.z);
      let pos = V(0, lerp(3.27, 0.4, centre), lerp(48.9, 40, centre));
      let target = V(0, lerp(3.27, 0.3, centre), 0);
      pos = pos.lerp(V(0, 0.8, 13), fly);
      target = target.lerp(V(0, 0.4, -16), fly);
      pos = pos.lerp(V(end.x, end.y, end.z + 5.6), into);
      target = target.lerp(end, into);
      return { pos, target, fov: 30, aperture: lerp(0.1, 0.18, fly) * (1 - into), focus: pos.distanceTo(t < T.spread ? g.position : CORRIDOR.random.p) };
    }

    if (s.name === "solo") {
      const g = solo.group;
      if (t < T.shotB) {
        // A: from its back, filling the frame, round to its screen.
        // Slow off the cut, so the dark back holds the frame for a moment.
        const e = ease.bezier(0.5, 0, 0.2, 1)(prog(t, T.shotA, T.aLand));
        g.position.set(0, 0, 0);
        g.rotation.set(lerp(0.1, 0, e), lerp(Math.PI + 0.25, 0.22, e), 0);
        card.visible = false;
        const r = lerp(6.5, 44, ease.bezier(0.35, 0, 0.2, 1)(prog(t, T.shotA, T.aLand)));
        return { pos: V(lerp(0.4, 2.5, e), lerp(-2.4, 0.6, e), r), target: V(0, lerp(-2.4, 0.2, e), 0), fov: 30, aperture: 0.12 };
      }
      if (t < T.shotC) {
        // B: three-quarter from low right; the panel comes off toward the lens.
        g.position.set(0, bob(0.3, 0, 0.08), 0);
        g.rotation.set(0.04, -0.32, 0);
        card.visible = true;
        const out = snap(prog(t, T.bOut, T.bOut + 0.35)) * (1 - glide(prog(t, T.bBack, T.shotC - 0.05)));
        card.position.copy(slot).add(V(0.6 * out, 0.4 * out, 5.5 * out));
        card.rotation.set(-0.04 * out, 0.3 * out, 0);
        card.scale.setScalar(1 + 0.12 * out);
        const u = prog(t, T.shotB, T.shotC);
        return { pos: V(lerp(-15, -12, u), lerp(-4, -3, u), lerp(38, 35, u)), target: V(0, 0.2, 2), fov: 30, aperture: 0.16, focus: 38 };
      }
      // C: tight and tilted on the screen while it pushes.
      g.position.set(0, 0, 0);
      g.rotation.set(-0.08, 0.16, 0.06);
      card.visible = false;
      const u = prog(t, T.shotC, T.shotD);
      return { pos: V(lerp(3.2, 2.4, u), lerp(5.2, 4.6, u), lerp(27, 24, u)), target: V(0, 1.4, 0), fov: 30, aperture: 0.14, roll: 0.05 };
    }

    if (s.name === "cross") {
      // The near phone runs left to right turning one way, the far one right
      // to left turning the other; they pass on the beat.
      const u = ease.inOutSine(prog(t, s.from, s.to));
      const [a, b] = cross;
      a.group.position.set(lerp(-11, 11, u), lerp(-1.2, 0.6, u), 9);
      a.group.rotation.set(0.05, lerp(1.25, -1.25, u), lerp(0.1, -0.1, u));
      b.group.position.set(lerp(15, -15, u), lerp(1.8, 0.2, u), -16);
      b.group.rotation.set(-0.05, lerp(-1.5, 1.5, u), 0);
      return { pos: V(0, 1, 48), target: V(0, 0.3, 0), fov: 30, aperture: 0.2, focus: 39 };
    }

    if (s.name === "row") {
      // E: three phones snap from loose to a precise row; F: over them to the mark.
      const SLOTS = [{ x: -10, z: -1.5, ry: 0.38 }, { x: 0, z: 0, ry: 0 }, { x: 10, z: -1.5, ry: -0.38 }];
      const FROM = [{ x: -17, z: -10, ry: 1.3 }, { x: 0, z: -14, ry: -0.9 }, { x: 17, z: -10, ry: -1.3 }];
      row.forEach((p, i) => {
        const a = glide(prog(t, s.from + i * 0.06, T.eAlign));
        p.group.position.set(lerp(FROM[i].x, SLOTS[i].x, a), p.size.H / 2, lerp(FROM[i].z, SLOTS[i].z, a));
        p.group.rotation.set(0, lerp(FROM[i].ry, SLOTS[i].ry, a), 0);
      });
      markHolder.position.set(0, 11, -30);
      markHolder.rotation.set(0, 0.06 * Math.sin(t), 0);
      // Up and over the row first, then in to the mark.
      const f = ease.inOutCubic(prog(t, T.shotF, s.to + 0.06));
      const rise = ease.outCubic(prog(t, T.shotF, s.to - 0.1));
      const pos = V(0, lerp(12, 26, rise), lerp(82, 8, f));
      const target = V(0, 6.6, -4).lerp(V(0, 11, -30), f);
      return { pos, target, fov: 30, aperture: lerp(0.06, 0.12, f), focus: pos.distanceTo(f < 0.5 ? V(0, 7.5, 0) : V(0, 11, -30)) };
    }

    // final: in from the right to its place beside the mark.
    const e = glide(prog(t, T.settle, T.lock));
    fin.group.position.set(lerp(15, FINAL.x, e), FINAL.y + bob(0.18, 0, 0.04) * e, 0);
    fin.group.rotation.set(0, lerp(-1.3, -0.3, e), 0);
    return { pos: V(0, 0, FINAL.camZ), target: V(0, 0, 0), fov: 30, aperture: 0 };
  }

  return {
    active: (t) => shotAt(t) !== null,
    shotAt,
    prepare,
    pose,
    // The cut onto the back of the phone comes up from near black.
    exposure: (t) => (t >= T.shotA && t < T.shotB ? 0.4 + 0.6 * ease.outCubic(prog(t, T.shotA, T.shotA + 0.22)) : 1),
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      const s = shotAt(t);
      if (!s) return 0;
      if (s.name === "hero") return t < T.land + 0.1 ? 14 : t > T.lift ? 10 : 8;
      if (s.name === "final") return t < T.lock + 0.1 ? 10 : 4;
      if (s.name === "solo") return t < T.aLand || (t > T.bOut && t < T.shotC) || (t > T.cPush && t < T.cPush + 0.35) ? 12 : 8;
      return 12;
    },
  };
}
