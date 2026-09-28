// The product shots: camera paths, device choreography and on-screen UI
// animation for scenes 4 and 5. Everything is a pure function of time so a
// frame renders identically whether it is rendered in order or on its own.
import * as THREE from "three";
import { T } from "./timeline.js";
import { makePhone, makeMonitor, makeLaptop, panel } from "./devices.js";
import { bakeContactShadow, softBlob } from "./contact-shadow.js";
import { clamp01, prog, lerp, ease } from "./ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const vl = (a, b, t) => a.clone().lerp(b, t);

// Draws UI state into a canvas-backed texture; redraws only when `key`
// changes so static stretches don't re-upload megapixels every frame.
class Screen {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    this.ctx.save();
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.ctx.restore();
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
  const base = "../build/textures/";
  const names = ["sync-card", "ios-inbox", "ios-server", "ios-random", "ios-you", "ios-discover", "ios-dm", "ios-dm-sent",
    "desktop-chat", "desktop-security", "desktop-dm", "desktop-dm-sent", "laptop-chat"];
  const typingSteps = await fetch(`${base}typing-steps.json`).then((r) => r.json());
  for (let i = 0; i < typingSteps; i++) names.push(`ios-dm-typing-${i}`);
  const img = {};
  await Promise.all(names.map(async (n) => { img[n] = await loadImage(`${base}${n}.png`); }));
  const boxes = {};
  for (const n of ["ios-dm-sent", "desktop-dm-sent"]) boxes[n] = await fetch(`${base}${n}.json`).then((r) => r.json());

  const { scene } = engine;
  const staticTex = (n) => { const t = new THREE.Texture(img[n]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = engine.maxAnisotropy; t.needsUpdate = true; return t; };

  // Every set starts hidden; `pose` shows the one for the current time.
  const sets = {};
  const addSet = (name) => { const g = new THREE.Group(); g.visible = false; scene.add(g); sets[name] = g; return g; };

  // --- Shot A: hero phone -------------------------------------------------
  const heroScreen = new Screen(engine, 1206, 2622);
  const hero = makePhone(heroScreen.texture);
  addSet("hero").add(hero.group);

  // --- Shot B: three phones -----------------------------------------------
  const trio = [makePhone(staticTex("ios-random")), makePhone(staticTex("ios-you")), makePhone(staticTex("ios-inbox"))];
  const trioSet = addSet("trio");
  trio.forEach((p) => trioSet.add(p.group));

  // --- Shot C: macro glide with the Discover sheet ------------------------
  const macroScreen = new Screen(engine, 1206, 2622);
  const macro = makePhone(macroScreen.texture);
  addSet("macro").add(macro.group);

  // --- Shot D: monitor ----------------------------------------------------
  const monScreen = new Screen(engine, 2880, 1800);
  const monitor = makeMonitor(monScreen.texture);
  addSet("monitor").add(monitor.group);

  // --- Shot E: laptop -----------------------------------------------------
  const laptop = makeLaptop(staticTex("laptop-chat"));
  addSet("laptop").add(laptop.group);

  // --- Shot F: phone → desktop live sync ----------------------------------
  const syncPhoneScreen = new Screen(engine, 1206, 2622);
  const syncMonScreen = new Screen(engine, 2880, 1800);
  const syncPhone = makePhone(syncPhoneScreen.texture);
  const syncMon = makeMonitor(syncMonScreen.texture);
  const syncSet = addSet("sync");
  syncSet.add(syncPhone.group, syncMon.group);

  // The message that travels between the devices: it lifts off the phone
  // towards the camera, glides across and docks into the desktop chat.
  const pBox = boxes["ios-dm-sent"].newMessage, pS = boxes["ios-dm-sent"].scale;
  const dBox = boxes["desktop-dm-sent"].newMessage, dS = boxes["desktop-dm-sent"].scale;
  const phoneCM = hero.size.SW / 402; // cm per iOS point
  const monCM = monitor.size.SW / 1440; // cm per desktop CSS px
  const CARD_W = 380 * phoneCM, CARD_H = 84 * phoneCM;
  const card = new THREE.Mesh(panel(CARD_W, CARD_H, 0.01), new THREE.MeshBasicMaterial({
    map: staticTex("sync-card"), toneMapped: false, transparent: true, depthWrite: false,
  }));
  card.renderOrder = 5;
  syncSet.add(card);

  // Baked floor shadows, parented to each device so they travel with it.
  const r = engine.renderer;
  // A tight contact shadow plus a wide, faint ambient one, as under a softbox.
  for (const dev of [monitor, syncMon]) {
    bakeContactShadow(r, dev.group, { floorY: dev.floorY, width: 60, depth: 50, height: 10, blur: 1.4, opacity: 0.7 });
    softBlob(dev.group, { floorY: dev.floorY, width: 95, depth: 46, opacity: 0.22, offsetZ: 2 });
  }
  bakeContactShadow(r, laptop.group, { floorY: 0, width: 50, depth: 44, height: 5, blur: 1.2, opacity: 0.75 });
  softBlob(laptop.group, { floorY: 0, width: 62, depth: 52, opacity: 0.26, offsetZ: -1 });
  // Per-material environment binding, so each material's envMapIntensity is
  // honoured (with only scene.environment, three.js applies one global value).
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.envMap) {
      o.material.envMap = scene.environment;
      o.material.needsUpdate = true;
    }
  });

  const shots = [
    { name: "hero", from: T.shotHero, to: T.shotTrio },
    { name: "trio", from: T.shotTrio, to: T.shotMacro },
    { name: "macro", from: T.shotMacro, to: T.shotMacroEnd },
    { name: "monitor", from: T.shotMonitor, to: T.shotLaptop },
    { name: "laptop", from: T.shotLaptop, to: T.shotSync },
    { name: "sync", from: T.shotSync, to: T.shotSyncEnd },
  ];
  const shotAt = (t) => shots.find((s) => t >= s.from && t < s.to) ?? null;

  // Screen states depend on the frame time only (not the sub-frame sample).
  function prepare(t) {
    const s = shotAt(t);
    if (!s) return;
    if (s.name === "hero") {
      const p = ease.inOutCubic(prog(t, T.heroSwitch, T.heroSwitch + 0.24));
      heroScreen.draw(`hero:${p.toFixed(3)}`, (g, w, h) => {
        g.drawImage(img["ios-inbox"], 0, 0);
        if (p > 0) { g.globalAlpha = p; g.drawImage(img["ios-server"], 0, 0); }
      });
    } else if (s.name === "macro") {
      const p = ease.outQuint(prog(t, T.sheetUp, T.sheetUp + 0.55));
      macroScreen.draw(`macro:${p.toFixed(3)}`, (g, w, h) => {
        g.drawImage(img["ios-server"], 0, 0);
        if (p <= 0) return;
        // iOS sheet: the presenting screen dims, the sheet rises from below.
        g.fillStyle = `rgba(0,0,0,${0.5 * p})`;
        g.fillRect(0, 0, w, h);
        const top = 62 * 3;
        g.drawImage(img["ios-discover"], 0, top, w, h - top, 0, top + (1 - p) * (h - top), w, h - top);
      });
    } else if (s.name === "monitor") {
      const p = prog(t, T.settingsOpen, T.settingsOpen + 0.3);
      const e = ease.outCubic(p);
      monScreen.draw(`mon:${p.toFixed(3)}`, (g, w, h) => {
        g.drawImage(img["desktop-chat"], 0, 0);
        if (p <= 0) return;
        // Settings opens with the app's modal-pop: a quick scale-up and fade.
        const bar = 30 * 2;
        const sc = 0.965 + 0.035 * e;
        g.globalAlpha = Math.min(1, p * 1.6);
        g.translate(w / 2, bar + (h - bar) / 2);
        g.scale(sc, sc);
        g.drawImage(img["desktop-security"], 0, bar, w, h - bar, -w / 2, -(h - bar) / 2, w, h - bar);
      });
    } else if (s.name === "sync") {
      const steps = typingSteps;
      const typed = Math.floor(prog(t, T.typeStart, T.send - 0.1) * steps + 1e-6);
      const sent = prog(t, T.send, T.send + 0.35);
      syncPhoneScreen.draw(`sp:${typed}:${sent.toFixed(3)}`, (g, w, h) => {
        if (sent <= 0) {
          g.drawImage(typed <= 0 ? img["ios-dm"] : img[`ios-dm-typing-${Math.min(steps, typed) - 1}`], 0, 0);
          return;
        }
        // Sent: composer clears, the new row eases up into the list.
        const e = ease.outCubic(sent);
        g.drawImage(img["ios-dm-sent"], 0, 0);
        const b = pBox, sc = pS;
        g.fillStyle = "#050506";
        g.fillRect(0, (b.y - 4) * sc, w, (b.h + 12) * sc);
        g.globalAlpha = e;
        g.drawImage(img["ios-dm-sent"], 0, (b.y - 4) * sc, w, (b.h + 12) * sc, 0, (b.y - 4 + (1 - e) * 16) * sc, w, (b.h + 12) * sc);
      });
      const arrived = prog(t, T.arrive - 0.08, T.arrive + 0.3);
      syncMonScreen.draw(`sm:${arrived.toFixed(3)}`, (g, w, h) => {
        g.drawImage(img["desktop-dm"], 0, 0);
        if (arrived <= 0) return;
        // Bottom-anchored list: history slides up by one row as the new
        // message lands, exactly as the web chat does.
        const e = ease.outCubic(arrived);
        const L = boxes["desktop-dm-sent"].list, b = dBox, sc = dS;
        const shift = b.h + 13;
        g.save();
        g.beginPath(); g.rect(L.x * sc, L.y * sc, L.w * sc, L.h * sc); g.clip();
        g.fillStyle = "#060607"; g.fillRect(L.x * sc, L.y * sc, L.w * sc, L.h * sc);
        g.drawImage(img["desktop-dm"], L.x * sc, L.y * sc, L.w * sc, L.h * sc, L.x * sc, (L.y - shift * e) * sc, L.w * sc, L.h * sc);
        g.globalAlpha = e;
        g.drawImage(img["desktop-dm-sent"], b.x * sc, b.y * sc, b.w * sc, b.h * sc, b.x * sc, (b.y + (1 - e) * shift) * sc, b.w * sc, b.h * sc);
        g.restore();
      });
    }
  }

  // Positions everything for (sub-frame) time t and returns the camera.
  // `s` is the shot at the frame time: motion-blur samples just across a cut
  // must still render the frame's own shot.
  function pose(t, s = shotAt(t)) {
    for (const g of Object.values(sets)) g.visible = false;
    if (!s) return null;
    sets[s.name].visible = true;
    const u = t - s.from;
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (u * f + ph)) * a;

    if (s.name === "hero") {
      const rise = ease.outCubic(prog(t, T.shotHero, T.shotHero + 1.15));
      const turn = ease.outCubic(prog(t, T.shotHero, T.shotHero + 1.35));
      const g = hero.group;
      g.position.set(0, lerp(-30, 0, rise) + bob(0.3, 0, 0.18), 0);
      g.rotation.set(lerp(-0.95, -0.05, turn), lerp(0.8, -0.3, turn) - 0.14 * prog(t, T.shotHero + 1.35, s.to), lerp(0.12, 0, turn));
      // Whip out to the right into the next shot.
      const whip = ease.inCubic(prog(t, s.to - 0.24, s.to));
      const dolly = ease.inOutSine(prog(t, s.from, s.to));
      const target = V(whip * 26, 0.1, 0);
      return { pos: V(whip * 22, lerp(1.6, 0.8, dolly), lerp(42, 36.5, dolly)), target, fov: 30, aperture: 0.16 };
    }

    if (s.name === "trio") {
      const layout = [[-11.4, 0.3, -7, 0.36], [0, 0, 0, -0.03], [11.4, -0.3, -7, -0.36]];
      trio.forEach((p, i) => {
        const [x, y, z, ry] = layout[i];
        p.group.position.set(x, y + bob(0.28, i * 0.3, 0.45), z);
        p.group.rotation.set(-0.05 + bob(0.2, i * 0.2, 0.015), ry + bob(0.17, i * 0.4, 0.03), 0);
      });
      // Arrive mid-whip from the left, settle into a slow truck, then push
      // in on the centre phone to hand over to the macro shot.
      const settle = ease.outCubic(prog(t, s.from, s.from + 0.6));
      const drift = prog(t, s.from, s.to);
      const push = ease.inCubic(prog(t, s.to - 0.3, s.to));
      const tx = lerp(-30, -3, settle) + 6 * drift;
      const target = V(tx * (1 - push), 0.1, -2);
      const pos = V(tx * (1 - push) + 1.5, lerp(2, 0.8, drift), lerp(47, 22, push));
      return { pos, target, fov: 34, aperture: 0.38 };
    }

    if (s.name === "macro") {
      const g = macro.group;
      const drop = ease.inCubic(prog(t, s.to - 0.32, s.to));
      g.position.set(0, -drop * 36, 0);
      g.rotation.set(-0.1 - drop * 0.5, -0.5 + 0.12 * prog(t, s.from, s.to), 0.02 + drop * 0.2);
      const glide = ease.inOutSine(prog(t, s.from, s.to));
      const arrive = ease.outCubic(prog(t, s.from, s.from + 0.35));
      const pos = V(lerp(9, 2.5, glide), lerp(-5, 3.5, glide), lerp(lerp(18, 26, arrive), 23, glide));
      const target = V(lerp(-1.2, 0, glide), lerp(-1.4, 1.2, glide), 0);
      return { pos, target, fov: 27, aperture: 0.35 };
    }

    if (s.name === "monitor") {
      const inP = ease.outExpo(prog(t, s.from - 0.1, s.from + 0.85));
      const g = monitor.group;
      g.position.set(lerp(110, 0, inP), 0, 0);
      g.rotation.set(0, lerp(-0.42, -0.22, inP) + 0.1 * ease.inOutSine(prog(t, s.from + 0.8, s.to)), 0);
      const orbit = ease.inOutSine(prog(t, s.from, s.to));
      const push = ease.inCubic(prog(t, s.to - 0.22, s.to));
      const pos = V(lerp(-8, 6, orbit), lerp(7, 4, orbit), lerp(128, 118, orbit) - push * 60);
      return { pos, target: V(0, 0.5, 0), fov: 30, aperture: 0.45 };
    }

    if (s.name === "laptop") {
      const open = ease.outCubic(prog(t, s.from + 0.05, s.from + 1.0));
      laptop.lid.rotation.x = -((lerp(62, 110, open) - 90) * Math.PI) / 180;
      laptop.group.rotation.set(0, lerp(0.62, 0.42, ease.inOutSine(prog(t, s.from, s.to))), 0);
      const pull = ease.outCubic(prog(t, s.from, s.from + 0.45));
      const whip = ease.inCubic(prog(t, s.to - 0.22, s.to));
      const glide = ease.inOutSine(prog(t, s.from, s.to));
      const pos = V(lerp(-30, -24, glide) + whip * 40, lerp(24, 17, glide), lerp(lerp(30, 58, pull), 50, glide));
      return { pos, target: V(whip * 44, 9, -2), fov: 32, aperture: 0.55 };
    }

    if (s.name === "sync") {
      syncMon.group.position.set(24, -5, -52);
      syncMon.group.rotation.set(0, -0.32, 0);
      const settle = ease.outCubic(prog(t, s.from, s.from + 0.5));
      syncPhone.group.position.set(-9, bob(0.25, 0, 0.2), 14);
      syncPhone.group.rotation.set(-0.04, lerp(0.5, 0.3, settle), 0);

      // Card flight.
      syncPhone.group.updateMatrixWorld(true);
      syncMon.group.updateMatrixWorld(true);
      const f = prog(t, T.send + 0.1, T.arrive);
      const pLocal = V((pBox.x + pBox.w / 2) * phoneCM - hero.size.SW / 2, hero.size.SH / 2 - (pBox.y + pBox.h / 2) * phoneCM, hero.size.D / 2 + 0.08);
      // Dock over the desktop row's avatar and text, not its full width.
      const landW = 340 * monCM;
      const mLocal = V((dBox.x + 16 + 170) * monCM - monitor.size.SW / 2, monitor.size.SH / 2 - (dBox.y + dBox.h / 2) * monCM, monitor.size.D / 2 + 0.12);
      const P0 = pLocal.applyMatrix4(syncPhone.group.matrixWorld);
      const P3 = mLocal.applyMatrix4(syncMon.group.matrixWorld);
      const qP = new THREE.Quaternion().setFromEuler(syncPhone.group.rotation);
      const qM = new THREE.Quaternion().setFromEuler(syncMon.group.rotation);
      const nP = V(0, 0, 1).applyQuaternion(qP), nM = V(0, 0, 1).applyQuaternion(qM);
      const P1 = P0.clone().addScaledVector(nP, 16).add(V(2, 4, 6));
      const P2 = P3.clone().addScaledVector(nM, 30).add(V(-4, 7, 0));
      const fe = ease.inOutCubic(f);
      const bez = (a, b, c, d, x) => {
        const y = 1 - x;
        return a.clone().multiplyScalar(y * y * y).addScaledVector(b, 3 * y * y * x).addScaledVector(c, 3 * y * x * x).addScaledVector(d, x * x * x);
      };
      card.position.copy(bez(P0, P1, P2, P3, fe));
      // Faces the viewer mid-flight, lies flat on each screen at the ends.
      const camPos = V(lerp(-1, 4, fe), 3.5, 60);
      const qC = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, card.position, V(0, 1, 0)));
      const a1 = ease.inOutSine(prog(f, 0, 0.4)), a2 = ease.inOutSine(prog(f, 0.55, 1));
      card.quaternion.slerpQuaternions(qP, qC, a1).slerp(qM, a2);
      const sc = f < 0.4 ? lerp(1, 1.45, ease.outCubic(f / 0.4)) : lerp(1.45, landW / CARD_W, ease.inOutCubic((f - 0.4) / 0.6));
      card.scale.setScalar(sc);
      const flying = t >= T.send + 0.1 && t < T.arrive + 0.1;
      card.visible = flying;
      card.material.opacity = smooth(f / 0.08) * (1 - prog(t, T.arrive - 0.1, T.arrive + 0.08));

      // Camera: favour the phone while typing, then rack focus and pan to the
      // desktop as the message lands; crane up and out at the end.
      const pan = ease.inOutCubic(prog(t, T.send + 0.1, T.arrive + 0.1));
      const out = ease.inCubic(prog(t, s.to - 0.3, s.to));
      const phoneC = V(-9, 0, 14), monC = V(24, -5, -52);
      const target = vl(V(-3, 0, 2), V(11, -2, -24), pan).add(V(0, out * 36, 0));
      const pos = V(lerp(-1, 4, pan), lerp(3, 4, pan) + out * 28, lerp(58, 64, pan));
      const focus = lerp(pos.distanceTo(phoneC), pos.distanceTo(monC), ease.inOutCubic(prog(t, T.send + 0.25, T.arrive)));
      return { pos, target, fov: 32, aperture: 0.14, focus };
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
      // More samples where motion is fast (whips) so motion blur stays smooth.
      const s = shotAt(t);
      if (!s) return 0;
      const nearCut = Math.min(t - s.from, s.to - t);
      const cardFlight = s.name === "sync" && t > T.send && t < T.arrive + 0.1;
      return nearCut < 0.35 || cardFlight ? 14 : 8;
    },
  };
}
