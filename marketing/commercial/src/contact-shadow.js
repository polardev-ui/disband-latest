// Baked contact shadow: the device is rendered once from beneath with a
// height-to-darkness material, blurred, and laid on the floor as a texture
// parented to the device. Under soft overhead studio light that is what the
// real shadow looks like, and it costs one textured quad per sample instead of
// a shadow map lookup across half the frame.
import * as THREE from "three";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

export function bakeContactShadow(renderer, object, { floorY, width, depth, height = 24, blur = 3.2, darkness = 1.4, opacity = 0.55, res = 512 }) {
  const w = res, h = Math.round(res * (depth / width));
  const rt = new THREE.WebGLRenderTarget(w, h);
  const rtBlur = new THREE.WebGLRenderTarget(w, h);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;

  const scene = new THREE.Scene();
  const parent = object.parent;
  const saved = { pos: object.position.clone(), quat: object.quaternion.clone(), visible: object.visible };
  object.position.set(0, 0, 0);
  object.quaternion.identity();
  object.visible = true;
  scene.add(object);
  object.updateMatrixWorld(true);

  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  cam.position.set(0, floorY, 0);
  cam.rotation.x = Math.PI / 2; // look straight up from the floor

  const depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depthMat.userData.darkness = { value: darkness };
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = depthMat.userData.darkness;
    shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
      "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
      "gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );",
    )}`;
  };
  depthMat.depthTest = depthMat.depthWrite = false;

  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, 0);
  scene.overrideMaterial = depthMat;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);

  // Two blur passes, the second lighter, as in three.js's contact-shadow example.
  const blurScene = new THREE.Scene();
  const blurCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  const hMat = new THREE.ShaderMaterial(HorizontalBlurShader); hMat.depthTest = false;
  const vMat = new THREE.ShaderMaterial(VerticalBlurShader); vMat.depthTest = false;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hMat);
  blurScene.add(quad);
  const pass = (amount) => {
    quad.material = hMat;
    hMat.uniforms.tDiffuse.value = rt.texture;
    hMat.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtBlur);
    renderer.render(blurScene, blurCam);
    quad.material = vMat;
    vMat.uniforms.tDiffuse.value = rtBlur.texture;
    vMat.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(rt);
    renderer.render(blurScene, blurCam);
  };
  for (let i = 0; i < 3; i++) pass(blur);
  pass(blur * 0.4);

  renderer.setRenderTarget(null);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  scene.overrideMaterial = null;
  rtBlur.dispose();

  scene.remove(object);
  if (parent) parent.add(object);
  object.position.copy(saved.pos);
  object.quaternion.copy(saved.quat);
  object.visible = saved.visible;

  // Copy the result into an ordinary texture: sampling the render target's
  // own texture later did not render reliably on the software GL here.
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  rt.dispose();
  const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({
    color: 0x000000, map: tex, opacity, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  // Face up; the y flip maps image-top (world +z, as the upward-looking
  // bake camera saw it) to the right edge of the quad.
  plane.rotation.x = -Math.PI / 2;
  plane.scale.y = -1;
  plane.position.y = floorY + 0.02;
  plane.renderOrder = -1;
  object.add(plane);
  return plane;
}

// Broad, faint occlusion under a device: an elliptical falloff that reaches
// exactly zero at its edge, so the quad's outline can never show.
export function softBlob(object, { floorY, width, depth, opacity = 0.35, offsetZ = 0 }) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const dx = (x + 0.5) / 128 - 1, dy = (y + 0.5) / 128 - 1;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = r >= 1 ? 0 : Math.pow(1 - r * r, 2.2);
      const i = (y * 256 + x) * 4;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({
    color: 0x000000, map: tex, opacity, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, floorY + 0.01, offsetZ);
  plane.renderOrder = -2;
  object.add(plane);
  return plane;
}
