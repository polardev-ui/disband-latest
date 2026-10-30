// The world of "The Internet, Reconnected.": one continuous 3D scene, a pure
// function of time, built from the parts of the real classic UI.
//
// World units are CSS px / 100 of the 1440×900 app; the app's plane is z = 0
// with the window centred on the origin. Every part sits at its measured
// rectangle (reconnect/library/layout.json), so whenever the parts are home the
// world *is* the interface. The recurring system:
//   lines   the layout's dividers as square metal bars (Ribbon): they link the
//           tokens, extend into an architectural grid, sweep panels out, run
//           across the space from the channel rows and, at the end, bend into
//           the outline of the mark — real per-vertex geometry, not scaling;
//   tokens  the rail's icons as extruded coins with the captured icon on the
//           face; they spiral, pop out, fly and finally fill the mark;
//   strata  rows, message bands and panels as slabs that rise out of the
//           surface, fan into louvers, ripple and explode into layers;
//   type    3D letters (front face plus graded layers) that emerge through a
//           line, as through a slot, and re-arrange from one line into the next;
//   mark    the official mark, outlined by the lines and filled from below.
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { T, COPY } from "./timeline.js";
import { prog, lerp, ease, clamp01 } from "../src/ease.js";
import { roundedRect } from "../src/devices.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const smoother = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const VW = 1440, VH = 900, U = 100;
const wx = (x) => x / U - VW / 2 / U;
const wy = (y) => VH / 2 / U - y / U;
const centre = (r) => V(wx(r.x + r.w / 2), wy(r.y + r.h / 2), 0);
const snapE = ease.bezier(0.25, 0.9, 0.3, 1.06);
const glide = ease.bezier(0.55, 0, 0.2, 1);
const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
const TAN = Math.tan(Math.PI / 12);
const WVIS = 2 * TAN * (1080 / 1920);
const E = 26;                       // how far the grid lines run past the window
const PANEL_D = 0.06, PART_D = 0.03, PART_Z = 0.036;
const MARK_H = 3.5;

function darkStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const strip = (w, h, k) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  place(strip(2.2, 46, 14), -36, 8, -22);
  place(strip(1.6, 40, 10), 38, 4, -26);
  place(strip(0.9, 44, 50), -20, 4, 40);
  place(strip(0.7, 40, 30), 26, -6, 34);
  place(strip(34, 10, 0.35), 0, 40, 12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.012).texture;
  pmrem.dispose();
  return env;
}

function uvPlane(w, h, rect) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const u0 = rect.x / VW, u1 = (rect.x + rect.w) / VW, v0 = 1 - (rect.y + rect.h) / VH, v1 = 1 - rect.y / VH;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
  return g;
}

// ---- lines ------------------------------------------------------------------------
// A square-section bar along a polyline, rebuilt every sample. Four faces with
// fixed shading (top brightest) so it reads as a physical bar, unlit so it
// carries its own light; brightness can pulse along it.
class Ribbon {
  constructor(parent, n = 140) {
    this.n = n;
    const verts = n * 8;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    const idx = [];
    for (let f = 0; f < 4; f++) for (let i = 0; i < n - 1; i++) {
      const a = (i * 4 + f) * 2, b = ((i + 1) * 4 + f) * 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    parent.add(this.mesh);
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
  }
  hide() { this.mesh.visible = false; }
  // fn(s) -> Vector3 for s in [0,1]; only [a,b] of the curve is drawn.
  draw(fn, { a = 0, b = 1, width = 0.03, bright = 1, opacity = 1, pulse = null } = {}) {
    if (opacity <= 0.002 || b - a <= 1e-4) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mat.opacity = Math.min(1, opacity);
    const { n, pts, pos, col } = this;
    for (let i = 0; i < n; i++) pts[i].copy(fn(lerp(a, b, i / (n - 1))));
    const t = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
    const Z = V(0, 0, 1), Y = V(0, 1, 0);
    const shade = [1.0, 0.72, 0.42, 0.72];
    const c = [];
    for (let i = 0; i < n; i++) {
      t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]);
      if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
      t.normalize();
      side.crossVectors(t, Z);
      if (side.lengthSq() < 1e-6) side.crossVectors(t, Y);
      side.normalize().multiplyScalar(width / 2);
      up.crossVectors(side, t).normalize().multiplyScalar(width / 2);
      c[0] = [side.x + up.x, side.y + up.y, side.z + up.z];
      c[1] = [-side.x + up.x, -side.y + up.y, -side.z + up.z];
      c[2] = [-side.x - up.x, -side.y - up.y, -side.z - up.z];
      c[3] = [side.x - up.x, side.y - up.y, side.z - up.z];
      const s = lerp(a, b, i / (n - 1));
      const k = bright * (1 + (pulse ? pulse(s) : 0));
      for (let f = 0; f < 4; f++) {
        for (let e = 0; e < 2; e++) {
          const cc = c[(f + e) % 4];
          const v = ((i * 4 + f) * 2 + e) * 3;
          pos[v] = pts[i].x + cc[0]; pos[v + 1] = pts[i].y + cc[1]; pos[v + 2] = pts[i].z + cc[2];
          const lum = k * shade[f];
          col[v] = 0.78 * lum; col[v + 1] = 0.8 * lum; col[v + 2] = 0.84 * lum;
        }
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
const straight = (a, b) => (s) => a.clone().lerp(b, s);
// Morph curve A into curve B with a wave that travels along the line.
const morph = (A, B, m, spread = 0.5) => (s) => {
  const w = smoother((m * (1 + spread) - s * spread) / 1);
  return A(s).lerp(B(s), w);
};
// A polyline as a curve by arc length.
function polyCurve(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  const L = cum[cum.length - 1];
  return (s) => {
    const d = clamp01(s) * L;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
    const f = (d - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
    return points[lo].clone().lerp(points[hi], f);
  };
}

// ---- type ---------------------------------------------------------------------------
// A word as 3D letters: each letter is a stack of planes cut from one canvas
// atlas — the front in the headline white, the layers behind in the app's
// greys — alpha-tested, so the renderer's sample jitter antialiases them and
// they occlude and blur like every other object. A clipping plane per word lets
// letters emerge through a line.
const DEPTH_GREYS = ["#b5bac1", "#949ba4", "#80848e", "#6d6f78", "#4e5058", "#3f4147", "#313338", "#2b2d31", "#232428", "#1e1f22"];
function makeWord(parent, text, { em, layers = 10, gap = 0.012, weight = 800, tracking = -0.02, front = "#f2f3f5" }) {
  const PX = 220;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const font = `${weight} ${PX}px "Inter"`;
  g.font = font;
  const pos = [];
  for (let i = 0; i <= text.length; i++) pos.push(g.measureText(text.slice(0, i)).width + i * tracking * PX);
  const W = pos[text.length] - tracking * PX;
  const pad = 30, H = Math.round(PX * 1.3), base = Math.round(PX * 1.02);
  c.width = Math.ceil(W + pad * 2); c.height = H;
  g.font = font;
  g.fillStyle = "#fff";
  g.textBaseline = "alphabetic";
  for (let i = 0; i < text.length; i++) g.fillText(text[i], pad + pos[i], base);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const k = em / PX;
  const clip = new THREE.Plane(V(0, 1, 0), 1e6);
  const mats = Array.from({ length: layers }, (_, l) => new THREE.MeshBasicMaterial({
    map: tex, color: new THREE.Color(l === 0 ? front : DEPTH_GREYS[Math.min(DEPTH_GREYS.length - 1, Math.round((l - 1) * (DEPTH_GREYS.length - 1) / Math.max(1, layers - 2)))]),
    alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: [clip],
  }));
  const group = new THREE.Group();
  parent.add(group);
  const letters = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") continue;
    const m = g.measureText(text[i]);
    const left = pad + pos[i] - m.actualBoundingBoxLeft - 6, right = pad + pos[i] + m.actualBoundingBoxRight + 6;
    const geo = new THREE.PlaneGeometry((right - left) * k, H * k);
    const uv = geo.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, lerp(left / c.width, right / c.width, uv.getX(j)), uv.getY(j));
    const lg = new THREE.Group();
    for (let l = 0; l < layers; l++) {
      const mesh = new THREE.Mesh(geo, mats[l]);
      mesh.position.z = -l * gap;
      lg.add(mesh);
    }
    const x = ((left + right) / 2 - pad - W / 2) * k;
    const y = (base - H / 2) * k;   // plane centre, above the baseline
    group.add(lg);
    letters.push({ ch: text[i], g: lg, x, y, w: (right - left) * k });
  }
  return { group, letters, width: W * k, em, clip, mats };
}

// ---- the mark -----------------------------------------------------------------------
async function makeMark(parent, env) {
  const svg = await fetch("library/brand/disband-mark.svg").then((r) => r.text());
  const data = new SVGLoader().parse(svg);
  const sub = data.paths[0].subPaths.map((sp) => sp.getSpacedPoints(700));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const pts of sub) for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, s = MARK_H / (maxY - minY);
  const DEPTH = 210, BEV = 22;
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  let geo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEV, bevelSize: 12, bevelSegments: 5, curveSegments: 24 });
  if (geo.index) geo = geo.toNonIndexed();
  geo.translate(-cx, -cy, -DEPTH / 2);
  geo.scale(s, -s, s);   // SVG y runs down; the mirror flips the winding back below
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const v = a.array[(i + 1) * n + k]; a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k]; a.array[(i + 2) * n + k] = v; }
  }
  geo.computeVertexNormals();
  const fillClip = new THREE.Plane(V(0, -1, 0), 1e6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x5c5e63, metalness: 0.25, roughness: 0.3, envMap: env, envMapIntensity: 2.2, clippingPlanes: [fillClip] });
  const mesh = new THREE.Mesh(geo, mat);
  parent.add(mesh);
  const front = (DEPTH / 2 + BEV) * s + 0.01;
  const contours = sub.map((pts) => pts.map((p) => V((p.x - cx) * s, -(p.y - cy) * s, front)));
  return { mesh, mat, fillClip, contours, front };
}

export async function createWorld(engine) {
  const { scene, renderer } = engine;
  renderer.localClippingEnabled = true;
  const env = darkStudio(renderer);
  scene.fog = new THREE.Fog(new THREE.Color("#0b0c0e"), 70, 170);
  const L = await fetch("library/layout.json").then((r) => r.json());
  const tex = await engine.texture("library/captures/main.png");
  const root = new THREE.Group();
  scene.add(root);

  const metal = (c = 0x18191c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.78, roughness: 0.34, envMap: env, envMapIntensity: 1.0, transparent: true });
  const all = [];

  // ---- slabs: panels in the app's colours, parts cut from the capture --------
  function slab(rect, { depth = PART_D, color = null, z = PART_Z, map = null, faceRect = null } = {}) {
    const w = rect.w / U, h = rect.h / U;
    const g = new THREE.Group();
    const faceMat = color != null
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false, transparent: true })
      : new THREE.MeshBasicMaterial({ map: map ?? tex, toneMapped: false, transparent: true });
    const face = new THREE.Mesh(color != null ? new THREE.PlaneGeometry(w, h) : (map ? new THREE.PlaneGeometry(w, h) : uvPlane(w, h, faceRect ?? rect)), faceMat);
    face.position.z = depth / 2 + 0.0008;
    const bodyMat = metal();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), bodyMat), face);
    root.add(g);
    const home = centre(rect).setZ(z);
    const p = {
      g, rect, w, h, home, faceMat, bodyMat,
      set(a = 1) { faceMat.opacity = a; bodyMat.opacity = a; g.visible = a > 0.002; },
      at(pos, rot = null, sc = 1, a = 1) { g.position.copy(pos); if (rot) g.rotation.set(rot.x, rot.y, rot.z); else g.rotation.set(0, 0, 0); g.scale.setScalar(sc); this.set(a); },
      rest(a = 1) { this.at(home, null, 1, a); },
    };
    all.push(p);
    return p;
  }
  const panel = {
    rail: slab({ x: 0, y: 0, w: 72, h: 900 }, { color: "#1e1f22", depth: PANEL_D, z: 0 }),
    column: slab({ x: 72, y: 0, w: 240, h: 900 }, { color: "#2b2d31", depth: PANEL_D, z: 0 }),
    chat: slab({ x: 312, y: 0, w: 888, h: 900 }, { color: "#313338", depth: PANEL_D, z: 0 }),
    members: slab({ x: 1200, y: 0, w: 240, h: 900 }, { color: "#2b2d31", depth: PANEL_D, z: 0 }),
  };
  const wholeApp = slab({ x: 0, y: 0, w: VW, h: VH }, { depth: PANEL_D, z: 0 });
  const colHeader = slab({ x: 72, y: 0, w: 240, h: 48 });
  const rows = L.channels.filter((c) => c.y >= 48 && c.y < 800).map((c) => slab({ x: 72, y: c.y, w: 240, h: c.h }));
  const userPanel = slab({ x: 72, y: 848, w: 240, h: 52 });
  const chatHeader = slab({ x: 312, y: 0, w: 888, h: 48 });
  const tops = L.messages.map((m) => m.y).filter((y) => y > 60);
  const COMPOSER_Y = L.composer.y - 18;
  const sEdges = [48, ...tops, COMPOSER_Y];
  const strata = sEdges.slice(0, -1).map((y, k) => slab({ x: 312, y, w: 888, h: sEdges[k + 1] - y }));
  // The composer's face is a canvas fed with the captured typing frames.
  const typeCanvas = document.createElement("canvas");
  const typeImgs = await Promise.all(Array.from({ length: L.typed.length + 1 }, (_, i) => new Promise((res) => {
    const im = new Image(); im.onload = () => res(im); im.src = `library/captures/type/t${String(i).padStart(3, "0")}.png`;
  })));
  typeCanvas.width = typeImgs[0].naturalWidth; typeCanvas.height = typeImgs[0].naturalHeight;
  const typeCtx = typeCanvas.getContext("2d");
  const typeTex = engine.canvasTexture(typeCanvas);
  let typeShown = -1;
  const showTyped = (i) => { if (i === typeShown) return; typeShown = i; typeCtx.drawImage(typeImgs[i], 0, 0); typeTex.needsUpdate = true; };
  showTyped(0);
  const composer = slab({ x: 312, y: COMPOSER_Y, w: 888, h: VH - COMPOSER_Y }, { map: typeTex });
  const mEdges = [0, ...L.members.map((m) => m.y), L.members[L.members.length - 1].y + L.members[L.members.length - 1].h];
  const memberBands = mEdges.slice(0, -1).map((y, k) => slab({ x: 1200, y, w: 240, h: mEdges[k + 1] - y }));
  const parts = [colHeader, ...rows, userPanel, chatHeader, ...strata, composer, ...memberBands];

  // ---- tokens: the rail's icons as extruded coins ----------------------------
  const TOK_D = 0.04, TOK_B = 0.012, TOK_Z = PART_Z + 0.03;
  const tokens = L.rail.map((it) => {
    const shape = it.active ? roundedRect(0.48, 0.48, 0.16) : (() => { const s = new THREE.Shape(); s.absarc(0, 0, 0.24, 0, Math.PI * 2, false); return s; })();
    const body = new THREE.ExtrudeGeometry(shape, { depth: TOK_D, bevelEnabled: true, bevelThickness: TOK_B, bevelSize: 0.008, bevelSegments: 3, curveSegments: 48 });
    body.translate(0, 0, -TOK_D / 2);
    const faceGeo = new THREE.ShapeGeometry(shape, 48);
    const uv = faceGeo.attributes.uv, p = faceGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const cssX = it.x + (p.getX(i) + 0.24) * U, cssY = it.y + (0.24 - p.getY(i)) * U;
      uv.setXY(i, cssX / VW, 1 - cssY / VH);
    }
    const g = new THREE.Group();
    const bodyMat = metal(0x1b1c1f);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.z = TOK_D / 2 + TOK_B + 0.001;
    g.add(new THREE.Mesh(body, bodyMat), face);
    root.add(g);
    const home = V(wx(it.x + 24), wy(it.y + 24), TOK_Z);
    return { g, home, faceMat, bodyMat, label: it.label, set(a = 1) { faceMat.opacity = a; bodyMat.opacity = a; g.visible = a > 0.002; } };
  });
  const railSep = slab({ x: L.railSeparators[0].x, y: L.railSeparators[0].y, w: L.railSeparators[0].w, h: L.railSeparators[0].h });

  // ---- lines ---------------------------------------------------------------------
  // The layout's dividers, in the order the tokens' links become them.
  const GRID = [
    { v: true, at: 0 }, { v: true, at: 72 }, { h: true, at: 0 }, { v: true, at: 312 },
    { h: true, at: 48 }, { v: true, at: 1200 }, { h: true, at: COMPOSER_Y }, { v: true, at: 1440 }, { h: true, at: 900 },
  ].map((d) => {
    const [uA, uB, eA, eB] = d.v
      ? [V(wx(d.at), wy(0), 0.05), V(wx(d.at), wy(900), 0.05), V(wx(d.at), wy(0) + E, 0.05), V(wx(d.at), wy(900) - E, 0.05)]
      : [V(wx(d.at === 48 || d.at === COMPOSER_Y ? 312 : 0), wy(d.at), 0.05), V(wx(d.at === COMPOSER_Y ? 1200 : 1440), wy(d.at), 0.05), V(wx(0) - E, wy(d.at), 0.05), V(wx(1440) + E, wy(d.at), 0.05)];
    // `reach` runs the divider out from its place in the window to the far grid.
    return { ...d, ui: straight(uA, uB), ext: straight(eA, eB), reach: (r) => straight(uA.clone().lerp(eA, r), uB.clone().lerp(eB, r)) };
  });
  const grid = GRID.map(() => new Ribbon(root));
  const sweepers = [0, 1, 2, 3].map(() => new Ribbon(root, 24));
  const rules = rows.map(() => new Ribbon(root, 40));
  // Rails running back in depth from each part's slot, which the part rides in on.
  const DEEP = 32;
  const railSpecs = [
    ...rows.map((r) => ({ part: r, x: 72 })),
    ...strata.flatMap((s) => [{ part: s, x: 312 }, { part: s, x: 1200 }]),
    ...memberBands.map((m) => ({ part: m, x: 1440 })),
  ];
  const depthRails = railSpecs.map(() => new Ribbon(root, 36));
  const base = new Ribbon(root, 40);

  // ---- type ------------------------------------------------------------------------
  const words = {
    head1: makeWord(root, COPY.head1, { em: 0.9 }),
    head2: makeWord(root, COPY.head2, { em: 0.9 }),
    fam1: makeWord(root, "A FAMILIAR", { em: 1.42 }),
    fam2: makeWord(root, "FEELING.", { em: 1.42 }),
    home: makeWord(root, COPY.home, { em: 1.42 }),
    name: makeWord(root, COPY.name, { em: 0.95, tracking: 0.24, layers: 12 }),
    slogan: makeWord(root, COPY.slogan, { em: 0.42, weight: 500, tracking: -0.005, layers: 1 }),
    cta: makeWord(root, COPY.cta, { em: 0.62, layers: 8 }),
    url: makeWord(root, COPY.url, { em: 1.32, tracking: -0.035, layers: 10 }),
  };
  // "A FAMILIAR FEELING." hands its matching letters to "A NEW HOME.".
  const famLetters = [...words.fam1.letters.map((l) => ({ ...l, word: words.fam1 })), ...words.fam2.letters.map((l) => ({ ...l, word: words.fam2 }))];
  const used = new Set();
  const handoff = words.home.letters.map((nl) => {
    const j = famLetters.findIndex((ol, k) => !used.has(k) && ol.ch === nl.ch);
    if (j >= 0) used.add(j);
    return j;
  });

  // ---- the mark --------------------------------------------------------------------
  const markGroup = new THREE.Group();
  root.add(markGroup);
  const mark = await makeMark(markGroup, env);
  const MARK_POS = V(0, 0.7, 7.0);
  markGroup.position.copy(MARK_POS);
  // Nine arcs of the outline, one per grid line, allotted by length.
  const lens = mark.contours.map((pts) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0));
  const total = lens.reduce((a, b) => a + b, 0);
  let alloc = lens.map((l) => Math.max(1, Math.round((l / total) * GRID.length)));
  while (alloc.reduce((a, b) => a + b, 0) > GRID.length) alloc[alloc.indexOf(Math.max(...alloc))]--;
  while (alloc.reduce((a, b) => a + b, 0) < GRID.length) alloc[lens.indexOf(Math.max(...lens))]++;
  const arcs = [];
  mark.contours.forEach((pts, ci) => {
    for (let k = 0; k < alloc[ci]; k++) {
      const a = Math.floor((k / alloc[ci]) * (pts.length - 1)), b = Math.floor(((k + 1) / alloc[ci]) * (pts.length - 1));
      arcs.push(polyCurve(pts.slice(a, b + 1).map((p) => p.clone().add(MARK_POS))));
    }
  });
  // Where each token comes to rest inside the mark: the middle of an arc, drawn in.
  const markSlots = arcs.map((arc) => arc(0.5).lerp(MARK_POS.clone().setZ(MARK_POS.z + mark.front), 0.32));

  // ---- camera -------------------------------------------------------------------
  const dirOf = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const look = (q, yaw, pitch, d) => ({ p: q.clone().addScaledVector(dirOf(yaw, pitch), d), q: q.clone() });
  const readW = (w) => (w / U) / (WVIS * 0.95);
  const H0 = tokens[0].home;
  const AX = V(H0.x, 0, 0);   // the rail's axis
  // Around the rail's axis while the tokens spiral down it, drawing back so
  // the whole helix stays in frame.
  const orbit = (t) => {
    const k = smooth(clamp01((t - 1.3) / 1.5));
    const phi = lerp(0.3, 0.95, k), r = lerp(3.6, 9.0, k), h = lerp(3.8, 2.4, k);
    return { p: V(AX.x + r * Math.sin(phi), h, r * Math.cos(phi)), q: V(AX.x + 0.4 * k, lerp(3.75, 1.9, k), 0) };
  };
  const C1 = look(V(-3.1, 2.9, 0), 0.12, 0.03, 27.5);
  const READ = look(V(wx(760), wy(450), 0), 0, 0, readW(900));
  const TYPE = look(V(wx(640), wy(600), 0), 0, 0, readW(600));
  const MARKCAM = look(V(0, MARK_POS.y - 1.1, MARK_POS.z), 0, 0, 30);
  const KEYS = [
    { t: 0.0, ...look(H0, 0.05, -0.02, 8.6), fov: 30, ap: 0.012, stop: true },
    { t: 1.15, p: H0.clone().add(V(0.55, -0.32, 3.0)), q: H0.clone().add(V(0, -0.12, 0)), fov: 30, ap: 0.012 },
    { t: 1.7, ...orbit(1.7), fov: 32, ap: 0.025 },
    { t: 2.2, ...orbit(2.2), fov: 32, ap: 0.025 },
    { t: 2.8, ...orbit(2.8), fov: 32, ap: 0.025 },
    { t: 3.7, ...C1, fov: 30, ap: 0.02 },
    { t: 4.9, ...look(V(-3.2, 2.85, 0), 0.05, 0.02, 25.8), fov: 30, ap: 0.02 },
    { t: 5.5, ...look(V(-3.25, 2.8, 0), 0.03, 0.02, 25.2), fov: 30, ap: 0.02 },
    // Into the structure, near-frontal so the rails converge through the frame.
    { t: 6.6, ...look(V(-4.2, 1.8, 0), -0.14, 0.03, 17.5), fov: 32, ap: 0.03 },
    { t: 8.2, ...look(V(-0.4, 0.8, 0), 0.12, 0.02, 21), fov: 31, ap: 0.03 },
    { t: 9.4, ...look(V(0.6, 0.3, 0), 0.04, 0, 25), fov: 30, ap: 0.025 },
    { t: T.assembled, ...READ, fov: 30, ap: 0.02, stop: true },
    { t: T.track, ...look(READ.q, -0.03, 0, READ.p.distanceTo(READ.q) - 1.0), fov: 30, ap: 0.02 },
    { t: 13.2, p: V(-3.4, 1.7, 5.4), q: V(-6.3, 2.3, 0.2), fov: 32, ap: 0.03 },
    { t: 14.3, p: V(-2.3, 3.1, 4.5), q: V(-5.2, 3.0, 0.3), fov: 32, ap: 0.03 },
    { t: 15.3, p: V(-1.3, 1.7, 4.1), q: V(-5.0, 2.4, 0.5), fov: 32, ap: 0.03 },
    { t: T.type, ...TYPE, fov: 30, ap: 0.02 },
    { t: T.typed, ...look(TYPE.q.clone().add(V(-0.25, -0.15, 0)), 0.06, 0, TYPE.p.distanceTo(TYPE.q) - 3.2), fov: 30, ap: 0.02 },
    { t: 20.7, ...look(V(0.4, -1.0, 1.0), 0.88, -0.24, 24), fov: 30, ap: 0.03 },
    { t: 22.1, ...look(V(0.1, -0.8, 0.5), 0.42, -0.1, 38), fov: 30, ap: 0.03 },
    { t: T.whole, ...look(V(0, -1.3, 0), 0.08, 0, 54), fov: 30, ap: 0.02 },
    { t: T.converge, ...look(V(0, -1.3, 0), -0.04, 0.01, 52), fov: 30, ap: 0.02 },
    { t: 28.4, ...look(V(0, 0.2, 2.5), -0.02, 0, 44), fov: 30, ap: 0.02 },
    { t: T.formed, ...MARKCAM, fov: 30, ap: 0.02, stop: true },
    { t: T.settle, ...look(MARKCAM.q, 0, 0, 29.4), fov: 30, ap: 0.03 },
    { t: T.endHold, ...look(MARKCAM.q, 0, 0, 29.0), fov: 30, ap: 0.12, stop: true },
    { t: 38.0, ...look(MARKCAM.q, 0, 0, 29.0), fov: 30, ap: 0.12, stop: true },
  ];
  // Hermite through the keys, tangents from the neighbours (zero at stops), so
  // the camera's path and speed are smooth everywhere.
  function camAt(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    const u = clamp01((t - k0.t) / (k1.t - k0.t));
    const dt = k1.t - k0.t;
    const tan = (j, f) => {
      const k = KEYS[j];
      if (k.stop || j === 0 || j === KEYS.length - 1) return 0;
      return (KEYS[j + 1][f] - KEYS[j - 1][f]) / (KEYS[j + 1].t - KEYS[j - 1].t);
    };
    const vtan = (j, f) => {
      const k = KEYS[j];
      if (k.stop || j === 0 || j === KEYS.length - 1) return V(0, 0, 0);
      return KEYS[j + 1][f].clone().sub(KEYS[j - 1][f]).divideScalar(KEYS[j + 1].t - KEYS[j - 1].t);
    };
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    const herm = (f) => k0[f].clone().multiplyScalar(h00).addScaledVector(vtan(i, f), h10 * dt).addScaledVector(k1[f], h01).addScaledVector(vtan(i + 1, f), h11 * dt);
    const hs = (f) => k0[f] * h00 + tan(i, f) * h10 * dt + k1[f] * h01 + tan(i + 1, f) * h11 * dt;
    const p = herm("p"), q = herm("q");
    return { pos: p, target: q, fov: hs("fov"), aperture: Math.max(0, hs("ap")), focus: p.distanceTo(q) };
  }

  // ---- per-sequence helpers ----------------------------------------------------
  const hideAll = () => {
    for (const p of all) p.g.visible = false;
    for (const tk of tokens) tk.g.visible = false;
    for (const r of [...grid, ...sweepers, ...rules, ...depthRails, base]) r.hide();
    for (const w of Object.values(words)) w.group.visible = false;
    markGroup.visible = false;
  };
  // Letters rising (dir +1) or dropping (dir -1) through a line at height y0.
  function emerge(word, { x, y0, baseline, dir, inT, outT, stagger = 0.035, dur = 0.55, t }) {
    word.group.visible = true;
    word.group.position.set(x, baseline, word.z ?? 0.4);
    word.clip.normal.set(0, dir, 0);
    word.clip.constant = -dir * y0;
    const travel = word.em * 1.25;
    word.letters.forEach((l, i) => {
      const a = ease.bezier(0.2, 0.85, 0.25, 1)(prog(t, inT + i * stagger, inT + i * stagger + dur));
      const b = outT === undefined ? 0 : ease.inCubic(prog(t, outT + i * stagger * 0.6, outT + i * stagger * 0.6 + dur * 0.8));
      const off = -dir * travel * (1 - a) - dir * travel * b;
      l.g.position.set(l.x, l.y + off, 0);
      l.g.rotation.set(0, 0, 0);
      l.g.visible = a > 0 && b < 1;
    });
  }
  // Staggered progress for item k of n, centred on a window.
  const stag = (t, t0, k, step, dur) => prog(t, t0 + k * step, t0 + k * step + dur);

  // Explode offsets (the app as layers) for seq 4 and the end.
  const LAYER = { panel: 0, part: 1.2, chrome: 2.0, token: 2.8 };
  function exploded(e, a = 1, extraZ = 0, dy = 0) {
    const off = (p, z) => { p.g.position.z += z + extraZ; p.g.position.y += dy; };
    for (const p of Object.values(panel)) { p.rest(a); off(p, 0); }
    for (const p of [...rows, ...strata, ...memberBands]) { p.rest(a); off(p, LAYER.part * e); }
    for (const p of [colHeader, userPanel, chatHeader, composer]) { p.rest(a); off(p, LAYER.chrome * e); }
    railSep.rest(a); off(railSep, LAYER.token * e);
    tokens.forEach((tk) => { tk.g.position.copy(tk.home); tk.g.position.z += LAYER.token * e + extraZ; tk.g.position.y += dy; tk.g.rotation.set(0, 0, 0); tk.g.scale.setScalar(1); tk.set(a); });
  }
  const restAll = (a = 1) => exploded(0, a);

  function pose(t) {
    hideAll();
    const cam = camAt(t);

    // ===== 1 — a signal emerges ===============================================
    if (t < T.enter + 0.6) {
      const N = tokens.length;
      tokens.forEach((tk, i) => {
        tk.set(1);
        if (i === 0) {
          tk.g.position.copy(tk.home);
          tk.g.rotation.set(0, 0.25 * (1 - smooth(prog(t, 0, T.unstack + 0.4))), 0);
          return;
        }
        const a = glide(stag(t, T.unstack, i - 1, 0.09, 1.25));
        const out = smooth(stag(t, T.unstack, i - 1, 0.09, 0.45));
        const close = snapE(stag(t, T.organize, N - 1 - i, 0.05, 0.75));
        const y = lerp(H0.y, tk.home.y, a);
        const phi = 1.7 * (H0.y - y) + 0.9 * t - 0.6;
        const r = 1.55 * out * (1 - close);
        const onHelix = V(AX.x + r * Math.sin(phi), y, H0.z + r * Math.cos(phi));
        const stack = H0.clone().add(V(0, 0, -0.075 * i));
        const p = stack.lerp(onHelix, out);
        tk.g.position.copy(p);
        // Each turns to face the lens as it travels, with a slight lag.
        const toCam = Math.atan2(cam.pos.x - p.x, cam.pos.z - p.z);
        tk.g.rotation.set(0, (toCam + 0.35 * Math.sin(phi)) * out * (1 - close), 0);
        tk.set(stag(t, T.unstack, i - 1, 0.09, 0.05) > 0 ? 1 : 0);
      });
      // Light reveals the first token's edge.
      tokens[0].bodyMat.envMapRotation.set(0, lerp(-2.4, 1.2, ease.inOutSine(prog(t, T.glint - 0.2, T.glint + 1.0))), 0);
      tokens[0].faceMat.color.setScalar(smooth(prog(t, T.glint, T.glint + 0.6)));
      // Links between consecutive tokens; at the lock they run out into the grid.
      grid.forEach((rb, k) => {
        // Links snap onto the window's dividers, then run out into the dark.
        const m = prog(t, T.organize + 0.15 + k * 0.06, T.lock - 0.15 + k * 0.03);
        const reach = ease.inOutCubic(prog(t, T.lock - 0.1 + k * 0.025, T.lock + 0.75 + k * 0.025));
        const g = GRID[k];
        const linkFrom = tokens[Math.min(k, N - 1)].g.position.clone(), linkTo = tokens[Math.min(k + 1, N - 1)].g.position.clone();
        const born = k < N - 1 ? smooth(stag(t, T.unstack + 0.15, k, 0.09, 0.5)) : smooth(prog(t, T.organize + 0.4, T.organize + 0.9));
        const link = k < N - 1 ? straight(linkFrom, linkTo) : straight(linkFrom, linkFrom.clone().add(V(0.01, 0, 0)));
        const pulse = (s) => 1.4 * Math.exp(-(((s - ((t * 0.9 + k * 0.13) % 1)) / 0.07) ** 2));
        const curve = reach > 0 ? g.reach(reach) : morph(link, g.ui, m, 0.15);
        rb.draw(curve, { a: 0, b: m > 0 ? 1 : born, width: lerp(0.018, 0.026, m), bright: 0.85 + 0.6 * bump(prog(t, T.lock - 0.1, T.lock + 0.5)), opacity: 1, pulse });
      });
      // THE INTERNET, / RECONNECTED. rises out of the window's top line.
      const hx = C1.q.x;
      words.head2.z = 0.3; words.head1.z = 0.3;
      emerge(words.head2, { x: hx, y0: wy(0) + 0.04, baseline: wy(0) + 0.2, dir: 1, inT: T.head + 0.18, outT: T.headOut, t });
      emerge(words.head1, { x: hx, y0: wy(0) + 0.04, baseline: wy(0) + 0.2 + 0.9 * 1.08, dir: 1, inT: T.head, outT: T.headOut + 0.1, t });
      if (t < T.enter) return cam;
    }

    // ===== 2 — into the structure ================================================
    if (t < T.track) {
      if (t >= T.assembled) { wholeApp.rest(1); return cam; }
      tokens.forEach((tk) => { tk.set(1); tk.g.position.copy(tk.home); tk.g.rotation.set(0, 0, 0); tk.g.scale.setScalar(1); });
      railSep.rest(smooth(prog(t, T.railPanel + 0.3, T.railPanel + 0.6)));
      // Panels sweep out from their left line; a bright bar rides the edge.
      const sweep = (p, t0, dur, rb) => {
        const s = glide(prog(t, t0, t0 + dur));
        if (s <= 0) return;
        const left = wx(p.rect.x), w = p.w;
        p.at(V(left + (w * s) / 2, p.home.y, p.home.z));
        p.g.scale.set(Math.max(1e-3, s), 1, 1);
        const ex = left + w * s;
        rb.draw(straight(V(ex, wy(0) + 0.6, 0.08), V(ex, wy(900) - 0.6, 0.08)), { width: 0.04, bright: 1.6, opacity: bump(prog(t, t0 - 0.05, t0 + dur + 0.25)) });
      };
      sweep(panel.rail, T.railPanel, 0.45, sweepers[0]);
      sweep(panel.column, T.column, 0.6, sweepers[1]);
      sweep(panel.members, T.membersPanel, 0.5, sweepers[3]);
      sweep(panel.chat, T.chatPanel, 0.65, sweepers[2]);
      // Parts wait in depth along their rails, then fly forward into place.
      const land = new Map();
      const fly = (p, t0, dur, depth) => {
        const show = smooth(prog(t, T.rails + 0.2, T.rails + 1.0));
        if (show <= 0) return;
        const a = ease.bezier(0.3, 0.1, 0.15, 1)(prog(t, t0, t0 + dur));
        p.at(p.home.clone().add(V(0, 0, lerp(-depth, 0, a))), V(0.22 * bump(a), 0, 0), 1, show);
        land.set(p, t0 + dur);
      };
      fly(colHeader, T.rows + 0.3, 0.8, 5);
      rows.forEach((r, k) => fly(r, T.rows + k * 0.08, 0.9, 6 + 1.3 * k));
      fly(userPanel, T.rows + 0.6, 0.8, 5);
      strata.forEach((s, k) => fly(s, T.strata + k * 0.17, 1.2, 10 + 2.2 * k));
      memberBands.forEach((m, k) => fly(m, T.members + k * 0.08, 0.9, 6 + 1.1 * k));
      fly(chatHeader, T.chrome, 0.8, 5);
      fly(composer, T.chrome + 0.2, 0.8, 5);
      // The rails: drawn back from the slots into the dark, a light running
      // in along each with its part, gone once the part has landed.
      railSpecs.forEach((r, k) => {
        const end = land.get(r.part) ?? T.assembled;
        const y = wy(r.part.rect.y);
        const from = V(wx(r.x), y, 0.06), to = V(wx(r.x), y, -DEEP);
        const draw = smooth(prog(t, T.rails + (k % 12) * 0.04, T.rails + 0.9 + (k % 12) * 0.04));
        const z = r.part.g.position.z;
        depthRails[k].draw(straight(from, to), { a: 0, b: draw, width: 0.014, bright: 0.7, opacity: 1 - smooth(prog(t, end - 0.1, end + 0.35)),
          pulse: (s) => 1.6 * Math.exp(-(((s - clamp01(-z / DEEP)) / 0.025) ** 2)) });
      });
      // The grid draws back to the dividers and fades as the app completes.
      grid.forEach((rb, k) => {
        const back = smooth(prog(t, T.chrome + k * 0.04, T.assembled - 0.3));
        rb.draw(morph(GRID[k].ext, GRID[k].ui, back, 0.0), { width: 0.026, bright: 0.85, opacity: 1 - smooth(prog(t, T.chrome + 0.5, T.assembled)) });
      });
      return cam;
    }

    // ===== 3 — the community in motion =========================================
    if (t < T.explode) {
      for (const p of Object.values(panel)) p.rest(1);
      parts.forEach((p) => p.rest(1));
      railSep.rest(1);
      // Rail icons leave the rail one by one: out, a full turn, back.
      tokens.forEach((tk, i) => {
        tk.set(1);
        tk.g.scale.setScalar(1);
        if (i === 2) return;
        const a = stag(t, T.pop, i, 0.1, 0.95);
        const e = ease.inOutSine(a);
        tk.g.position.copy(tk.home).add(V(0.55 * bump(a), 0, 0.85 * bump(a)));
        tk.g.rotation.set(0, Math.PI * 2 * e, 0.0);
      });
      // The active space's icon flies to its channel list, turns there, returns.
      {
        const tk = tokens[2];
        const go = glide(prog(t, T.dd, T.dd + 0.85)), back = glide(prog(t, T.louver + 0.7, T.louver + 1.5));
        const dock = V(wx(250), wy(24), 0.75);
        const out = tk.home.clone().lerp(dock, go).add(V(0, 0.35 * bump(go), 0.6 * bump(go)));
        tk.g.position.copy(out.lerp(tk.home, back)).add(V(0, 0, 0.6 * bump(back)));
        tk.g.rotation.set(0, Math.PI * 2 * (go + back), 0);
      }
      // Channel rows lift into louvers; their top edges run out across the space.
      rows.forEach((r, k) => {
        const a = smooth(stag(t, T.louver, k, 0.05, 0.6)) * (1 - glide(stag(t, T.louverClose, rows.length - 1 - k, 0.035, 0.55)));
        r.at(r.home.clone().add(V(0, 0, (0.35 + 0.09 * k) * a)), V(-0.55 * a, 0, 0));
        const top = V(wx(72), wy(r.rect.y), r.home.z + (0.35 + 0.09 * k) * a + 0.01);
        const run = smooth(stag(t, T.louver + 0.2, k, 0.05, 0.7)) * (1 - smooth(stag(t, T.louverClose - 0.2, rows.length - 1 - k, 0.03, 0.5)));
        rules[k].draw(straight(top, top.clone().add(V(30, 0, 0))), { a: 0, b: run, width: 0.016, bright: 0.9, opacity: run > 0.001 ? 1 : 0,
          pulse: (s) => 1.2 * Math.exp(-(((s - (t - T.louver) * 0.5) / 0.03) ** 2)) });
      });
      // A ripple runs down the conversation.
      strata.forEach((s, k) => {
        const a = stag(t, T.ripple, k, 0.08, 0.7);
        s.at(s.home.clone().add(V(0, 0, 0.42 * bump(a))), V(-0.12 * bump(a), 0, 0));
      });
      // Typing in the real composer.
      const n = L.typed.length;
      showTyped(Math.round(clamp01((t - T.type) / (T.typed - T.type)) * n));
      composer.at(composer.home.clone().add(V(0, 0, 0.12 * smooth(prog(t, T.type - 0.4, T.type)) * (1 - smooth(prog(t, T.typed, T.explode))))));
      return cam;
    }

    // ===== 4 — familiar, transformed =============================================
    if (t < T.converge) {
      // (Pieces, not the whole capture: the composer keeps the typed line.)
      exploded(smooth(prog(t, T.explode, T.pull + 0.3)) * (1 - ease.inOutCubic(prog(t, T.pull + 0.6, T.whole))));
      showTyped(L.typed.length);
      // The grid returns, quiet, running past the window into the dark.
      grid.forEach((rb, k) => {
        const a = smooth(prog(t, T.pull + 0.4 + k * 0.05, T.whole));
        rb.draw(GRID[k].ext, { a: 0.5 - 0.5 * a, b: 0.5 + 0.5 * a, width: 0.03, bright: 0.55, opacity: a });
      });
      // A FAMILIAR / FEELING. drops out of the window's bottom line, then hands
      // its letters to A NEW HOME.
      const y0 = wy(900) - 0.06;
      for (const w of [words.fam1, words.fam2, words.home]) w.z = 0.3;
      const swapT = T.swap;
      const sw = (tt) => tt >= swapT;
      const famIn = T.familiar;
      emerge(words.fam1, { x: 0, y0, baseline: y0 - 0.25 - 1.42 * 0.73, dir: -1, inT: famIn, t });
      emerge(words.fam2, { x: 0, y0, baseline: y0 - 0.25 - 1.42 * 0.73 - 1.42 * 1.05, dir: -1, inT: famIn + 0.25, t });
      emerge(words.home, { x: 0, y0, baseline: y0 - 0.25 - 1.42 * 0.73 - 0.6, dir: -1, inT: swapT + 0.25, outT: T.homeOut - 0.3, t });
      if (sw(t)) {
        // Handed letters leave the old lines; the rest withdraw up into the line.
        famLetters.forEach((ol, j) => {
          if (handoff.includes(j)) { ol.g.visible = false; return; }
          const d = ease.inCubic(stag(t, swapT, j, 0.02, 0.45));
          ol.g.position.y = ol.y + d * 2.4;
          ol.g.visible = d < 1;
        });
        // ...and travel, in depth, to their places in the new line (letters
        // with no match drop out of the line, as above).
        if (t < T.homeOut - 0.3) words.home.letters.forEach((nl, k) => {
          const j = handoff[k];
          if (j < 0) return;
          const ol = famLetters[j];
          const from = ol.word.group.position.clone().add(V(ol.x, ol.y, 0)).sub(words.home.group.position);
          const m = ease.inOutCubic(stag(t, swapT, k, 0.05, 0.75));
          const p = from.lerp(V(nl.x, nl.y, 0), m);
          p.z += 0.9 * bump(m);
          nl.g.position.copy(p);
          nl.g.rotation.set(0, 0.6 * bump(m) * (k % 2 ? 1 : -1), 0);
          nl.g.visible = true;
        });
      } else {
        words.home.group.visible = false;
      }
      return cam;
    }

    // ===== 5 — everything becomes Disband =========================================
    const toward = V(0, 0.3, -1.0);
    const contract = (p, k, n, a = 1) => {
      const c = ease.inOutCubic(stag(t, T.converge, k, 1.0 / n, 1.6));
      p.at(p.home.clone().lerp(toward, c), null, Math.max(1e-3, 1 - c), a * (1 - c * c));
    };
    const form = (tt) => smooth(prog(tt, T.fill, T.formed));
    if (t < T.settle) {
      const pieces = [...parts, railSep, ...Object.values(panel)].sort((a, b) => b.home.length() - a.home.length());
      pieces.forEach((p, k) => contract(p, k, pieces.length));
      // Tokens fly into the mark and are absorbed as the fill passes them.
      tokens.forEach((tk, i) => {
        const go = glide(stag(t, T.converge + 0.4, i, 0.12, 1.5));
        const slot = markSlots[i];
        const path = tk.home.clone().lerp(slot, go).add(V(0, 0, 3.0 * bump(go)));
        const fillY = lerp(MARK_POS.y - MARK_H / 2, MARK_POS.y + MARK_H / 2, form(t));
        const gone = smooth((fillY - slot.y + 0.3) / 0.6);
        tk.g.position.copy(path);
        tk.g.rotation.set(0, Math.PI * 3 * go, 0);
        tk.g.scale.setScalar(Math.max(1e-3, lerp(1, 0.7, go) * (1 - gone)));
        tk.set(1);
      });
      // The grid lines draw back to the window's dividers as the app
      // contracts, then fly in and bend into the mark's outline.
      grid.forEach((rb, k) => {
        const back = ease.inOutCubic(prog(t, T.converge, T.converge + 1.0));
        const m = prog(t, T.converge + 0.9 + k * 0.09, T.contour - 0.2 + k * 0.04);
        const fade = 1 - smooth(prog(t, T.formed, T.formed + 0.7));
        const curve = m > 0 ? morph(GRID[k].ui, arcs[k], m, 0.3) : GRID[k].reach(1 - back);
        rb.draw(curve, { width: 0.03, bright: 0.85 + 0.9 * bump(prog(t, T.contour - 0.2, T.formed + 0.2)), opacity: fade });
      });
      // The mark fills from below; a bar of light rides the fill line.
      markGroup.visible = t >= T.fill - 0.05;
      const fy = lerp(MARK_POS.y - MARK_H / 2 - 0.05, MARK_POS.y + MARK_H / 2 + 0.05, form(t));
      mark.fillClip.constant = fy;
      mark.mat.envMapRotation.set(0, lerp(-1.3, 1.3, ease.inOutSine(prog(t, T.highlight, T.highlight + 1.1))), 0);
      markGroup.rotation.set(0, 0.06 * Math.sin((t - T.formed) * 0.9) * smooth(prog(t, T.formed, T.formed + 1)), 0);
      const fillBar = form(t) > 0 && form(t) < 1;
      const baseY = MARK_POS.y - MARK_H / 2 - 0.55;
      const by = fillBar ? fy : lerp(fy, baseY, glide(prog(t, T.formed, T.name - 0.05)));
      const half = fillBar ? 1.75 : lerp(1.75, 2.6, glide(prog(t, T.formed, T.name)));
      base.draw(straight(V(-half, by, MARK_POS.z + mark.front + 0.05), V(half, by, MARK_POS.z + mark.front + 0.05)), {
        width: 0.03, bright: 1.3, opacity: smooth(prog(t, T.fill - 0.1, T.fill + 0.1)) });
      // DISBAND and the slogan drop out of that line.
      words.name.z = MARK_POS.z + mark.front; words.slogan.z = MARK_POS.z + mark.front;
      emerge(words.name, { x: 0, y0: baseY - 0.03, baseline: baseY - 0.2 - 0.95 * 0.73, dir: -1, inT: T.name, stagger: 0.06, dur: 0.6, outT: T.settle - 0.05, t });
      emerge(words.slogan, { x: 0, y0: baseY - 0.03, baseline: baseY - 0.2 - 0.95 * 0.73 - 0.75, dir: -1, inT: T.slogan, stagger: 0.012, dur: 0.5, outT: T.settle, t });
      return cam;
    }

    // ===== 6 — the invitation ===================================================
    const up = ease.inOutCubic(prog(t, T.settle, T.settle + 0.9));
    markGroup.visible = true;
    mark.fillClip.constant = 1e6;
    const RAISE = 0.45;
    markGroup.position.copy(MARK_POS).add(V(0, RAISE * up, 0));
    markGroup.scale.setScalar(lerp(1, 0.86, up));
    markGroup.rotation.set(0, 0.06 * Math.sin((t - T.formed) * 0.9) * (1 - smooth(prog(t, T.settle, T.endHold))), 0);
    mark.mat.envMapRotation.set(0, 1.3, 0);
    // The app, re-formed far behind, as soft layers.
    const back = smooth(prog(t, T.settle + 0.2, T.settle + 1.4));
    exploded(0.8, 0.13 * back, -12, 2.6);
    // The line moves under the mark; the invitation drops out of it.
    const baseY0 = MARK_POS.y - MARK_H / 2 - 0.55;
    const baseY1 = MARK_POS.y + RAISE - MARK_H * 0.43 - 0.55;
    const by = lerp(baseY0, baseY1, up);
    base.draw(straight(V(-2.6, by, MARK_POS.z + mark.front + 0.05), V(2.6, by, MARK_POS.z + mark.front + 0.05)), { width: 0.03, bright: 1.1, opacity: 1 });
    words.cta.z = MARK_POS.z + mark.front; words.url.z = MARK_POS.z + mark.front;
    emerge(words.cta, { x: 0, y0: by - 0.03, baseline: by - 0.2 - 0.62 * 0.73, dir: -1, inT: T.cta, stagger: 0.025, t });
    emerge(words.url, { x: 0, y0: by - 0.03, baseline: by - 0.2 - 0.62 * 0.73 - 1.55, dir: -1, inT: T.url, stagger: 0.04, dur: 0.6, t });
    return cam;
  }

  return {
    pose,
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      const fast = (t > T.unstack && t < T.lock + 0.4) || (t > T.enter && t < T.assembled) || (t > T.track && t < T.type) ||
        (t > T.explode && t < T.whole) || (t > T.swap && t < T.swap + 1) || (t > T.converge && t < T.formed + 0.3);
      // Thin lines in fast motion need more samples to blur rather than strobe.
      if ((t > T.organize && t < T.lock + 0.9) || (t > T.converge + 0.3 && t < T.contour + 0.2)) return 16;
      return fast ? 10 : 8;
    },
  };
}
