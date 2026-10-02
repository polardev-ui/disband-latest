// Procedural device models for the product shots: a phone, a 16:10 desktop
// display on a bent-plate stand, and a laptop. Units are centimetres. Each
// factory returns { group, screen } where `screen` is the mesh whose map is
// the UI texture, so shots can swap or animate what is showing.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Flat shape with UVs normalised to its bounding box, so a UI texture maps
// edge to edge regardless of the corner radius.
export function panel(w, h, r, segments = 32) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), segments);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}

function slab(w, h, d, r, bevel, curveSegments = 40) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, h - bevel * 2, Math.max(0.01, r - bevel)), {
    depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 8, curveSegments,
  });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

export const MATERIALS = {
  graphite: () => new THREE.MeshStandardMaterial({ color: 0x3a3b3f, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0xd9dadd, metalness: 1, roughness: 0.34, envMapIntensity: 1.0 }),
  blackGlass: () => new THREE.MeshStandardMaterial({ color: 0x030304, metalness: 0, roughness: 0.05, envMapIntensity: 0.9 }),
  backGlass: () => new THREE.MeshStandardMaterial({ color: 0x2a2b2f, metalness: 0.15, roughness: 0.42, envMapIntensity: 0.9 }),
  lens: () => new THREE.MeshStandardMaterial({ color: 0x050507, metalness: 0.2, roughness: 0.05, envMapIntensity: 1.2 }),
};

// Emissive UI plus a separate additive layer for the cover-glass reflection,
// so reflections can sweep over the screen without tinting the UI itself.
function screenLayers(w, h, r, texture) {
  const screen = new THREE.Mesh(panel(w, h, r), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const glare = new THREE.Mesh(panel(w, h, r), new THREE.MeshStandardMaterial({
    color: 0x000000, metalness: 0, roughness: 0.04, envMapIntensity: 0.09,
    // Additive on colour only: alpha must stay 1 so the frame still
    // composites correctly over the white page.
    transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  return { screen, glare };
}

export function makePhone(texture, { finish = "graphite" } = {}) {
  const W = 7.1, H = 15.01, D = 0.83, R = 1.12;
  const SW = 6.74, SH = SW * (2622 / 1206), SR = 0.93;
  const group = new THREE.Group();
  const frame = MATERIALS[finish]();

  const body = new THREE.Mesh(slab(W, H, D, R, 0.16, 56), frame);
  body.castShadow = true;
  group.add(body);

  const front = new THREE.Mesh(panel(W - 0.12, H - 0.12, R - 0.06, 48), MATERIALS.blackGlass());
  front.position.z = D / 2 + 0.002;
  group.add(front);

  const { screen, glare } = screenLayers(SW, SH, SR, texture);
  screen.position.z = D / 2 + 0.012;
  glare.position.z = D / 2 + 0.02;
  glare.renderOrder = 2;
  group.add(screen, glare);

  const back = new THREE.Mesh(panel(W - 0.12, H - 0.12, R - 0.06, 48), MATERIALS.backGlass());
  back.position.z = -D / 2 - 0.002;
  back.rotation.y = Math.PI;
  group.add(back);

  // Camera module on the back: plateau, three lenses, flash.
  const plateau = new THREE.Mesh(new RoundedBoxGeometry(3.3, 3.5, 0.18, 4, 0.5), MATERIALS.backGlass());
  plateau.position.set(W / 2 - 2.0, H / 2 - 2.1, -D / 2 - 0.09);
  group.add(plateau);
  for (const [x, y] of [[-0.75, 0.8], [-0.75, -0.8], [0.8, 0]]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 40), frame);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(plateau.position.x + x, plateau.position.y + y, -D / 2 - 0.25);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), MATERIALS.lens());
    glass.rotation.y = Math.PI;
    glass.position.set(ring.position.x, ring.position.y, -D / 2 - 0.362);
    group.add(ring, glass);
  }

  // Side buttons.
  const button = (len, x, y) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.12, len, 0.3, 3, 0.05), frame);
    b.position.set(x, y, 0);
    group.add(b);
  };
  button(0.6, -W / 2 - 0.03, 4.2);
  button(1.05, -W / 2 - 0.03, 2.85);
  button(1.05, -W / 2 - 0.03, 1.55);
  button(1.7, W / 2 + 0.03, 2.4);
  button(1.1, W / 2 + 0.02, -1.9);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  screen.castShadow = glare.castShadow = false;
  return { group, screen, glare, size: { W, H, D, SW, SH } };
}

export function makeMonitor(texture, { finish = "silver" } = {}) {
  const SW = 57.6, SH = 36.0; // 16:10, matches the 1440×900 desktop capture
  const B = 1.25, W = SW + B * 2, H = SH + B * 2, D = 1.5;
  const group = new THREE.Group();
  const metal = MATERIALS[finish]();

  const body = new THREE.Mesh(slab(W, H, D, 0.7, 0.28), metal);
  group.add(body);
  const front = new THREE.Mesh(panel(W - 0.2, H - 0.2, 0.6), MATERIALS.blackGlass());
  front.position.z = D / 2 + 0.002;
  group.add(front);
  const { screen, glare } = screenLayers(SW, SH, 0.08, texture);
  screen.position.z = D / 2 + 0.03;
  glare.position.z = D / 2 + 0.05;
  glare.renderOrder = 2;
  group.add(screen, glare);

  // Bent-plate stand: an upright that leans back from the display, bends,
  // and runs forward as the foot. Built from its side profile.
  const floorY = -H / 2 - 11.5;
  const pts = [];
  const top = new THREE.Vector2(-D / 2 - 0.6, -2);       // (z, y) behind the display
  const bend = new THREE.Vector2(-9.5, floorY + 3.2);
  for (let i = 0; i <= 20; i++) pts.push(top.clone().lerp(bend, i / 20));
  const bendR = 3.2, c = new THREE.Vector2(bend.x + bendR * 0.95, floorY + bendR);
  const a0 = Math.atan2(bend.y - c.y, bend.x - c.x);
  for (let i = 1; i <= 16; i++) {
    const a = a0 + (i / 16) * (-Math.PI / 2 - a0);
    pts.push(new THREE.Vector2(c.x + Math.cos(a) * bendR, c.y + Math.sin(a) * bendR));
  }
  for (let i = 1; i <= 10; i++) pts.push(new THREE.Vector2(c.x + (i / 10) * 14, floorY));
  const t = 0.9, outer = [], inner = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const dir = q.clone().sub(o).normalize();
    const n = new THREE.Vector2(-dir.y, dir.x);
    outer.push(p.clone().addScaledVector(n, t / 2));
    inner.push(p.clone().addScaledVector(n, -t / 2));
  }
  const profile = new THREE.Shape([...outer, ...inner.reverse()]);
  const standGeo = new THREE.ExtrudeGeometry(profile, { depth: 16, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 4, curveSegments: 24 });
  standGeo.translate(0, 0, -8);
  const stand = new THREE.Mesh(standGeo, metal);
  // Profile x is world z, profile y is world y, extrusion is world x.
  stand.rotation.y = -Math.PI / 2;
  group.add(stand);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  screen.castShadow = glare.castShadow = false;
  return { group, screen, glare, floorY, size: { W, H, D, SW, SH } };
}

function keyboardTexture() {
  const c = document.createElement("canvas");
  c.width = 2048; c.height = 1400;
  const g = c.getContext("2d");
  g.fillStyle = "#c9cacd"; g.fillRect(0, 0, c.width, c.height);
  // Keyboard well
  const kx = 150, ky = 70, kw = 1748, kh = 690;
  g.fillStyle = "#0b0b0d";
  g.beginPath(); g.roundRect(kx - 14, ky - 14, kw + 28, kh + 28, 22); g.fill();
  const rows = [
    { keys: 14, h: 0.6 }, { keys: 14, h: 1 }, { keys: 14, h: 1 }, { keys: 13, h: 1 }, { keys: 12, h: 1 }, { keys: 10, h: 1 },
  ];
  const unit = kh / 5.75, gap = 10;
  let y = ky;
  rows.forEach((row, ri) => {
    const rh = unit * row.h - gap;
    const widths = new Array(row.keys).fill(1);
    if (ri === 1) widths[13] = 1.5;
    if (ri === 2) widths[0] = 1.5;
    if (ri === 3) { widths[0] = 1.8; widths[12] = 1.8; }
    if (ri === 4) { widths[0] = 2.3; widths[11] = 2.3; }
    if (ri === 5) { widths.splice(0, 10, 1, 1, 1, 1.25, 5.2, 1.25, 1, 1, 1, 1); }
    const total = widths.reduce((a, b) => a + b, 0);
    let x = kx;
    widths.forEach((w) => {
      const kwid = (kw * w) / total - gap;
      g.fillStyle = "#26272b";
      g.beginPath(); g.roundRect(x, y, kwid, rh, 9); g.fill();
      g.fillStyle = "rgba(255,255,255,.07)";
      g.beginPath(); g.roundRect(x + 3, y + 2, kwid - 6, rh * 0.5, 7); g.fill();
      x += kwid + gap;
    });
    y += rh + gap;
  });
  // Trackpad
  g.fillStyle = "#bfc0c3";
  g.beginPath(); g.roundRect(624, 860, 800, 500, 26); g.fill();
  g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 3; g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeLaptop(texture, { finish = "silver", openAngle = 108 } = {}) {
  const W = 31.26, Dp = 22.1, T = 1.1, LT = 0.55;
  const SW = 28.6, SH = SW / (1470 / 956);
  const group = new THREE.Group();
  const metal = MATERIALS[finish]();

  const base = new THREE.Mesh(new RoundedBoxGeometry(W, T, Dp, 6, 0.45), metal);
  base.position.y = T / 2;
  group.add(base);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.8, Dp - 0.8), new THREE.MeshPhysicalMaterial({
    map: keyboardTexture(), metalness: 0.55, roughness: 0.45, envMapIntensity: 0.8,
  }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = T + 0.002;
  group.add(deck);

  const lid = new THREE.Group();
  lid.position.set(0, T, -Dp / 2 + 0.25);
  const lidBody = new THREE.Mesh(new RoundedBoxGeometry(W, Dp - 0.5, LT, 6, 0.26), metal);
  lidBody.position.set(0, (Dp - 0.5) / 2, -LT / 2);
  lid.add(lidBody);
  const bezel = new THREE.Mesh(panel(W - 0.3, Dp - 0.8, 0.9), MATERIALS.blackGlass());
  bezel.position.set(0, (Dp - 0.5) / 2, 0.003);
  lid.add(bezel);
  const { screen, glare } = screenLayers(SW, SH, 0.35, texture);
  screen.position.set(0, (Dp - 0.5) / 2 + 0.25, 0.02);
  glare.position.set(0, (Dp - 0.5) / 2 + 0.25, 0.035);
  glare.renderOrder = 2;
  lid.add(screen, glare);
  lid.rotation.x = -(openAngle - 90) * (Math.PI / 180);
  group.add(lid);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  screen.castShadow = glare.castShadow = false;
  return { group, screen, glare, lid, size: { W, Dp, T, SW, SH } };
}

// A generic modern Android handset: flat 20:9 slab, tighter corners than the
// iPhone model, power and volume keys on the right, and a vertical pill camera
// module. The punch-hole camera is part of the screen capture, as on device.
export function makeAndroidPhone(texture, { finish = "graphite", aspect = 2402 / 1082 } = {}) {
  const SW = 6.86, SH = SW * aspect, SR = 0.78;
  const W = SW + 0.34, H = SH + 0.36, D = 0.86, R = 0.98;
  const group = new THREE.Group();
  const frame = MATERIALS[finish]();
  frame.roughness = 0.42; // satin rather than polished

  group.add(new THREE.Mesh(slab(W, H, D, R, 0.2, 56), frame));
  const front = new THREE.Mesh(panel(W - 0.1, H - 0.1, R - 0.05, 48), MATERIALS.blackGlass());
  front.position.z = D / 2 + 0.002;
  group.add(front);
  const { screen, glare } = screenLayers(SW, SH, SR, texture);
  screen.position.z = D / 2 + 0.012;
  glare.position.z = D / 2 + 0.02;
  glare.renderOrder = 2;
  group.add(screen, glare);
  const back = new THREE.Mesh(panel(W - 0.1, H - 0.1, R - 0.05, 48), MATERIALS.backGlass());
  back.position.z = -D / 2 - 0.002;
  back.rotation.y = Math.PI;
  group.add(back);

  const pill = new THREE.Mesh(new RoundedBoxGeometry(1.7, 3.6, 0.16, 6, 0.8), MATERIALS.backGlass());
  pill.position.set(W / 2 - 1.55, H / 2 - 2.5, -D / 2 - 0.08);
  group.add(pill);
  for (const y of [0.85, -0.85]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 40), frame);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pill.position.x, pill.position.y + y, -D / 2 - 0.2);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.47, 40), MATERIALS.lens());
    glass.rotation.y = Math.PI;
    glass.position.set(ring.position.x, ring.position.y, -D / 2 - 0.292);
    group.add(ring, glass);
  }

  const button = (len, y) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.12, len, 0.3, 3, 0.05), frame);
    b.position.set(W / 2 + 0.03, y, 0);
    group.add(b);
  };
  button(1.25, 3.6);
  button(2.4, 1.2);
  return { group, screen, glare, size: { W, H, D, SW, SH } };
}
