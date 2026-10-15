// Product shots for "A New Way to Connect." Pure functions of time, like the
// other films' shots.js. All of it is in the white studio:
//   open     — a black prism cut to the hull of the Disband mark spins in;
//   converge — a phone from the left, the Messages panel from the right; the
//              panel slots into the screen, the screen lifts into layers,
//              swaps to Disband Demo HQ, closes, and turns edge-on;
//   pair     — the phone standing on the floor at a new angle, a second one
//              joining, with baked contact shadows;
//   type     — one phone spinning in, then two, under the words.
import * as THREE from "three";
import { T } from "./timeline.js";
import { makePhone, panel } from "../src/devices.js";
import { bakeContactShadow, softBlob } from "../src/contact-shadow.js";
import { prog, lerp, ease } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Canvas-backed texture: draws a stack of [image, alpha] pairs, and only
// redraws when the stack changes.
class Screen {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  draw(stack) {
    const key = stack.map(([im, a]) => `${im.src}@${a.toFixed(3)}`).join("|");
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const [im, a] of stack) {
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.drawImage(im, 0, 0, this.canvas.width, this.canvas.height);
    }
    g.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }
  mix(a, b, p) { this.draw(b && p > 0 ? [[a, 1], [b, p]] : [[a, 1]]); }
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`failed to load ${src}`));
  img.src = src;
});

// The convex hull of the mark (normalised to its viewBox): apex, the two
// outer corners and the point of the V. Measured from assets/logo/disband-mark.svg.
const HULL = [[0.5, 0], [1, 0.77], [0.5, 1], [0, 0.77]];
export const MARK_ASPECT = 1905 / 2142;

function makePrism(height, depth) {
  const w = height * MARK_ASPECT;
  const s = new THREE.Shape(HULL.map(([x, y]) => new THREE.Vector2((x - 0.5) * w, (0.5 - y) * height)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 4 });
  g.translate(0, 0, -depth - 0.06); // front face on z = 0
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0, roughness: 0.2, envMapIntensity: 1.3 }));
}

// A rounded card cut from one of the screen layers (the raised panel).
function cardCanvas(img, sx, sy, sw, sh, r) {
  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  const g = c.getContext("2d");
  g.beginPath(); g.roundRect(0, 0, sw, sh, r); g.clip();
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

export async function createShots(engine, { matchHeight }) {
  const img = {};
  await Promise.all([
    ["inbox", "ios-inbox"], ["server", "ios-server"], ["random", "ios-random"], ["dm", "ios-dm"], ["discover", "ios-discover"], ["you", "ios-you"],
    ["base", "layer-base"], ["rail", "layer-rail"], ["panel", "layer-panel"], ["dock", "layer-dock"],
    ["sRail", "layer-server-rail"], ["sPanel", "layer-server-panel"],
  ].map(async ([k, f]) => { img[k] = await loadImage(`../build/textures/${f}.png`); }));
  const W = img.inbox.naturalWidth, H = img.inbox.naturalHeight; // 1206 × 2622 (3× of 402 × 874 pt)
  const { scene, renderer } = engine;
  const studio = scene.environment;
  const sets = {};
  const addSet = (name, ...objs) => { const g = new THREE.Group(); g.visible = false; g.add(...objs); scene.add(g); sets[name] = g; return g; };

  // ---- open: the prism --------------------------------------------------
  const prism = makePrism(matchHeight, 0.9);
  addSet("open", prism);

  // ---- converge: phone + panel card + lifting layers --------------------
  const cv = makePhone(engine.canvasTexture(img.base));
  const { D, SW, SH } = cv.size;
  const uiLayer = (texture, order) => {
    const m = new THREE.Mesh(panel(SW, SH, 0.93), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, toneMapped: false, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3 - order, polygonOffsetUnits: -3 - order,
    }));
    m.position.z = D / 2 + 0.014 + order * 0.001;
    m.renderOrder = 2 + order;
    const g = new THREE.Group();
    g.add(m);
    cv.group.add(g);
    return g;
  };
  const railScreen = new Screen(engine, W, H);
  const rail = uiLayer(railScreen.texture, 1);
  const dock = uiLayer(engine.canvasTexture(img.dock), 3);
  // Panel: 72 pt from the left, 62 pt from the top, to the bottom-right corner.
  const P = { x: 72 * 3, y: 62 * 3, w: W - 72 * 3, h: H - 62 * 3 };
  const CW = (P.w / W) * SW, CH = (P.h / H) * SH;
  const slotLocal = V(((P.x + P.w / 2) / W - 0.5) * SW, (0.5 - (P.y + P.h / 2) / H) * SH, D / 2 + 0.0155);
  const makeCard = (image) => {
    const tex = engine.canvasTexture(cardCanvas(image, P.x, P.y, P.w, P.h, 84));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, toneMapped: false, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    }));
    m.renderOrder = 3;
    return m;
  };
  const cardA = makeCard(img.panel), cardB = makeCard(img.sPanel);
  const slot = new THREE.Object3D();
  cv.group.add(slot);
  addSet("converge", cv.group, cardA, cardB);

  // ---- pair: two phones standing on the floor ----------------------------
  const pairScreens = [new Screen(engine, W, H), new Screen(engine, W, H)];
  const pairPhones = pairScreens.map((s) => makePhone(s.texture));
  for (const p of pairPhones) {
    bakeContactShadow(renderer, p.group, { floorY: -p.size.H / 2, width: 22, depth: 9, height: 3.5, blur: 1.6, opacity: 0.62 });
    softBlob(p.group, { floorY: -p.size.H / 2, width: 16, depth: 6, opacity: 0.22 });
  }
  addSet("pair", ...pairPhones.map((p) => p.group));

  // ---- type: phones turning under the words ------------------------------
  const typeScreens = [new Screen(engine, W, H), new Screen(engine, W, H)];
  const typePhones = typeScreens.map((s) => makePhone(s.texture));
  addSet("type", ...typePhones.map((p) => p.group));

  // Honour each material's own envMapIntensity (see ../src/shots.js).
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.envMap) { o.material.envMap = studio; o.material.needsUpdate = true; }
  });

  const shots = [
    { name: "open", from: T.shapeIn, to: T.match },
    { name: "converge", from: T.shotConverge, to: T.shotConvergeEnd },
    { name: "pair", from: T.shotPair, to: T.shotPairEnd },
    { name: "type", from: T.shotType, to: T.shotTypeEnd },
  ];
  const shotAt = (t) => shots.find((s) => t >= s.from && t < s.to) ?? null;
  const fade = (t, at, d = 0.2) => ease.inOutCubic(prog(t, at, at + d));

  function prepare(t) {
    const s = shotAt(t);
    if (!s) return;
    if (s.name === "converge") {
      railScreen.mix(img.rail, img.sRail, fade(t, T.swapIn, 0.25));
    } else if (s.name === "pair") {
      pairScreens[0].mix(img.random, img.dm, fade(t, T.glimpse1));
      pairScreens[1].mix(img.discover, img.you, fade(t, T.glimpse2));
    } else if (s.name === "type") {
      typeScreens[0].mix(img.inbox, img.dm, fade(t, T.social - 0.1));
      typeScreens[1].mix(img.random, null, 0);
    }
  }

  const snap = ease.bezier(0.2, 0.9, 0.25, 1);     // fast in, long settle
  const glideIn = ease.bezier(0.55, 0, 0.2, 1);    // lands on its click
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e3 = new THREE.Euler();
  const pw = new THREE.Vector3(), qw = new THREE.Quaternion();
  // Places a card between a free pose and a pose relative to the slot.
  function placeCard(card, free, freeRot, k, slotOffset, slotRot) {
    slot.position.copy(slotLocal).add(slotOffset);
    slot.rotation.set(slotRot[0], slotRot[1], 0);
    cv.group.updateMatrixWorld(true);
    slot.getWorldPosition(pw);
    slot.getWorldQuaternion(qw);
    card.position.copy(free).lerp(pw, k);
    q.setFromEuler(e3.set(...freeRot));
    card.quaternion.copy(q).slerp(qw, k);
  }

  function pose(t, s = shotAt(t)) {
    for (const g of Object.values(sets)) g.visible = false;
    if (!s) return null;
    sets[s.name].visible = true;
    const u = t - s.from;
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (u * f + ph)) * a;

    if (s.name === "open") {
      // In from beyond the bottom-right corner, three-quarters of a turn on
      // two axes, settling flat-on exactly where the mark will be.
      const e = ease.bezier(0.1, 0.62, 0.2, 1)(prog(t, s.from, s.to + 0.04));
      prism.position.set(lerp(5.6, 0, e), lerp(-9.5, 0, e), lerp(9, 0, e));
      prism.rotation.set(lerp(2.4, 0, e), lerp(-3.3, 0, e), lerp(1.1, 0, e));
      return { pos: V(0, 0, 40), target: V(0, 0, 0), fov: 30, aperture: 0 };
    }

    if (s.name === "converge") {
      const g = cv.group;
      const arrive = snap(prog(t, T.enter, T.arrive));
      const meet = ease.inOutCubic(prog(t, T.arrive, T.panelLand));
      const lift = ease.bezier(0.3, 0, 0.15, 1)(prog(t, T.panelLand, T.lifted));
      const close = glideIn(prog(t, T.collapse, T.collapsed));
      const open = lift * (1 - close);
      const edge = ease.inOutCubic(prog(t, T.edgeOn, T.iris));
      g.position.set(lerp(-16, -2.6, arrive) * (1 - meet) + bob(0.3, 0, 0.05), lerp(-0.6, 0, arrive) + bob(0.25, 0.2, 0.1), 0);
      // Edge-on to the camera, which ends the orbit 0.3 rad off-axis.
      const ry = lerp(0.75, 0.2, arrive) * (1 - meet) - 0.55 * open + (Math.PI / 2 + 0.3) * edge;
      g.rotation.set(-0.02, ry, lerp(-0.1, 0, arrive));

      // Layers lift forward off the display and come back on the click.
      rail.position.set(-1.0 * open, 0.15 * open, 1.7 * open);
      rail.rotation.set(0, 0.12 * open, 0);
      dock.position.set(0, -1.7 * open, 4.6 * open);
      dock.rotation.set(-0.1 * open, 0, 0);
      const cardOff = V(0.35 * open, 0.3 * open, 3.1 * open);
      const cardRot = [0.02 * open, -0.05 * open];

      // Card A: in from the right, into the slot, then out to the right.
      const cardIn = snap(prog(t, T.enter + 0.06, T.arrive));
      const land = glideIn(prog(t, T.arrive, T.panelLand));
      const freeA = V(lerp(17, 3.7, cardIn), lerp(1.4, 0.7, cardIn) + bob(0.3, 0.5, 0.08), lerp(4, 3, cardIn));
      const outA = ease.inCubic(prog(t, T.swapOut, T.swapIn));
      placeCard(cardA, freeA, [0.05, lerp(-1.0, -0.38, cardIn), lerp(0.12, 0.03, cardIn)], land, cardOff.clone().add(V(13 * outA, 0.4 * outA, -1.5 * outA)), [cardRot[0], cardRot[1] - 0.5 * outA]);
      cardA.visible = outA < 0.999;
      // Card B (Disband Demo HQ): in from the left into the lifted slot.
      const inB = glideIn(prog(t, T.swapIn - 0.05, T.swapLand));
      placeCard(cardB, V(0, 0, 0), [0, 0, 0], 1, cardOff.clone().add(V(-13 * (1 - inB), 0.4 * (1 - inB), -1.5 * (1 - inB))), [cardRot[0], cardRot[1] + 0.5 * (1 - inB)]);
      cardB.visible = t >= T.swapIn - 0.05;

      const orbit = ease.inOutSine(prog(t, s.from, T.collapsed));
      const a = lerp(-0.38, 0.3, orbit);
      const push = ease.inCubic(prog(t, T.edgeOn, s.to));
      const r = lerp(48, 44, orbit) + 2.5 * open - 12 * push;
      const pos = V(Math.sin(a) * r, lerp(2.2, 1.0, orbit), Math.cos(a) * r);
      return { pos, target: V(0, 0.2, 1.2 * open), fov: 30, aperture: 0.12, focus: pos.distanceTo(V(0, 0, 1.5 * open)) };
    }

    if (s.name === "pair") {
      const [A, B] = pairPhones;
      const hA = A.size.H / 2;
      const join = snap(prog(t, T.pairJoin, T.pairJoin + 0.7));
      A.group.position.set(-1.9, hA, 0);
      A.group.rotation.set(0, lerp(-0.62, -0.36, ease.inOutSine(prog(t, s.from, s.to))), 0);
      B.group.position.set(lerp(24, 3.7, join), hA, -6.5);
      B.group.rotation.set(0, lerp(-0.9, 0.22, join), 0);
      const dolly = ease.inOutSine(prog(t, s.from, T.pushIn));
      const push = ease.inCubic(prog(t, T.pushIn, s.to));
      const target = V(lerp(-1.6, 0.9, dolly), lerp(8.6, 8.2, dolly), -2).lerp(V(-1.9, 7.8, 0), push);
      const base = V(lerp(-7, 5, dolly), lerp(11.5, 13, dolly), 46);
      const pos = base.clone().lerp(V(-2.5, 9, 22), push);
      return { pos, target, fov: 30, aperture: 0.18, focus: pos.distanceTo(V(-1.9, 7.5, 0)) };
    }

    if (s.name === "type") {
      const [A, B] = typePhones;
      const spin = ease.bezier(0.08, 0.75, 0.2, 1)(prog(t, s.from, T.simple + 0.1));
      const pairUp = snap(prog(t, T.social - 0.05, T.social + 0.6));
      const away = ease.inCubic(prog(t, T.phonesAway, s.to));
      A.group.position.set(lerp(0, -3.45, pairUp), lerp(-6, 0, spin) + bob(0.3, 0, 0.1) + away * 30, lerp(-14, 0, spin));
      A.group.rotation.set(lerp(0.35, 0, spin), lerp(-2 * Math.PI, 0, spin) + 0.3 * ease.inOutSine(prog(t, T.simple, T.social)) + lerp(0, 0.1, pairUp) + 0.8 * away, -0.25 * away);
      B.group.visible = t >= T.social - 0.05;
      B.group.position.set(lerp(18, 3.45, pairUp), bob(0.3, 0.4, 0.1) + away * 30, 0);
      B.group.rotation.set(0, lerp(-1.2, -0.38, pairUp) - 0.8 * away, 0.25 * away);
      return { pos: V(0, 0.5, 55), target: V(0, -3.6, 0), fov: 30, aperture: 0.08 };
    }
    return null;
  }

  return {
    active: (t) => shotAt(t) !== null,
    shotAt,
    prepare,
    pose,
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      const s = shotAt(t);
      if (!s) return 0;
      const fast = s.name === "open" || t < T.arrive + 0.2 || (t > T.swapOut && t < T.swapLand)
        || (t > T.edgeOn && t < T.shotConvergeEnd) || (t > T.pairJoin && t < T.pairJoin + 0.4)
        || t > T.pushIn && t < T.shotPairEnd || (s.name === "type" && (t < T.simple || t > T.phonesAway));
      return fast ? 12 : 8;
    },
  };
}
