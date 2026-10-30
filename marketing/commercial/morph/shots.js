// The 3D for "The Way It Used to Feel." One continuous scene, a pure function
// of time. Every surface is a crop of the real classic UI (build/morph/*.png,
// 1440×900 at 3×) placed by its measured rectangle, so each morph starts and
// ends on the exact interface. World units are CSS px / 100; the window sits
// at the origin facing +z.
//   1  a point of light opens into the mark's hull, which turns, empties to an
//      outline and splits; its edges become the window's frame as the six
//      regions of the app snap in;
//   2  the rail's items leave as a horizontal strip, travel, turn over into the
//      channel rows and drop into the column; the camera runs down the list and
//      through the column edge into the chat;
//   3  the window in bands cut at the message edges: they fan, flip and close
//      as the direct-message view;
//   4  the DM view breaks into regions that flip in flight and converge as the
//      whole app; the camera arcs;
//   5  the app folds in on itself twice into one block, which turns once and,
//      edge-on, becomes the mark;
//   6  the mark rises; the app sits far behind it, soft.
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { T } from "./timeline.js";
import { prog, lerp, ease, clamp01 } from "../src/ease.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const VW = 1440, VH = 900, U = 100;
const TAN = Math.tan(Math.PI / 12);
const WVIS = 2 * TAN * (1080 / 1920), HVIS = 2 * TAN;
const home = (r) => V((r.x + r.w / 2) / U - VW / 2 / U, VH / 2 / U - (r.y + r.h / 2) / U, 0);
const wx = (cssX) => cssX / U - VW / 2 / U;
const snapE = ease.bezier(0.25, 0.9, 0.3, 1.06);     // lands with a hair of overshoot
const glide = ease.bezier(0.6, 0, 0.2, 1);

function darkStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const strip = (w, h, k) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
  const place = (m, x, y, z) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m); };
  place(strip(2.4, 46, 16), -36, 8, -22);
  place(strip(1.8, 40, 11), 38, 4, -26);
  place(strip(1.0, 44, 60), -20, 4, 40);
  place(strip(34, 12, 0.45), 0, 40, 12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  return env;
}

// A w×h plane whose UVs cover `rect` of a 1440×900 capture.
function uvPlane(w, h, rect) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const u0 = rect.x / VW, u1 = (rect.x + rect.w) / VW, v0 = 1 - (rect.y + rect.h) / VH, v1 = 1 - rect.y / VH;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
  return g;
}

/**
 * A tile: a crop of one capture on the front, optionally a crop of another on
 * the back, on a thin dark slab so turning tiles have real edges. `backRot` is
 * the back face's own rotation (a half-turn of the tile about the same axis
 * shows it upright); `backFit` squeezes a differently sized back crop to the
 * front's width, for tiles that change size as they turn.
 */
function makeTile(env, tex, rect, { back = null, backRect = null, backRot = [0, Math.PI, 0], backFit = false, slab = true } = {}) {
  const w = rect.w / U, h = rect.h / U;
  const g = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
  const front = new THREE.Mesh(uvPlane(w, h, rect), fm);
  front.position.z = 0.011;
  g.add(front);
  let bodyMat = null;
  if (slab) {
    bodyMat = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.3, roughness: 0.3, envMap: env, envMapIntensity: 1.2, transparent: true });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), bodyMat));
  }
  let backMesh = null;
  const br = backRect ?? rect;
  if (back) {
    backMesh = new THREE.Mesh(uvPlane(br.w / U, br.h / U, br), new THREE.MeshBasicMaterial({ map: back, toneMapped: false, transparent: true }));
    backMesh.position.z = -0.011;
    backMesh.rotation.set(...backRot);
    if (backFit) backMesh.scale.x = rect.w / br.w;
    g.add(backMesh);
  }
  const setOpacity = (a) => {
    fm.opacity = a; if (bodyMat) bodyMat.opacity = a; if (backMesh) backMesh.material.opacity = a;
    g.visible = a > 0.002;
  };
  return { g, front, back: backMesh, rect, w, h, home: home(rect), backHome: home(br), fitX: br.w / rect.w, setOpacity };
}

const HULL = [[0.5, 0], [1, 0.77], [0.5, 1], [0, 0.77]];
async function makeMark3D(height, env) {
  const svg = await fetch("../assets/logo/disband-mark.svg").then((r) => r.text());
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p));
  let g = new THREE.ExtrudeGeometry(shapes, { depth: 200, bevelEnabled: true, bevelThickness: 24, bevelSize: 14, bevelSegments: 5, curveSegments: 24 });
  if (g.index) g = g.toNonIndexed();
  g.center();
  const s = height / 2142;
  g.scale(s, -s, s); // SVG y runs down; the mirror flips the winding back below
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const v = a.array[(i + 1) * n + k]; a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k]; a.array[(i + 2) * n + k] = v; }
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6a6c70, metalness: 0.2, roughness: 0.3, envMap: env, envMapIntensity: 2.4 }));
}

function glowSprite(size) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.2, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, depthWrite: false }));
}

export async function createShots(engine) {
  const { scene, renderer } = engine;
  const env = darkStudio(renderer);
  const tex = { main: await engine.texture("../build/morph/main.png"), dm: await engine.texture("../build/morph/dm.png") };
  const box = await fetch("../build/morph/main.json").then((r) => r.json());
  const root = new THREE.Group();
  scene.add(root);
  const tiles = [];
  const add = (t, parent = root) => { parent.add(t.g); tiles.push(t); return t; };

  // The whole window in each state, for the moments nothing is in pieces.
  const FULL = { x: 0, y: 0, w: VW, h: VH };
  const whole = { main: add(makeTile(env, tex.main, FULL)), dm: add(makeTile(env, tex.dm, FULL)) };

  // Regions of each view: rail, left column, chat header / body / composer,
  // right column (the member list in a space, the profile in a DM).
  const REG = [
    { x: 0, y: 0, w: 72, h: 900 }, { x: 72, y: 0, w: 240, h: 900 },
    { x: 312, y: 0, w: 888, h: 48 }, { x: 312, y: 48, w: 888, h: 764 }, { x: 312, y: 812, w: 888, h: 88 },
    { x: 1200, y: 0, w: 240, h: 900 },
  ];
  const DREG = [
    { x: 0, y: 0, w: 72, h: 900 }, { x: 72, y: 0, w: 240, h: 900 },
    { x: 312, y: 0, w: 788, h: 48 }, { x: 312, y: 48, w: 788, h: 764 }, { x: 312, y: 812, w: 788, h: 88 },
    { x: 1100, y: 0, w: 340, h: 900 },
  ];
  const regions = REG.map((r) => add(makeTile(env, tex.main, r)));
  // DM regions with the matching main region on the back, squeezed to fit.
  const conv = DREG.map((r, i) => add(makeTile(env, tex.dm, r, { back: tex.main, backRect: REG[i], backFit: true })));

  // ---- 2: rail items → channel rows ------------------------------------------
  const rail = box.rail.map((it) => ({ x: 0, y: it.y - 4, w: 72, h: 56 }));
  const rows = box.channels.filter((c) => c.y < 800).map((c) => ({ x: 72, y: c.y, w: 240, h: c.h }));
  const NC = Math.max(rail.length, rows.length);
  // The row on each cell's back stands on end (a quarter turn), so the turned
  // strip reads as a row of bars; the fold lays each bar down into its row.
  const cells = Array.from({ length: NC }, (_, i) => {
    const front = rail[i] ?? rail[rail.length - 1];
    const t = add(makeTile(env, tex.main, front, { back: tex.main, backRect: rows[i], backRot: [Math.PI, 0, Math.PI / 2], slab: false }));
    if (!rail[i]) t.front.visible = false;
    return { t, from: rail[i] ? home(rail[i]) : null, to: home(rows[i]), bar: rows[i].h / U };
  });
  // The column underneath the rows: its lower part, and plain column colour
  // behind the rows, so landing rows never double up with themselves.
  const ROWS_END = rows[rows.length - 1].y + rows[rows.length - 1].h;
  const colLower = add(makeTile(env, tex.main, { x: 72, y: ROWS_END, w: 240, h: VH - ROWS_END }, { slab: false }));
  const colBed = new THREE.Mesh(new THREE.PlaneGeometry(2.4, ROWS_END / U), new THREE.MeshBasicMaterial({ color: 0x2b2d31, toneMapped: false, transparent: true }));
  colBed.position.set(wx(192), 4.5 - ROWS_END / U / 2, 0.004);
  root.add(colBed);
  // Plain rail colour where the rail's items leave from.
  const railBed = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 9), new THREE.MeshBasicMaterial({ color: 0x1e1f22, toneMapped: false, transparent: true }));
  railBed.position.set(wx(36), 0, 0.004);
  root.add(railBed);
  // The column edge the camera crosses.
  const boundary = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 9.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4), transparent: true, depthWrite: false }));
  boundary.position.set(wx(312), 0, 0.05);
  boundary.renderOrder = 10;   // drawn after the tiles it sits on (it writes no depth)
  root.add(boundary);

  // ---- 3: bands cut at the real message-group edges --------------------------
  const tops = box.messages.map((m) => m.y).filter((y) => y > 60);
  const ys = [0, 48, ...tops, Math.round(box.composer.y - 18), VH];
  const bands = ys.slice(0, -1).map((y, k) => add(makeTile(env, tex.main, { x: 0, y, w: VW, h: ys[k + 1] - y }, { back: tex.dm, backRot: [Math.PI, 0, 0] })));

  // ---- 5: the fold — hinged groups, so each fold is one rotation ------------
  const H1L = wx(312), H1R = wx(1200), H2 = wx(756);
  const F = {
    rail: { x: 0, y: 0, w: 72, h: 900 }, chan: { x: 72, y: 0, w: 240, h: 900 },
    chatL: { x: 312, y: 0, w: 444, h: 900 }, chatR: { x: 756, y: 0, w: 444, h: 900 }, mem: { x: 1200, y: 0, w: 240, h: 900 },
  };
  const block = new THREE.Group();
  root.add(block);
  const pivot = (parent, worldHinge, parentWorld) => { const p = new THREE.Group(); p.position.copy(worldHinge).sub(parentWorld); parent.add(p); return { p, world: worldHinge }; };
  const ft = {};
  // Backs carry crops of the DM view, so each fold turns up more of the app
  // and the folded block is UI on both faces, never a blank slab.
  const FB = {
    rail: { x: 0, y: 0, w: 72, h: 900 }, chan: { x: 72, y: 0, w: 240, h: 900 },
    chatL: { x: 996, y: 0, w: 444, h: 900 }, chatR: { x: 312, y: 0, w: 444, h: 900 }, mem: { x: 1100, y: 0, w: 240, h: 900 },
  };
  const put = (key, holder) => { const t = makeTile(env, tex.main, F[key], { back: tex.dm, backRect: FB[key] }); t.g.position.copy(t.home).sub(holder.world); holder.p.add(t.g); ft[key] = t; };
  const origin = { p: block, world: V(0, 0, 0) };
  const pivL = pivot(block, V(H1L, 0, 0.03), V(0, 0, 0));
  const piv2 = pivot(block, V(H2, 0, 0.09), V(0, 0, 0));
  const pivR = pivot(piv2.p, V(H1R, 0, 0.03), piv2.world);
  put("rail", pivL); put("chan", pivL); put("chatL", origin); put("chatR", piv2); put("mem", pivR);
  const BLOCK_CX = (wx(312) + H2) / 2;

  // ---- 1: the hull of the mark, filled, then as four edges -------------------
  const KH = 6.0, KW = KH * (1905 / 2142);
  const P = HULL.map(([x, y]) => V((x - 0.5) * KW, (0.5 - y) * KH, 0));
  const outline = new THREE.Group();
  root.add(outline);
  const hullShape = new THREE.Shape(P.map((p) => new THREE.Vector2(p.x, p.y)));
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(hullShape), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.25, 1.25), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  outline.add(fill);
  const BORDER = [
    { mid: V(0, 4.5, 0), ang: 0, len: 14.4 }, { mid: V(7.2, 0, 0), ang: -Math.PI / 2, len: 9 },
    { mid: V(0, -4.5, 0), ang: Math.PI, len: 14.4 }, { mid: V(-7.2, 0, 0), ang: Math.PI / 2, len: 9 },
  ];
  const edges = P.map((a, i) => {
    const b = P[(i + 1) % 4];
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.7, 1.7), transparent: true, depthWrite: false }));
    outline.add(m);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    let to = BORDER[i].ang;
    while (to - ang > Math.PI) to -= 2 * Math.PI;
    while (to - ang < -Math.PI) to += 2 * Math.PI;
    return { m, mid: a.clone().add(b).multiplyScalar(0.5), len: a.distanceTo(b), ang, to, nrm: V(Math.cos(ang - Math.PI / 2), Math.sin(ang - Math.PI / 2), 0), border: BORDER[i] };
  });
  const point = glowSprite(1.4);
  outline.add(point);
  outline.traverse((o) => { if (o.isMesh) o.renderOrder = 10; });

  // ---- the mark ------------------------------------------------------------------
  const mark = await makeMark3D(3.5, env);
  root.add(mark);

  const hideAll = () => {
    tiles.forEach((t) => (t.g.visible = false));
    outline.visible = mark.visible = boundary.visible = colBed.visible = railBed.visible = false;
    block.visible = false;
  };
  const reset = (t, a = 1) => { t.g.position.copy(t.home); t.g.rotation.set(0, 0, 0); t.g.scale.set(1, 1, 1); t.setOpacity(a); };

  // Camera on a CSS-px point of the window: `regionW` css px fill `fill` of
  // the frame width (or distance `d`); yaw/pitch orbit about the point; `lift`
  // moves the content up the frame (fraction of frame height).
  function frame(cx, cy, regionW, { fill = 0.95, yaw = 0, pitch = 0, lift = 0, d, z = 0 } = {}) {
    const dist = d ?? (regionW / U) / (WVIS * fill);
    const target = V(wx(cx), 4.5 - cy / U, z).add(V(0, -lift * HVIS * dist, 0));
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    return { pos: target.clone().addScaledVector(dir, dist), target, dist };
  }
  const orbit = (target, dist, yaw, pitch = 0) => ({ target, dist, pos: target.clone().addScaledVector(V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), dist) });
  const blend = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), target: a.target.clone().lerp(b.target, k), dist: lerp(a.dist, b.dist, k) });
  const cam = (f, extra = {}) => ({ pos: f.pos, target: f.target, fov: 30, aperture: 0.04, focus: f.dist, ...extra });
  const jolt = (t, at, amp) => (t > at ? Math.exp(-(t - at) * 14) * Math.sin((t - at) * 70) * amp : 0);
  const shaken = (f, s) => { f.pos.y += s; f.target.y += s; return f; };

  // Scene 2 geometry: the strip of rail items, then of standing rows.
  const STRIP_Y = 1.8;
  const xr = (i) => (i - (rail.length - 1) / 2) * 0.82;
  const barW = cells.map((c) => c.bar + 0.07);
  const barSum = barW.reduce((a, b) => a + b, 0);
  const xt = barW.map((w, i) => barW.slice(0, i).reduce((a, b) => a + b, 0) + w / 2 - barSum / 2);
  const fRail = frame(150, 262, 300, { yaw: 0.08 });
  const fCol = frame(192, 210, 300, { yaw: -0.05 });
  const fChat = frame(650, 430, 620);
  const fDm = frame(706, 440, 800, { lift: -0.03 });   // the DM conversation, panel edge to panel edge
  const fWhole = (yaw, d = 50) => frame(720, 450, 0, { d, yaw, lift: -0.01 });

  function pose(t) {
    hideAll();

    // 1 — point → filled hull → outline → split → the window's frame; regions snap.
    if (t < T.railClose) {
      if (t < T.snap + 0.5) {
        outline.visible = true;
        const grow = ease.bezier(0.2, 0.9, 0.25, 1.1)(prog(t, T.point + 0.08, T.outline + 0.35));
        const empty = smooth(prog(t, T.outline + 0.45, T.traced + 0.15));
        const turn = ease.inOutSine(prog(t, T.point, T.split));
        const split = ease.outCubic(prog(t, T.split, T.assemble));
        const go = ease.inOutCubic(prog(t, T.assemble - 0.1, T.snap));
        outline.rotation.set(lerp(0.38, 0, turn) * (1 - go), lerp(-1.25, 0, turn) * (1 - go), 0);
        outline.position.set(0, 0, lerp(1.2, 0.04, go));
        point.material.opacity = smooth(prog(t, T.point, T.point + 0.1)) * (1 - smooth(prog(t, T.point + 0.15, T.outline + 0.2)));
        point.scale.setScalar(lerp(0.4, 1.5, smooth(prog(t, T.point, T.outline))));
        fill.visible = grow > 0.001 && empty < 0.999;
        fill.scale.setScalar(Math.max(0.001, grow));
        fill.material.opacity = 1 - empty;
        edges.forEach((e, i) => {
          const s = Math.max(0.001, grow);
          const kite = e.mid.clone().multiplyScalar(s).addScaledVector(e.nrm, 1.5 * split);
          e.m.position.copy(kite.lerp(e.border.mid, go));
          e.m.rotation.set(0, 0, lerp(e.ang + 0.25 * split * (i % 2 ? 1 : -1), e.to, go));
          e.m.scale.set(lerp(e.len * s, e.border.len, go), 1, 1);
          e.m.material.opacity = smooth(prog(t, T.outline + 0.2, T.traced)) * (1 - 0.85 * smooth(prog(t, T.snap + 0.05, T.snap + 0.5)));
        });
      }
      if (t < T.snap) {
        // The app's regions, glimpsed between the separating edges, fly in.
        const SCAT = [[-5, 2.5, -10, 0.7], [-2.5, -3.5, -14, -0.6], [3, 6, -9, 0.4], [1, 0.5, -16, -0.3], [2, -6.5, -8, 0.5], [6, 1.5, -12, -0.7]];
        regions.forEach((r, i) => {
          const a = snapE(prog(t, T.split + 0.15 + i * 0.05, T.snap));
          const s = SCAT[i];
          r.g.position.set(lerp(r.home.x + s[0], r.home.x, a), lerp(r.home.y + s[1], r.home.y, a), lerp(s[2], 0, a));
          r.g.rotation.set(lerp(s[3] * 0.5, 0, a), lerp(s[3], 0, a), lerp(s[3] * 0.2, 0, a));
          r.setOpacity(smooth(prog(t, T.split, T.split + 0.5)) * lerp(0.45, 1, smooth(prog(t, T.assemble, T.snap))));
        });
      } else {
        reset(whole.main);
      }
      let f;
      if (t < T.split) f = { pos: V(0, 0, lerp(30, 28, t / T.split)), target: V(0, 0, 0), dist: 29 };
      else if (t < T.snap) f = blend({ pos: V(0, 0, 28), target: V(0, 0, 0), dist: 28 }, fWhole(0, 50), ease.inOutCubic(prog(t, T.split, T.snap)));
      else if (t < 3.6) f = fWhole(lerp(0, 0.12, ease.inOutSine(prog(t, T.snap, 3.6))), lerp(50, 46, ease.outCubic(prog(t, T.snap, 3.6))));
      else f = blend(fWhole(0.12, 46), fRail, ease.inOutCubic(prog(t, 3.6, T.railClose)));
      return cam(shaken(f, jolt(t, T.snap, 0.18)), { aperture: 0.03 });
    }

    // 2 — rail → strip → standing rows → column; down the list; through the edge.
    if (t < T.chat) {
      const morph = t >= T.stretch && t < T.folded + 0.05;
      if (!morph) reset(whole.main);
      else {
        // The rest of the window stays, dimmed; the rail and column re-form.
        const dim = lerp(1, 0.06, smooth(prog(t, T.stretch, T.stretch + 0.5)));
        const back = smooth(prog(t, T.fold, T.folded));
        regions.forEach((r, i) => reset(r, i > 1 ? lerp(dim, 1, back) : 0));
        // The column dims with the rest and is gone before its rows land.
        reset(regions[1], dim * (1 - smooth(prog(t, T.fold, T.fold + 0.35))));
        reset(regions[0], smooth(prog(t, T.fold + 0.3, T.folded)));
        railBed.visible = true;
        railBed.material.opacity = lerp(dim, 1, back);
        const bed = smooth(prog(t, T.fold + 0.1, T.folded - 0.2));
        reset(colLower, bed);
        colBed.visible = bed > 0.002;
        colBed.material.opacity = bed;
        const travel = glide(prog(t, T.stretch, T.edge));
        const lift = ease.inOutCubic(prog(t, T.stretch, T.strip));
        const centre = V(lerp(-8.4, -2.6, travel), STRIP_Y, 1.4 * lift);
        cells.forEach((c, i) => {
          const tile = c.t;
          const st = ease.inOutCubic(prog(t, T.stretch + i * 0.03, T.stretch + 0.45 + i * 0.03));
          const tr = ease.inOutCubic(prog(t, T.turn + i * 0.03, T.turned - 0.25 + i * 0.03));
          const fd = glide(prog(t, T.fold + i * 0.035, T.fold + 0.45 + i * 0.035));
          const onStrip = centre.clone().add(V(lerp(xr(i), xt[i], tr), 0, 0));
          const p = (c.from ? c.from.clone().lerp(onStrip, st) : onStrip).lerp(c.to, fd);
          tile.g.position.copy(p);
          tile.g.rotation.set(Math.PI * tr, 0, (Math.PI / 2) * fd);
          tile.g.scale.set(1, 1, 1);
          tile.setOpacity(c.from ? 1 : smooth(prog(t, T.edge - 0.15, T.edge + 0.1)));
        });
      }
      boundary.visible = t > T.cross && t < T.chat;
      boundary.material.opacity = Math.sin(Math.PI * prog(t, T.cross, T.chat - 0.15));

      if (t < T.stretch) return cam(fRail);
      const travel = glide(prog(t, T.stretch, T.turned));
      const near = ease.inOutCubic(prog(t, T.turn, T.turned));
      const yawS = lerp(0.32, -0.1, travel);
      const fStrip = orbit(V(lerp(-6.2, -2.6, travel), STRIP_Y, 1.4), lerp(14.5, 16.5, near), yawS, 0.06);
      if (t < T.fold) return cam(blend(fRail, fStrip, ease.inOutCubic(prog(t, T.stretch, T.strip))), { aperture: 0.07 });
      if (t < T.travel) return cam(blend(fStrip, fCol, ease.inOutCubic(prog(t, T.fold, T.travel))), { aperture: 0.05 });
      if (t < T.cross) {
        const k = ease.inOutSine(prog(t, T.travel, T.cross));
        return cam(frame(192, lerp(210, 330, k), 300, { yaw: lerp(-0.05, 0.08, k) }));
      }
      const k = ease.inOutCubic(prog(t, T.cross, T.chat));
      const dip = Math.sin(Math.PI * k);
      const d = lerp(frame(192, 330, 300).dist, fChat.dist, k) - 2.2 * dip;
      return cam(frame(lerp(192, 650, k), lerp(330, 430, k), 0, { d, yaw: lerp(0.08, 0, k) + 0.22 * dip, pitch: -0.03 * dip }), { aperture: 0.05 });
    }

    // 3 — bands: fan out, flip in sequence, close up as the DM view.
    if (t < T.explode) {
      const banded = t >= T.bands && t < T.closed;
      if (!banded) reset(t < T.bands ? whole.main : whole.dm);
      else {
        const fan = ease.inOutCubic(prog(t, T.bands, T.fanned)) * (1 - glide(prog(t, T.close, T.closed)));
        const n = bands.length;
        bands.forEach((b, k) => {
          b.g.visible = true;
          b.setOpacity(1);
          const c = k - (n - 1) / 2;
          const fl = ease.inOutCubic(prog(t, T.flip + k * 0.085, T.flip + k * 0.085 + 0.5));
          b.g.position.set(b.home.x + c * 0.5 * fan, b.home.y + c * 0.2 * fan, -c * 1.25 * fan);
          b.g.rotation.set(Math.PI * fl - 0.04 * c * fan, 0.2 * fan, 0);
        });
      }
      const fBand0 = frame(690, 430, 540, { yaw: -0.06 });
      if (t < T.bands) return cam(blend(fChat, fBand0, ease.inOutSine(prog(t, T.chat, T.bands))));
      if (t < T.closed) {
        const fan = ease.inOutCubic(prog(t, T.bands, T.fanned));
        const close = glide(prog(t, T.close, T.closed));
        const wide = frame(lerp(690, 820, fan), lerp(430, 450, fan), 0, { d: lerp(fBand0.dist, 33, fan), yaw: lerp(-0.06, 0.62, fan), pitch: 0.18 * fan });
        return cam(shaken(blend(wide, fDm, close), jolt(t, T.closed - 0.04, 0.12)), { aperture: 0.06 });
      }
      const k = ease.inOutSine(prog(t, T.closed, T.explode));
      return cam(frame(lerp(706, 712, k), 440, lerp(800, 750, k), { lift: -0.03, yaw: 0.06 * k }));
    }

    // 4 — the DM view breaks into regions that flip to the main view and converge.
    if (t < T.foldIn) {
      if (t < T.whole) {
        const out = ease.outCubic(prog(t, T.explode, T.converge));
        const back = snapE(prog(t, T.converge, T.whole));
        const e = out * (1 - back);
        const DIR = [[-6, 2.5, 7], [-3.5, -3, 11], [1.5, 6, 9], [0, -0.5, 14], [2.5, -6.5, 8], [7, 2.5, 10]];
        conv.forEach((c, i) => {
          c.setOpacity(1);
          const fl = ease.inOutCubic(prog(t, T.explode + 0.15 + i * 0.06, T.converge + 0.3 + i * 0.06));
          const hm = c.home.clone().lerp(c.backHome, fl);
          const d = DIR[i];
          c.g.position.set(hm.x + d[0] * e, hm.y + d[1] * e, d[2] * e);
          c.g.rotation.set(0.35 * e * (i % 2 ? 1 : -1), Math.PI * fl, 0.12 * e * (i % 2 ? -1 : 1));
          c.g.scale.set(lerp(1, c.fitX, fl), 1, 1);
        });
        const pull = ease.outCubic(prog(t, T.explode, T.converge + 0.2));
        return cam(blend(frame(712, 440, 750, { lift: -0.03, yaw: 0.06 }), fWhole(-0.5, 56), pull), { aperture: 0.03 });
      }
      // While the camera arcs, the regions part slightly in depth, so the app
      // reads as layers; they close up before the fold.
      const sep = smooth(prog(t, T.whole + 0.4, T.familiar + 0.9)) * (1 - smooth(prog(t, T.nextOut - 0.5, T.foldIn - 0.05)));
      if (sep < 0.001) reset(whole.main);
      else regions.forEach((r, i) => { reset(r); r.g.position.z = [0.9, 0.45, 1.2, 0, 1.2, 0.6][i] * sep; });
      const arc = ease.inOutSine(prog(t, T.whole, T.nextOut + 0.2));
      const f = fWhole(lerp(-0.5, 0.42, arc), lerp(56, 47, ease.outCubic(prog(t, T.whole, T.nextOut))));
      return cam(shaken(f, jolt(t, T.whole, 0.15)), { aperture: 0.03 });
    }

    // 5 — fold, fold again, turn once; edge-on, the block becomes the mark.
    if (t < T.settle) {
      const markOn = t >= T.markEdge;
      if (!markOn) {
        block.visible = true;
        Object.values(ft).forEach((tl) => { tl.g.visible = true; tl.setOpacity(1); });
        const f1 = ease.inOutCubic(prog(t, T.foldIn, T.fold2));
        const f2 = ease.inOutCubic(prog(t, T.fold2 - 0.05, T.block));
        const spin = ease.inCubic(prog(t, T.spin, T.markEdge));
        pivL.p.rotation.y = Math.PI * f1;
        pivR.p.rotation.y = -Math.PI * f1;
        piv2.p.rotation.y = -Math.PI * f2;
        // Recentre on the folded block, shrink, and spin about its own centre.
        const s = lerp(1, 0.42, ease.inOutCubic(prog(t, T.fold2, T.markEdge)));
        const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 1.5 * Math.PI * spin);
        block.quaternion.copy(q);
        block.scale.setScalar(s);
        block.position.copy(V(-BLOCK_CX * f2, 0, -0.1 * f2).multiplyScalar(s).applyQuaternion(q));
      }
      mark.visible = markOn;
      if (markOn) {
        const settle = ease.outCubic(prog(t, T.markEdge, T.mark));
        const sway = t > T.mark ? 0.07 * Math.sin((t - T.mark) * 0.9) : 0;
        mark.position.set(0, 0, 0);
        mark.rotation.set(0, lerp(-Math.PI / 2, 0, settle) + sway, 0);
        mark.scale.setScalar(lerp(0.9, 1, settle));
        mark.material.envMapRotation.set(0, lerp(-1.2, 1.3, ease.inOutSine(prog(t, T.highlight, T.highlight + 1.0))), 0);
      }
      const k = ease.inOutCubic(prog(t, T.foldIn, T.block));
      const f = fWhole(lerp(0.42, 0.6, k), lerp(47, 38, k));
      const fm = { pos: V(0, -0.4, 30), target: V(0, -0.4, 0), dist: 30 };
      return cam(shaken(blend(f, fm, ease.inOutCubic(prog(t, T.fold2, T.markEdge))), jolt(t, T.mark - 0.05, 0.1)), { aperture: 0.02 });
    }

    // 6 — the mark rises; the app far behind it, soft.
    const up = ease.inOutCubic(prog(t, T.settle, T.settle + 0.9));
    mark.visible = true;
    mark.position.set(0, lerp(0, 2.0, up), 0);
    mark.rotation.set(0, 0.07 * Math.sin((t - T.mark) * 0.9) * (1 - smooth(prog(t, T.settle, T.endHold))), 0);
    mark.scale.setScalar(lerp(1, 0.84, up));
    mark.material.envMapRotation.set(0, 1.3, 0);
    reset(whole.main, 0.17 * smooth(prog(t, T.settle, T.settle + 1.2)));
    whole.main.g.position.set(0, 4.6, -34);
    return { pos: V(0, -0.4, 30), target: V(0, -0.4, 0), fov: 30, aperture: lerp(0.02, 0.2, up), focus: 30 };
  }

  return {
    pose,
    samplesFor(t) {
      if (window.PREVIEW) return 3;
      const fast = (t > T.split && t < T.snap + 0.15) || (t > T.stretch && t < T.folded) || (t > T.cross && t < T.chat) ||
        (t > T.bands && t < T.closed) || (t > T.explode && t < T.whole + 0.15) || (t > T.foldIn && t < T.mark);
      return fast ? 10 : 7;
    },
  };
}
