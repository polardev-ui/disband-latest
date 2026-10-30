// The 3D for the Anonymous Accounts launch spot. Pure functions of time.
// Everything is built from one primitive, a glass card: a rounded glass slab
// with a canvas-drawn face, a neon rim and a soft glow. Burnable things (the
// ghost, the walker, the profile and its messages) use a dissolve shader whose
// noise the ember particles share, so embers leave exactly where the edge burns.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { T, DEMO } from "./timeline.js";
import { makeLaptop, roundedRect } from "../src/devices.js";
import { prog, lerp, ease, clamp01 } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const PPU = 120;            // face canvas pixels per world unit
const YC = 760;             // the picture sits above the captions: centre at y = 760 px

export const C = {
  bg: "#0d1117", violet: "#7c5cff", indigo: "#5865f2", text: "#f2f3f5", muted: "#949ba4",
  green: "#23a55a", red: "#f23f43", amber: "#f59e0b", gold: "#e3b341",
};
const MONO = "'JetBrains Mono', monospace";
const SANS = "Inter, sans-serif";

/** Camera target y that puts world y = 0 at screen y = YC for a camera `d` away. */
const aimY = (d) => (YC - 960) / (1920 / (2 * d * Math.tan(Math.PI / 12)));

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- Environment: black, violet rim strips, a little white ------------------
function violetStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const emit = (w, h, color, k) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  place(emit(3, 46, C.violet, 9), -34, 6, -20);
  place(emit(2.4, 42, C.indigo, 8), 36, 4, -24);
  place(emit(1.4, 34, "#ffffff", 5), -24, 6, 38);
  place(emit(34, 6, "#ffffff", 0.6), 0, 40, 10);
  place(emit(20, 20, "#2a2350", 0.8), 0, -30, 20);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return env;
}

// ---- Shared noise (sampled identically by the shader and by the embers) -----
const NOISE = 128;
function makeNoise(seed) {
  const r = mulberry32(seed);
  const grid = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = r(); return g; };
  const octave = (g, n, x, y) => {
    const fx = x * n, fy = y * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), sx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx), sy);
  };
  const g1 = grid(8), g2 = grid(16), g3 = grid(32);
  const data = new Uint8Array(NOISE * NOISE * 4);
  const vals = new Float32Array(NOISE * NOISE);
  for (let y = 0; y < NOISE; y++) {
    for (let x = 0; x < NOISE; x++) {
      const u = x / NOISE, v = y / NOISE;
      const n = 0.55 * octave(g1, 8, u, v) + 0.3 * octave(g2, 16, u, v) + 0.15 * octave(g3, 32, u, v);
      const q = Math.round(clamp01(n) * 255);
      vals[y * NOISE + x] = q / 255;
      data.set([q, q, q, 255], (y * NOISE + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, NOISE, NOISE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // Bilinear sample with wrap, matching the GPU's sampling of `tex`.
  const sample = (u, v) => {
    const fx = (((u % 1) + 1) % 1) * NOISE - 0.5, fy = (((v % 1) + 1) % 1) * NOISE - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i, j) => vals[((j % NOISE + NOISE) % NOISE) * NOISE + ((i % NOISE + NOISE) % NOISE)];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
  return { tex, sample };
}

function dissolveMaterial(map, noise, edge) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map }, noiseTex: { value: noise.tex }, burn: { value: 0 }, ash: { value: 0 },
      opacity: { value: 1 }, edgeColor: { value: new THREE.Color(edge) }, scale: { value: 1.6 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map, noiseTex; uniform float burn, ash, opacity, scale; uniform vec3 edgeColor; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        float n = texture2D(noiseTex, vUv * scale).r;
        if (burn > 0.0 && n < burn) discard;
        float edge = burn > 0.0 ? 1.0 - smoothstep(burn, burn + 0.08, n) : 0.0;
        float g = dot(c.rgb, vec3(0.3, 0.59, 0.11));
        vec3 col = mix(c.rgb, vec3(g * 0.5 + 0.32), ash);
        col = mix(col, edgeColor * 3.0, edge);
        gl_FragColor = vec4(col, max(c.a, edge * 0.9) * opacity);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// ---- Canvas faces -------------------------------------------------------------
class Face {
  constructor(engine, w, h) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(w * PPU);
    this.canvas.height = Math.round(h * PPU);
    this.ctx = this.canvas.getContext("2d");
    this.texture = engine.canvasTexture(this.canvas);
    this.key = null;
  }
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.save();
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fn(g, this.canvas.width, this.canvas.height);
    g.restore();
    this.texture.needsUpdate = true;
  }
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ring = (w, h, r, t) => {
  const s = roundedRect(w, h, r);
  s.holes.push(roundedRect(w - t * 2, h - t * 2, Math.max(0.01, r - t)));
  return new THREE.ShapeGeometry(s, 24);
};

/**
 * A glass card: slab, face (canvas), rim and glow. `back` adds a second face
 * on the reverse for cards that turn over.
 */
function glassCard(engine, env, glowTex, w, h, { r = 0.45, depth = 0.3, rim = C.violet, glow = C.violet, back = false, tint = "#161b2a", opacity = 0.84 } = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: tint, metalness: 0.15, roughness: 0.16, envMap: env, envMapIntensity: 1.5, transparent: true, opacity });
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, depth, 4, Math.min(r, depth / 2)), bodyMat);
  // RoundedBoxGeometry rounds every edge by the same radius; a rounded-rect
  // extrusion gives the larger corner radius the UI cards use.
  body.geometry.dispose();
  const ex = new THREE.ExtrudeGeometry(roundedRect(w - 0.1, h - 0.1, r - 0.05), { depth: depth - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 20 });
  ex.translate(0, 0, -(depth - 0.1) / 2);
  body.geometry = ex;
  group.add(body);
  const face = new Face(engine, w, h);
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, toneMapped: false, depthWrite: false }));
  faceMesh.position.z = depth / 2 + 0.01;
  faceMesh.renderOrder = 3;
  group.add(faceMesh);
  let backFace = null;
  if (back) {
    backFace = new Face(engine, w, h);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: backFace.texture, transparent: true, toneMapped: false, depthWrite: false }));
    bm.position.z = -depth / 2 - 0.01;
    bm.rotation.y = Math.PI;
    bm.renderOrder = 3;
    group.add(bm);
  }
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(rim).multiplyScalar(1.8), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const rimMesh = new THREE.Mesh(ring(w + 0.06, h + 0.06, r + 0.03, 0.05), rimMat);
  rimMesh.position.z = depth / 2 + 0.015;
  rimMesh.renderOrder = 4;
  group.add(rimMesh);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(glow), transparent: true, opacity: 0.32, depthWrite: false });
  const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.1, h * 2.1), glowMat);
  glowMesh.position.z = -depth / 2 - 0.3;
  glowMesh.renderOrder = 1;
  group.add(glowMesh);
  return {
    group, face, back: backFace, w, h,
    setRim(color, k = 1.8, op = 0.9) { rimMat.color.set(color).multiplyScalar(k); rimMat.opacity = op; },
    setGlow(color, op) { glowMat.color.set(color); glowMat.opacity = op; },
    setOpacity(a) { bodyMat.opacity = opacity * a; faceMesh.material.opacity = a; rimMat.opacity = 0.9 * a; glowMat.opacity = 0.32 * a; if (back) group.children[2].material.opacity = a; },
  };
}

// ---- Embers ---------------------------------------------------------------------
class Embers {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
        void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (900.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vC;
        void main() { vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (1.0 + a), a * vA); }`,
      transparent: true, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.n = 0;
  }
  begin() { this.n = 0; }
  push(p, c, s, a) {
    if (this.n >= this.max || a <= 0.002) return;
    const i = this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.size[i] = s; this.alpha[i] = a;
  }
  end() {
    for (let i = this.n; i < this.max; i++) this.alpha[i] = 0;
    for (const k of ["position", "color", "size", "alpha"]) this.geo.attributes[k].needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(1, this.n));
  }
}

/**
 * Embers for a dissolving plane: particle k sits at uv_k and leaves when the
 * burn front passes it (burn(t) crosses the noise at uv_k), then rises.
 */
function burnEmitter(noise, count, seed, w, h, burnAt, { life = 0.9, rise = 3.5, spread = 1.2, size = 0.12, colors = [C.amber, C.red] } = {}) {
  const r = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const u = r(), v = r();
    const th = noise.sample(u * 1.6, v * 1.6);
    parts.push({ u, v, th, born: burnAt(th), vx: (r() - 0.5) * spread, vy: rise * (0.6 + 0.8 * r()), vz: (r() - 0.2) * spread, life: life * (0.6 + 0.8 * r()), s: size * (0.6 + 0.9 * r()), c: r() });
  }
  const ca = new THREE.Color(colors[0]), cb = new THREE.Color(colors[1]);
  return (embers, t, mesh) => {
    mesh.updateMatrixWorld(true);
    for (const p of parts) {
      const age = t - p.born;
      if (!(age > 0 && age < p.life)) continue;
      const k = age / p.life;
      const local = V((p.u - 0.5) * w, (p.v - 0.5) * h, 0).applyMatrix4(mesh.matrixWorld);
      local.x += p.vx * age; local.y += p.vy * Math.pow(age, 1.2); local.z += p.vz * age;
      embers.push(local, ca.clone().lerp(cb, k * 0.8 + p.c * 0.2), p.s * (1 - 0.5 * k), Math.pow(1 - k, 1.4));
    }
  };
}

/** Inverse of a monotone burn curve: the time burn(t) reaches `th`. */
function invert(fn, t0, t1, th) {
  if (fn(t1) < th) return Infinity;
  let a = t0, b = t1;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (fn(m) < th) a = m; else b = m; }
  return b;
}

// ---- Drawing helpers for faces ----------------------------------------------------
function rr(g, x, y, w, h, r, fill, stroke, lw = 3) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function sheen(g, w, h, r = 54) {
  const s = g.createLinearGradient(0, 0, 0, h);
  s.addColorStop(0, "rgba(255,255,255,0.10)");
  s.addColorStop(0.35, "rgba(255,255,255,0.02)");
  s.addColorStop(1, "rgba(255,255,255,0)");
  rr(g, 2, 2, w - 4, h - 4, r, s, "rgba(255,255,255,0.10)", 2);
}
function brandGrad(g, x0, x1) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, C.indigo); gr.addColorStop(1, C.violet);
  return gr;
}
function text(g, s, x, y, font, color, align = "left", glow = 0) {
  g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = "alphabetic";
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.fillText(s, x, y);
  g.shadowBlur = 0;
}
function check(g, cx, cy, r, color) {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = r * 0.22; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(cx - r * 0.45, cy + r * 0.02); g.lineTo(cx - r * 0.1, cy + r * 0.36); g.lineTo(cx + r * 0.48, cy - r * 0.32); g.stroke();
}
function cross(g, cx, cy, r, color) {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = color; g.lineWidth = r * 0.14; g.stroke();
  g.lineWidth = r * 0.2; g.lineCap = "round";
  g.beginPath(); g.moveTo(cx - r * 0.38, cy - r * 0.38); g.lineTo(cx + r * 0.38, cy + r * 0.38); g.moveTo(cx + r * 0.38, cy - r * 0.38); g.lineTo(cx - r * 0.38, cy + r * 0.38); g.stroke();
}
function lockGlyph(g, cx, cy, s, color) {
  g.strokeStyle = color; g.lineWidth = s * 0.14; g.lineCap = "round";
  g.beginPath(); g.arc(cx, cy - s * 0.18, s * 0.32, Math.PI, 0); g.lineTo(cx + s * 0.32, cy + s * 0.02); g.moveTo(cx - s * 0.32, cy - s * 0.18); g.lineTo(cx - s * 0.32, cy + s * 0.02); g.stroke();
  rr(g, cx - s * 0.5, cy, s, s * 0.72, s * 0.14, color);
}
function clockGlyph(g, cx, cy, r, color) {
  g.strokeStyle = color; g.lineWidth = r * 0.12; g.lineCap = "round";
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - r * 0.6); g.moveTo(cx, cy); g.lineTo(cx + r * 0.42, cy + r * 0.2); g.stroke();
}

async function makeMark3D(height, env) {
  const svg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p));
  let g = new THREE.ExtrudeGeometry(shapes, { depth: 220, bevelEnabled: true, bevelThickness: 26, bevelSize: 16, bevelSegments: 5, curveSegments: 24 });
  if (g.index) g = g.toNonIndexed();
  g.center();
  const s = height / 2142;
  g.scale(s, -s, s);
  for (const name of Object.keys(g.attributes)) {          // undo the mirror's winding flip
    const a = g.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = a.array[(i + 1) * n + k]; a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k]; a.array[(i + 2) * n + k] = t; }
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#1b2033", metalness: 0.55, roughness: 0.12, envMap: env, envMapIntensity: 2.2 }));
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`failed to load ${src}`));
  img.src = src;
});

// ================================================================================
export async function createShots(engine) {
  const { scene, renderer } = engine;
  const env = violetStudio(renderer);
  const glowTex = glowTexture();
  const noise = makeNoise(7);
  const embers = new Embers(1400);
  scene.add(embers.points);
  const sets = {};
  const addSet = (name, ...objs) => { const g = new THREE.Group(); g.name = name; g.visible = false; g.add(...objs); scene.add(g); sets[name] = g; return g; };
  const card = (w, h, o) => glassCard(engine, env, glowTex, w, h, o);

  // ---- hook: a ghost that dissolves into violet embers -------------------------
  const ghostFace = new Face(engine, 4, 4.6);
  ghostFace.draw("ghost", (g, w, h) => {
    g.shadowColor = C.violet; g.shadowBlur = 60;
    g.fillStyle = "rgba(196,184,255,0.95)";
    const x0 = w * 0.18, x1 = w * 0.82, top = h * 0.12, bot = h * 0.86, R = (x1 - x0) / 2;
    g.beginPath();
    g.moveTo(x0, top + R); g.arc((x0 + x1) / 2, top + R, R, Math.PI, 0); g.lineTo(x1, bot);
    const waves = 4, ww = (x1 - x0) / waves;
    for (let i = 0; i < waves; i++) {
      const xa = x1 - i * ww;
      g.quadraticCurveTo(xa - ww * 0.25, bot - ww * 0.55, xa - ww * 0.5, bot - ww * 0.1);
      g.quadraticCurveTo(xa - ww * 0.75, bot + ww * 0.35, xa - ww, bot);
    }
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = C.bg;
    for (const ex of [0.4, 0.6]) { g.beginPath(); g.ellipse(w * ex, h * 0.42, w * 0.055, h * 0.07, 0, 0, Math.PI * 2); g.fill(); }
  });
  const ghostMat = dissolveMaterial(ghostFace.texture, noise, C.violet);
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.6), ghostMat);
  const ghostBurn = (t) => 1.05 * ease.inOutSine(prog(t, T.ghostFade[0], T.ghostFade[1]));
  const ghostEmbers = burnEmitter(noise, 260, 11, 4, 4.6, (th) => invert(ghostBurn, T.ghostFade[0], T.ghostFade[1], th), { life: 1.1, rise: 1.6, spread: 2.4, size: 0.1, colors: ["#c4b8ff", C.indigo] });
  addSet("hook", ghost);

  // ---- number / email: one card, two faces -------------------------------------
  const numCard = card(9.6, 6.2, { back: true, r: 0.55 });
  numCard.group.name = "number";
  addSet("number", numCard.group);
  const digits = DEMO.number;
  function drawNumber(t) {
    const typed = Math.max(0, Math.min(16, Math.floor((t - T.typeStart) / T.typeStep) + 1));
    const flash = t >= T.newPill ? Math.exp(-(t - T.newPill) / 0.25) : 0;
    const showPill = t >= T.newPill - 0.02;
    numCard.face.draw(`n${typed}|${showPill ? Math.round(flash * 20) : -1}|${Math.floor(t * 4) % 2}`, (g, w, h) => {
      sheen(g, w, h);
      text(g, "ANONYMOUS ACCOUNT", 70, 110, `700 34px ${SANS}`, C.muted);
      text(g, "16-DIGIT ACCOUNT NUMBER", 70, 236, `600 30px ${SANS}`, "#b5b9ff");
      const groups = (digits.slice(0, typed).match(/.{1,4}/g) || []);
      const shown = groups.join(" ");
      g.font = `700 92px ${MONO}`;
      const cw = g.measureText("0").width;
      const x0 = (w - cw * 19) / 2;
      text(g, shown, x0, 420, `700 92px ${MONO}`, "#ffffff", "left", 26);
      if (typed < 16 && Math.floor(t * 4) % 2 === 0) rr(g, x0 + cw * (shown.length + (typed > 0 && typed % 4 === 0 ? 1 : 0)), 340, cw * 0.62, 96, 6, C.violet);
      // Underline that sweeps as the digits arrive.
      const ux = x0 + cw * 19 * (typed / 16);
      const lg = g.createLinearGradient(x0, 0, ux, 0);
      lg.addColorStop(0, "rgba(124,92,255,0)"); lg.addColorStop(1, C.violet);
      rr(g, x0, 466, Math.max(0, ux - x0), 8, 4, lg);
      text(g, "Write it down. It's the only way back in.", 70, h - 90, `500 30px ${SANS}`, C.muted);
      if (showPill) {
        const s = 1 + 0.25 * flash;
        g.save(); g.translate(w - 150, 92); g.scale(s, s);
        g.shadowColor = C.violet; g.shadowBlur = 20 + 40 * flash;
        rr(g, -78, -36, 156, 72, 36, brandGrad(g, -78, 78));
        g.shadowBlur = 0;
        text(g, "NEW", 0, 13, `800 34px ${SANS}`, "#fff", "center");
        g.restore();
      }
    });
  }
  const SCR = "abcdefghijklmnopqrstuvwxyz0123456789";
  function drawEmail(t) {
    const step = Math.floor(t * 30);
    const resolved = Math.floor(DEMO.email.length * smooth(prog(t, T.scramble + 0.1, T.resolve)));
    const scrambling = t >= T.scramble;
    const tagIn = t >= T.resolve;
    numCard.back.draw(`e${scrambling ? step : -1}|${resolved}|${tagIn}`, (g, w, h) => {
      sheen(g, w, h);
      text(g, "ANONYMOUS ACCOUNT", 70, 110, `700 34px ${SANS}`, C.muted);
      text(g, "EMAIL", 70, 236, `600 30px ${SANS}`, "#b5b9ff");
      rr(g, 60, 270, w - 120, 150, 26, "rgba(8,10,16,0.75)", tagIn ? "rgba(124,92,255,0.8)" : "rgba(255,255,255,0.14)", 3);
      let s;
      if (!scrambling) s = null;
      else {
        const r = mulberry32(step * 977 + 13);
        s = DEMO.email.split("").map((ch, i) => (i < resolved || ch === "@" || ch === ".") ? ch : SCR[Math.floor(r() * SCR.length)]).join("");
      }
      if (s) text(g, s, w / 2, 368, `700 50px ${MONO}`, tagIn ? "#ffffff" : "#d6d0ff", "center", tagIn ? 18 : 8);
      else text(g, "you@example.com", 100, 368, `500 50px ${SANS}`, "rgba(148,155,164,0.55)");
      if (tagIn) {
        rr(g, w / 2 - 125, 470, 250, 64, 32, "rgba(124,92,255,0.18)", "rgba(124,92,255,0.7)", 2);
        text(g, "RANDOM", w / 2, 513, `800 30px ${SANS}`, "#cfc6ff", "center");
      }
      text(g, "Never a real inbox. Nothing is sent to it.", 70, h - 90, `500 30px ${SANS}`, C.muted);
    });
  }

  // ---- chips + scanner + walker ---------------------------------------------------
  const CHIP_TEXT = ["NO EMAIL", "NO IP LOGGING", "NO PASSWORD"];
  const chips = CHIP_TEXT.map(() => card(8.4, 1.75, { r: 0.6, depth: 0.26 }));
  const scanner = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color("#d9d2ff").multiplyScalar(2.5), transparent: true, depthWrite: false }));
  const scanGlow = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(C.violet), transparent: true, opacity: 0.5, depthWrite: false }));
  const walkFace = new Face(engine, 3.2, 7.4);
  walkFace.draw("walker", (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(220,224,235,0.85)"); gr.addColorStop(1, "rgba(220,224,235,0.25)");
    g.fillStyle = gr;
    g.shadowColor = "rgba(196,184,255,0.9)"; g.shadowBlur = 30;
    g.beginPath(); g.arc(w / 2, h * 0.11, w * 0.17, 0, Math.PI * 2); g.fill();
    rr(g, w * 0.24, h * 0.21, w * 0.52, h * 0.38, w * 0.2, gr);
    rr(g, w * 0.29, h * 0.55, w * 0.18, h * 0.42, w * 0.09, gr);
    rr(g, w * 0.53, h * 0.55, w * 0.18, h * 0.42, w * 0.09, gr);
  });
  const walkMat = dissolveMaterial(walkFace.texture, noise, "#c4b8ff");
  const walker = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.4), walkMat);
  const walkBurn = (t) => 1.05 * ease.inOutSine(prog(t, T.walker + 0.45, T.walkerGone));
  const walkEmbers = burnEmitter(noise, 220, 23, 3.2, 7.4, (th) => invert(walkBurn, T.walker + 0.45, T.walkerGone, th), { life: 1.0, rise: 1.2, spread: 1.6, size: 0.09, colors: ["#e4e0ff", C.violet] });
  const chipGroup = addSet("chips", ...chips.map((c) => c.group), scanner, scanGlow, walker);
  function drawChip(i, t) {
    const done = t >= T.checks[i];
    const pop = done ? Math.exp(-(t - T.checks[i]) / 0.18) : 0;
    chips[i].face.draw(`c${i}|${done}|${Math.round(pop * 10)}`, (g, w, h) => {
      sheen(g, w, h, 72);
      const cy = h / 2;
      if (done) check(g, 110, cy, 54 * (1 + 0.25 * pop), C.green);
      else { g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 6; g.beginPath(); g.arc(110, cy, 50, 0, Math.PI * 2); g.stroke(); }
      text(g, CHIP_TEXT[i], 200, cy + 24, `800 66px ${SANS}`, done ? "#ffffff" : "#c9cdd4");
    });
    chips[i].setRim(done ? C.green : C.violet, done ? 2.2 : 1.6);
    chips[i].setGlow(done ? C.green : C.violet, done ? 0.28 + 0.3 * pop : 0.22);
  }

  // ---- duration tiles -------------------------------------------------------------
  const TIERS = [["1", "DAY"], ["3", "DAYS"], ["1", "WEEK"], ["2", "WEEKS"], ["1", "MONTH"]];
  const tiles = TIERS.map(() => card(3.2, 3.6, { back: true, r: 0.5, depth: 0.34 }));
  const SEL = 2; // 1 week
  tiles.forEach((tile, i) => {
    tile.face.draw(`clock${i}`, (g, w, h) => { sheen(g, w, h); clockGlyph(g, w / 2, h / 2, 90, "rgba(214,208,255,0.85)"); });
  });
  function drawTile(i, t) {
    const sel = i === SEL && t >= T.select;
    const pulse = sel ? Math.exp(-(t - T.select) / 0.35) : 0;
    tiles[i].back.draw(`t${i}|${sel}|${Math.round(pulse * 12)}`, (g, w, h) => {
      sheen(g, w, h);
      if (sel) rr(g, 6, 6, w - 12, h - 12, 54, "rgba(124,92,255,0.22)");
      text(g, TIERS[i][0], w / 2, h * 0.58, `800 190px ${SANS}`, sel ? "#ffffff" : "#e3e5e8", "center", sel ? 30 : 0);
      text(g, TIERS[i][1], w / 2, h * 0.8, `700 48px ${SANS}`, sel ? "#cfc6ff" : C.muted, "center");
    });
    tiles[i].setRim(sel ? C.violet : "#4b4f6b", sel ? 2.6 + 3 * pulse : 1.2, sel ? 1 : 0.7);
    tiles[i].setGlow(C.violet, sel ? 0.45 + 0.5 * pulse : 0.12);
  }
  const tierGroup = addSet("tier", ...tiles.map((t) => t.group));

  // ---- split: can / can't -----------------------------------------------------------
  const canCard = card(5.4, 8.8, { r: 0.55, rim: C.green, glow: C.green, tint: "#10201a" });
  const cantCard = card(5.4, 8.8, { r: 0.55, rim: "#5c606b", glow: "#3a3d47", tint: "#16181f" });
  const lockCard = card(2.2, 2.2, { r: 1.1, depth: 0.4, rim: C.violet, glow: C.violet });
  canCard.face.draw("can", (g, w, h) => {
    sheen(g, w, h);
    text(g, "CAN", 70, 150, `800 64px ${SANS}`, C.green);
    ["Chat", "Call", "Join servers"].forEach((s, i) => { check(g, 110, 300 + i * 170, 46, C.green); text(g, s, 180, 318 + i * 170, `700 56px ${SANS}`, "#ffffff"); });
  });
  cantCard.face.draw("cant", (g, w, h) => {
    sheen(g, w, h);
    text(g, "CAN'T", 70, 150, `800 64px ${SANS}`, "#8b909a");
    ["Create servers", "Buy Disband Aero", "Accept gifts", "Create bots"].forEach((s, i) => { cross(g, 110, 300 + i * 160, 42, "#777c87"); text(g, s, 178, 318 + i * 160, `600 46px ${SANS}`, "#a3a8b2"); });
  });
  lockCard.face.draw("lock", (g, w, h) => { lockGlyph(g, w / 2, h / 2 + 10, 120, "#e8e4ff"); });
  canCard.group.name = "valid"; cantCard.group.name = "restricted";
  const splitGroup = addSet("valid-vs-restricted", canCard.group, cantCard.group, lockCard.group);

  // ---- burn: profile + three messages ---------------------------------------------
  const prof = new Face(engine, 7.6, 2.8);
  const msgText = ["first time here — what's everyone building?", "hopping into the Lounge for a bit", "ok, heading out ✌️"];
  const msgFaces = msgText.map(() => new Face(engine, 7.6, 1.5));
  const profMat = dissolveMaterial(prof.texture, noise, C.amber);
  const profMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.8), profMat);
  const msgMats = msgFaces.map((f) => dissolveMaterial(f.texture, noise, C.amber));
  const msgMeshes = msgMats.map((m) => new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.5), m));
  const profBurn = (t) => 1.05 * ease.inOutSine(prog(t, T.ignite, T.ignite + 0.75));
  const msgBurnStart = (i) => T.poof + 0.12 + i * 0.12;
  const msgBurn = (i) => (t) => 1.05 * ease.inOutSine(prog(t, msgBurnStart(i), msgBurnStart(i) + 0.6));
  const profEmbers = burnEmitter(noise, 420, 31, 7.6, 2.8, (th) => invert(profBurn, T.ignite, T.ignite + 0.75, th), { life: 1.1, rise: 2.6, spread: 1.4, size: 0.11 });
  const msgEmbers = msgMeshes.map((_, i) => burnEmitter(noise, 160, 41 + i, 7.6, 1.5, (th) => invert(msgBurn(i), msgBurnStart(i), msgBurnStart(i) + 0.6, th), { life: 0.9, rise: 2.0, spread: 1.8, size: 0.08, colors: ["#d8d4cc", "#8a8580"] }));
  const burnGroup = addSet("burn", profMesh, ...msgMeshes);
  function drawProfile(t) {
    const left = Math.max(0, Math.ceil((T.countdownEnd - t) / ((T.countdownEnd - T.burn) / 3)));
    const online = t < T.countdownEnd;
    const blink = !online && t < T.countdownEnd + 0.2 && Math.floor((t - T.countdownEnd) * 20) % 2 === 0;
    prof.draw(`p${left}|${online}|${blink}`, (g, w, h) => {
      rr(g, 4, 4, w - 8, h - 8, 50, "rgba(20,24,36,0.92)", online ? "rgba(124,92,255,0.6)" : "rgba(242,63,67,0.6)", 3);
      g.beginPath(); g.arc(150, h / 2, 92, 0, Math.PI * 2); g.fillStyle = "#4e5058"; g.fill();
      text(g, "A", 150, h / 2 + 34, `700 96px ${SANS}`, "#ffffff", "center");
      g.beginPath(); g.arc(214, h / 2 + 62, 26, 0, Math.PI * 2); g.fillStyle = "rgba(20,24,36,1)"; g.fill();
      g.beginPath(); g.arc(214, h / 2 + 62, 18, 0, Math.PI * 2); g.fillStyle = online || blink ? C.green : "#4e5058"; g.fill();
      text(g, "Anonymous", 290, 130, `800 64px ${SANS}`, "#ffffff");
      text(g, `@${DEMO.handle}`, 290, 182, `500 36px ${MONO}`, C.muted);
      const label = online ? `Expires in 00:00:0${left}` : "Expired";
      text(g, label, 290, 262, `700 40px ${MONO}`, online ? "#ffcf7a" : C.red, "left", online ? 0 : 16);
    });
  }
  msgFaces.forEach((f, i) => f.draw(`m${i}`, (g, w, h) => {
    rr(g, 4, 4, w - 8, h - 8, 40, "rgba(20,24,36,0.88)", "rgba(255,255,255,0.10)", 2);
    g.beginPath(); g.arc(90, h / 2, 46, 0, Math.PI * 2); g.fillStyle = "#4e5058"; g.fill();
    text(g, "A", 90, h / 2 + 17, `700 48px ${SANS}`, "#fff", "center");
    text(g, "Anonymous", 168, 72, `700 40px ${SANS}`, "#ffffff");
    text(g, msgText[i], 168, 128, `500 36px ${SANS}`, "#dbdee1");
  }));

  // ---- vault --------------------------------------------------------------------------
  const vaultBack = card(6.4, 6.4, { r: 0.6, rim: C.gold, glow: C.gold, tint: "#1f1a10" });
  const doorL = card(3.2, 6.4, { r: 0.35, rim: C.gold, glow: C.gold, tint: "#2a2414", depth: 0.36 });
  const doorR = card(3.2, 6.4, { r: 0.35, rim: C.gold, glow: C.gold, tint: "#2a2414", depth: 0.36 });
  const hingeL = new THREE.Group(), hingeR = new THREE.Group();
  hingeL.position.set(-3.2, 0, 0.45); hingeR.position.set(3.2, 0, 0.45);
  doorL.group.position.x = 1.6; doorR.group.position.x = -1.6;
  hingeL.add(doorL.group); hingeR.add(doorR.group);
  [doorL, doorR].forEach((d, k) => d.face.draw(`door${k}`, (g, w, h) => {
    sheen(g, w, h, 40);
    g.strokeStyle = "rgba(227,179,65,0.5)"; g.lineWidth = 6;
    g.beginPath(); g.arc(k === 0 ? w - 10 : 10, h / 2, 90, k === 0 ? Math.PI / 2 : -Math.PI / 2, k === 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
  }));
  function drawVault(t) {
    const left = 1 - smooth(prog(t, T.doors + 0.35, T.app));
    vaultBack.face.draw(`v${Math.round(left * 120)}`, (g, w, h) => {
      sheen(g, w, h);
      const cx = w / 2, cy = h / 2 - 30, R = 250;
      g.lineCap = "round";
      g.strokeStyle = "rgba(227,179,65,0.18)"; g.lineWidth = 22; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = C.gold; g.shadowColor = C.gold; g.shadowBlur = 24;
      g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, left)); g.stroke();
      g.shadowBlur = 0;
      rr(g, cx - 120, cy - 150, 240, 300, 28, "rgba(227,179,65,0.12)", "rgba(227,179,65,0.85)", 4);
      text(g, "{ }", cx, cy + 34, `700 110px ${MONO}`, "#ffe3a0", "center", 20);
      text(g, "data.json", cx, cy + 118, `500 32px ${MONO}`, "#d9c38a", "center");
      text(g, "30 DAYS", cx, h - 70, `800 54px ${SANS}`, "#ffe3a0", "center");
    });
  }
  const vaultGroup = addSet("download-window", vaultBack.group, hingeL, hingeR);

  // ---- app: the web app on a laptop, an Anonymous member in #general -----------------
  const shot = await loadImage("../build/textures/laptop-anon.png");
  const box = await fetch("../build/textures/laptop-anon.json").then((r) => r.json());
  const lapFace = new Face(engine, shot.naturalWidth / PPU, shot.naturalHeight / PPU);
  const laptop = makeLaptop(lapFace.texture);
  laptop.group.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.color.multiplyScalar(0.55); o.material.needsUpdate = true; } });
  const lapGlow = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(C.violet), transparent: true, opacity: 0.35, depthWrite: false }));
  lapGlow.rotation.x = -Math.PI / 2;
  lapGlow.position.y = 0.05;
  addSet("app", laptop.group, lapGlow);
  function drawLaptop(t) {
    const k = prog(t, T.ripple, T.ripple + 0.7);
    lapFace.draw(`l${Math.round(k * 40)}`, (g, w, h) => {
      g.drawImage(shot, 0, 0, w, h);
      if (k > 0 && k < 1) {
        const m = box.newMessage, s = box.scale;
        const cx = (m.x + 40) * s, cy = (m.y + m.h / 2) * s;
        for (const off of [0, 0.25]) {
          const kk = clamp01((k - off) / 0.75);
          if (kk <= 0) continue;
          g.strokeStyle = `rgba(124,92,255,${(1 - kk) * 0.9})`; g.lineWidth = 6;
          g.beginPath(); g.arc(cx, cy, 30 + 160 * kk, 0, Math.PI * 2); g.stroke();
        }
        g.fillStyle = `rgba(124,92,255,${0.12 * Math.sin(Math.PI * k)})`;
        g.fillRect(m.x * s - 16, m.y * s, m.w * s + 32, m.h * s);
      }
    });
  }

  // ---- end: the mark in glass ---------------------------------------------------------
  const mark = await makeMark3D(3.6, env);
  const markGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(C.violet), transparent: true, opacity: 0.45, depthWrite: false }));
  markGlow.position.z = -2;
  const endGroup = addSet("end-card", mark, markGlow);

  // ================================================================================
  const shotsList = [
    { name: "hook", from: 0, to: T.number },
    { name: "number", from: T.number, to: T.chips },
    { name: "chips", from: T.chips, to: T.tiers },
    { name: "tier", from: T.tiers, to: T.split },
    { name: "valid-vs-restricted", from: T.split, to: T.burn },
    { name: "burn", from: T.burn, to: T.vault },
    { name: "download-window", from: T.vault, to: T.app },
    { name: "app", from: T.app, to: T.end },
    { name: "end-card", from: T.end, to: Infinity },
  ];
  const shotAt = (t) => shotsList.find((s) => t >= s.from && t < s.to);

  function prepare(t, s = shotAt(t).name) {
    if (s === "number") { drawNumber(t); drawEmail(t); }
    else if (s === "chips") chips.forEach((_, i) => drawChip(i, t));
    else if (s === "tier") tiles.forEach((_, i) => drawTile(i, t));
    else if (s === "burn") drawProfile(t);
    else if (s === "download-window") drawVault(t);
    else if (s === "app") drawLaptop(t);
  }

  const snap = ease.bezier(0.16, 0.9, 0.3, 1);
  const land = ease.bezier(0.2, 0.75, 0.25, 1);

  function pose(t, name = shotAt(t).name) {
    for (const g of Object.values(sets)) g.visible = false;
    sets[name].visible = true;
    embers.begin();
    const bob = (f, ph, a) => Math.sin(2 * Math.PI * (t * f + ph)) * a;
    let cam;

    if (name === "hook") {
      ghost.position.set(0, bob(0.4, 0, 0.12), 0);
      ghostMat.uniforms.burn.value = ghostBurn(t);
      ghostEmbers(embers, t, ghost);
      const d = 30 - 3 * t;
      cam = { pos: V(0, aimY(d), d), target: V(0, aimY(d), 0), fov: 30, aperture: 0 };
    }

    else if (name === "number") {
      const g = numCard.group;
      const drop = land(prog(t, T.number, T.number + 0.55));
      const flip = ease.inOutCubic(prog(t, T.flip, T.flip + 0.45));
      g.position.set(0, lerp(9, 0, drop) + bob(0.25, 0, 0.08), 0);
      g.rotation.set(lerp(-0.7, 0, drop) + 0.05 * Math.sin(t * 0.8), Math.PI * flip + 0.08 * Math.sin(t * 0.6), lerp(0.08, 0, drop));
      if (t < T.numberCut) cam = { pos: V(-3, aimY(36) + 2, 36), target: V(0, aimY(36) + 0.6, 0), fov: 30, aperture: 0.08 };
      else if (t < T.flip) cam = { pos: V(3.2, aimY(30) + 2, 30), target: V(-0.7, aimY(30) + 0.3, 0), fov: 30, aperture: 0.12, roll: -0.03 };
      else if (t < T.emailCut) { const o = ease.inOutSine(prog(t, T.flip, T.emailCut)); cam = { pos: V(lerp(-6, -2, o), aimY(32) + 1.5, 32), target: V(0, aimY(32) + 0.4, 0), fov: 30, aperture: 0.1 }; }
      else cam = { pos: V(-4, aimY(30) - 1, 30), target: V(-0.2, aimY(30) - 0.2, 0), fov: 30, aperture: 0.12, roll: 0.03 };
    }

    else if (name === "chips") {
      chips.forEach((c, i) => {
        const a = snap(prog(t, T.chips + i * 0.125, T.chips + i * 0.125 + 0.5));
        c.group.position.set(lerp(i % 2 ? 14 : -14, 0, a), (1 - i) * 2.25 + bob(0.3, i * 0.2, 0.05), lerp(-6, -i * 0.5, a));
        c.group.rotation.set(0, lerp(i % 2 ? -0.9 : 0.9, 0, a), 0);
      });
      const sp = prog(t, T.scan, T.checks[2] + 0.1);
      const sy = lerp(3.9, -3.9, ease.inOutSine(sp));
      scanner.position.set(0, sy, 0.6); scanGlow.position.set(0, sy, 0.5);
      scanner.visible = scanGlow.visible = sp > 0 && sp < 1;
      walker.position.set(lerp(-8, 3, prog(t, T.walker, T.walkerGone)), bob(1.8, 0, 0.08) - 0.2, -7);
      walker.visible = t >= T.walker - 0.02;
      walkMat.uniforms.burn.value = walkBurn(t);
      walkEmbers(embers, t, walker);
      if (t < T.chipsCut) cam = { pos: V(0, aimY(34) + 1, 34), target: V(0, aimY(34), 0), fov: 30, aperture: 0.1 };
      else { const o = ease.inOutSine(prog(t, T.chipsCut, T.tiers)); cam = { pos: V(lerp(9, 7, o), aimY(28) + 2.5, 26), target: V(0.5, aimY(28) + 0.2, -1), fov: 30, aperture: 0.16, focus: 27 }; }
    }

    else if (name === "tier") {
      const LAYOUT = [[-3.6, 2.2], [0, 2.2], [3.6, 2.2], [-1.8, -2.0], [1.8, -2.0]];
      tiles.forEach((tile, i) => {
        const a = snap(prog(t, T.tiers + i * 0.06, T.tiers + i * 0.06 + 0.45));
        const f = ease.inOutCubic(prog(t, T.tilesFlip + i * 0.1, T.tilesFlip + i * 0.1 + 0.4));
        const sel = i === SEL ? ease.bezier(0.2, 1.4, 0.4, 1)(prog(t, T.select, T.select + 0.35)) : 0;
        const dim = i !== SEL ? smooth(prog(t, T.select, T.select + 0.3)) : 0;
        tile.group.position.set(LAYOUT[i][0] * lerp(2.4, 1, a), LAYOUT[i][1] * lerp(2.4, 1, a) + bob(0.3, i * 0.17, 0.05), lerp(-30, 0, a) + 1.2 * sel - 0.6 * dim);
        tile.group.rotation.set(lerp(0.8, 0, a), Math.PI * f + lerp(1.2, 0, a), 0);
        tile.group.scale.setScalar(1 + 0.12 * sel - 0.06 * dim);
      });
      if (t < T.tiersCut) cam = { pos: V(0, aimY(36) + 1, 36), target: V(0, aimY(36), 0), fov: 30, aperture: 0.08 };
      else { const o = ease.inOutSine(prog(t, T.tiersCut, T.split)); cam = { pos: V(lerp(-2, -1, o), aimY(28) + 0.5, lerp(28, 26, o)), target: V(1.6, aimY(28) + 1.2, 0), fov: 30, aperture: 0.14, focus: 27 }; }
    }

    else if (name === "valid-vs-restricted") {
      const a = snap(prog(t, T.split, T.split + 0.45));
      canCard.group.position.set(lerp(-14, -2.9, a), bob(0.25, 0, 0.06), 0);
      cantCard.group.position.set(lerp(14, 2.9, a), bob(0.25, 0.4, 0.06), 0);
      canCard.group.rotation.set(0, lerp(0.8, 0.12, a), 0);
      cantCard.group.rotation.set(0, lerp(-0.8, -0.12, a), 0);
      const l = ease.bezier(0.3, 0, 0.2, 1.3)(prog(t, T.lock, T.lock + 0.3));
      lockCard.group.visible = t >= T.lock;
      lockCard.group.position.set(2.9 + 1.6, 3.6, lerp(8, 0.6, l));
      lockCard.group.rotation.set(0, lerp(0.8, -0.12, l), lerp(-0.4, 0.08, l));
      cantCard.setOpacity(t >= T.lock ? lerp(1, 0.75, smooth(prog(t, T.lock, T.lock + 0.4))) : 1);
      if (t < T.splitCut) cam = { pos: V(0, aimY(40) + 1, 40), target: V(0, aimY(40), 0), fov: 30, aperture: 0.06 };
      else { const o = ease.inOutSine(prog(t, T.splitCut, T.burn)); cam = { pos: V(lerp(10, 8, o), aimY(30) + 2, 28), target: V(2.4, aimY(30) + 0.4, 0), fov: 30, aperture: 0.14, focus: 29 }; }
    }

    else if (name === "burn") {
      profMesh.position.set(0, 2.6 + bob(0.3, 0, 0.05), 0);
      profMat.uniforms.burn.value = profBurn(t);
      profEmbers(embers, t, profMesh);
      msgMeshes.forEach((m, i) => {
        const ashK = smooth(prog(t, T.ignite, T.poof + i * 0.1));
        const fly = ease.inCubic(prog(t, msgBurnStart(i), msgBurnStart(i) + 0.7));
        m.position.set(lerp(0, i % 2 ? 9 : -9, fly), -0.2 - i * 1.75 + 3 * fly, 0.6 * i - 2 * fly);
        m.rotation.set(0, 0, (i % 2 ? -0.6 : 0.6) * fly);
        msgMats[i].uniforms.ash.value = ashK;
        msgMats[i].uniforms.burn.value = msgBurn(i)(t);
        msgEmbers[i](embers, t, m);
      });
      if (t < T.burnCut) cam = { pos: V(-0.8, aimY(26) + 3.6, 26), target: V(0.5, aimY(26) + 2.4, 0), fov: 30, aperture: 0.12 };
      else { const o = ease.inOutSine(prog(t, T.burnCut, T.vault)); cam = { pos: V(lerp(2, 0, o), aimY(34) + 1, lerp(32, 36, o)), target: V(0, aimY(34) + 0.4, 0), fov: 30, aperture: 0.1, focus: 33 }; }
    }

    else if (name === "download-window") {
      const open = ease.inOutCubic(prog(t, T.doors, T.doors + 0.5));
      hingeL.rotation.y = -1.9 * open;
      hingeR.rotation.y = 1.9 * open;
      const g = sets["download-window"];
      g.position.y = bob(0.3, 0, 0.05);
      const o = ease.inOutSine(prog(t, T.vault, T.app));
      cam = { pos: V(lerp(-3, -1, o), aimY(lerp(30, 24, o)) + 1, lerp(30, 24, o)), target: V(0, aimY(lerp(30, 24, o)) + 0.2, 0), fov: 30, aperture: 0.1 };
    }

    else if (name === "app") {
      const o = ease.inOutSine(prog(t, T.app, T.end));
      laptop.group.position.set(0, -7, 0);
      laptop.group.rotation.y = lerp(-0.35, -0.18, o);
      cam = { pos: V(lerp(18, 13, o), lerp(6, 5, o), lerp(44, 36, o)), target: V(1.5, 1.2, -5), fov: 30, aperture: 0.08 };
    }

    else {
      const a = ease.bezier(0.2, 0.8, 0.2, 1)(prog(t, T.end, T.end + 0.7));
      mark.scale.setScalar(lerp(0.35, 1, a));
      mark.rotation.set(0, lerp(-1.1, 0, a) + 0.18 * Math.sin((t - T.end) * 1.4), 0);
      mark.position.set(0, 0, 0);
      markGlow.material.opacity = 0.45 * a;
      // Put the mark's centre at y = 620 px.
      const d = 34;
      const off = (620 - 960) / (1920 / (2 * d * Math.tan(Math.PI / 12)));
      cam = { pos: V(0, off, d), target: V(0, off, 0), fov: 30, aperture: 0 };
    }

    embers.end();
    return cam;
  }

  return {
    shotAt,
    prepare,
    pose,
    // Groups for the keyframe handoff (anon/handoff.mjs).
    layers: { number: numCard.group, tier: tierGroup, "valid-vs-restricted": splitGroup, burn: burnGroup, "download-window": vaultGroup, "end-card": endGroup, chips: chipGroup },
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      const s = shotAt(t).name;
      return s === "hook" || s === "burn" ? 10 : 8;
    },
  };
}
