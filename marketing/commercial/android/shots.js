// Product shots for the Android beta announcement. Pure functions of time,
// like the main commercial's shots.js.
import * as THREE from "three";
import { T } from "./timeline.js";
import { makeAndroidPhone } from "../src/devices.js";
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

export async function createShots(engine) {
  const img = {};
  await Promise.all(["inbox", "server", "friends", "notes", "you"].map(async (n) => {
    img[n] = await loadImage(`../build/textures/android-${n}.png`);
  }));
  const W = img.inbox.naturalWidth, H = img.inbox.naturalHeight;
  const { scene } = engine;
  const sets = {};
  const addSet = (name, ...objs) => { const g = new THREE.Group(); g.visible = false; g.add(...objs); scene.add(g); sets[name] = g; };

  const introScreen = new Screen(engine, W, H);
  const intro = makeAndroidPhone(introScreen.texture);
  addSet("intro", intro.group);

  const pairA = new Screen(engine, W, H), pairB = new Screen(engine, W, H);
  const pa = makeAndroidPhone(pairA.texture), pb = makeAndroidPhone(pairB.texture);
  addSet("pair", pa.group, pb.group);

  const ctaScreen = new Screen(engine, W, H);
  const cta = makeAndroidPhone(ctaScreen.texture);
  addSet("cta", cta.group);

  // Honour each material's own envMapIntensity (see ../src/shots.js).
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.envMap) {
      o.material.envMap = scene.environment;
      o.material.needsUpdate = true;
    }
  });

  const shots = [
    { name: "intro", from: T.shotIntro, to: T.shotIntroEnd },
    { name: "pair", from: T.shotPair, to: T.shotPairEnd },
    { name: "cta", from: T.shotCta, to: T.shotCtaEnd },
  ];
  const shotAt = (t) => shots.find((s) => t >= s.from && t < s.to) ?? null;
  const fade = (t, at) => ease.inOutCubic(prog(t, at, at + 0.32));

  function prepare(t) {
    const s = shotAt(t);
    if (!s) return;
    if (s.name === "intro") {
      if (t < T.introSwitch2) introScreen.mix(img.inbox, img.server, fade(t, T.introSwitch1));
      else introScreen.mix(img.server, img.friends, fade(t, T.introSwitch2));
    } else if (s.name === "pair") {
      pairA.mix(img.friends, null, 0);
      pairB.mix(img.notes, null, 0);
    } else if (s.name === "cta") {
      ctaScreen.mix(img.inbox, null, 0);
    }
  }

  // Phone resting place on the left third of the frame, used where the intro
  // ends and the call to action begins, so the two read as one position.
  const HERO = { x: -10.5, y: 0, z: 0, ry: 0.32 };

  function pose(t, s = shotAt(t)) {
    for (const g of Object.values(sets)) g.visible = false;
    if (!s) return null;
    sets[s.name].visible = true;
    const u = t - s.from;
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (u * f + ph)) * a;

    if (s.name === "intro") {
      // Emerge at a three-quarter angle, orbit, push in to the display, then
      // pull back as the phone settles on the left.
      const rise = ease.outCubic(prog(t, s.from, s.from + 1.2));
      const settle = ease.inOutCubic(prog(t, 12.0, s.to));
      const g = intro.group;
      g.position.set(lerp(0, HERO.x, settle), lerp(-30, 0, rise) + bob(0.25, 0, 0.15), 0);
      g.rotation.set(lerp(-0.45, -0.03, rise), lerp(0, HERO.ry, settle), lerp(0.08, 0, rise));
      const orbit = ease.inOutSine(prog(t, s.from, 10.4));
      const push = ease.inOutCubic(prog(t, 10.3, 11.9));
      const a = lerp(-0.62, 0.12, orbit) * (1 - settle);
      const r = lerp(lerp(40, 26, push), 44, settle);
      const target = V(lerp(0, 0, settle), lerp(0.4, 1.2, push) * (1 - settle), 0);
      const pos = V(Math.sin(a) * r, lerp(3, 1.5, push) * (1 - settle) + 1.2 * settle, Math.cos(a) * r);
      return { pos, target, fov: 30, aperture: lerp(0.18, 0.1, settle) };
    }

    if (s.name === "pair") {
      // The second phone arrives from the right, further back; both turn
      // gently towards each other, then drop away for the type.
      const enter = ease.outCubic(prog(t, s.from, s.from + 1.1));
      const out = ease.inCubic(prog(t, s.to - 0.4, s.to));
      const drift = ease.inOutSine(prog(t, s.from, s.to));
      pa.group.position.set(lerp(HERO.x, -8.2, drift), bob(0.22, 0, 0.18) - out * 34, 0);
      pa.group.rotation.set(-0.03, lerp(HERO.ry, 0.26, drift), 0);
      pb.group.position.set(lerp(40, 9.5, enter), -0.6 + bob(0.22, 0.4, 0.18) - out * 34, -12);
      pb.group.rotation.set(-0.03, lerp(-0.9, -0.3, enter) - 0.06 * drift, 0);
      const pos = V(lerp(0, 1.5, drift), 1.2 + out * 6, lerp(45, 41, drift));
      return { pos, target: V(0.4, 0 + out * 8, -3), fov: 30, aperture: 0.28, focus: pos.distanceTo(V(-8.2, 0, 0)) };
    }

    if (s.name === "cta") {
      const enter = ease.outCubic(prog(t, s.from, s.from + 0.8));
      const out = ease.inCubic(prog(t, T.ctaOut, s.to));
      const g = cta.group;
      g.position.set(HERO.x + lerp(-16, 0, enter), bob(0.2, 0, 0.15) - out * 32, 0);
      g.rotation.set(-0.03, HERO.ry + lerp(0.5, 0, enter) + 0.05 * Math.sin(u * 0.7), 0);
      return { pos: V(0, 1.2 + out * 4, 44), target: V(0, out * 6, 0), fov: 30, aperture: 0.1 };
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
      const nearCut = Math.min(t - s.from, s.to - t);
      return nearCut < 0.4 ? 14 : 8;
    },
  };
}
