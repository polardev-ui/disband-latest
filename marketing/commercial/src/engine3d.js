// Offline 3D renderer for the product shots.
//
// Each video frame is the average of several renders ("samples") taken with a
// jittered sub-pixel offset, a point on the lens aperture and a moment inside
// the shutter interval. Averaging those gives anti-aliasing, true thin-lens
// depth of field and motion blur from one mechanism, and it is deterministic,
// so any frame can be re-rendered on its own.
//
// Samples are rendered with a transparent background into a linear float
// target, averaged, tone mapped, then composited over pure white so the
// studio background is exactly #FFFFFF and matches the typography scenes.
import * as THREE from "three";
import { studioEnvironment } from "./studio-env.js";

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class Engine3D {
  constructor(canvas, width = 1920, height = 1080) {
    this.width = width;
    this.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    // Accumulation renders into the same target repeatedly; clears are explicit.
    renderer.autoClear = false;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(renderer);
    this.scene.environmentIntensity = 1.0;

    this.camera = new THREE.PerspectiveCamera(30, width / height, 5, 2000);

    // Key light for shading definition; floor shadows are baked per device
    // (contact-shadow.js), which is far cheaper than a shadow map here.
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-30, 120, 60);
    this.scene.add(key, key.target);
    this.key = key;

    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true };
    // No MSAA: the jittered sample accumulation already anti-aliases, and
    // multisample resolves are expensive on a software GL.
    this.sampleRT = new THREE.WebGLRenderTarget(width, height, rtOpts);
    this.accumRT = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.accumMat = new THREE.ShaderMaterial({
      uniforms: { tSample: { value: null }, weight: { value: 1 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSample; uniform float weight; varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tSample, vUv) * weight; }`,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      depthTest: false, depthWrite: false,
    });
    this.outMat = new THREE.ShaderMaterial({
      uniforms: { tAccum: { value: this.accumRT.texture }, exposure: { value: 1.0 }, bg: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAccum; uniform float exposure; uniform vec3 bg; varying vec2 vUv;
        // Khronos PBR Neutral: identity through the midtones, so UI colours on
        // the screens stay true; only specular highlights roll off.
        vec3 neutral(vec3 color) {
          const float startCompression = 0.8 - 0.04;
          const float desaturation = 0.15;
          float x = min(color.r, min(color.g, color.b));
          float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
          color -= offset;
          float peak = max(color.r, max(color.g, color.b));
          if (peak < startCompression) return color;
          const float d = 1. - startCompression;
          float newPeak = 1. - d * d / (peak + d - startCompression);
          color *= newPeak / peak;
          float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
          return mix(color, newPeak * vec3(1, 1, 1), g);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() {
          vec4 a = texture2D(tAccum, vUv);
          a.a = clamp(a.a, 0.0, 1.0);
          vec3 c = a.a > 0.0 ? neutral(a.rgb / a.a * exposure) * a.a : vec3(0.0);
          vec3 lin = c + (1.0 - a.a) * bg;
          gl_FragColor = vec4(toSRGB(clamp(lin, 0.0, 1.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.accumMat);
    this.quadScene.add(this.quad);

    this.loader = new THREE.TextureLoader();
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  async texture(url) {
    const tex = await this.loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  canvasTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  // Low-discrepancy sample pattern: sub-pixel jitter, lens position, time.
  static pattern(n) {
    const out = [];
    const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(halton(i + 1, 2)), th = 2 * Math.PI * halton(i + 1, 3);
      out.push({
        jx: halton(i + 1, 5) - 0.5, jy: halton(i + 1, 7) - 0.5,
        lx: r * Math.cos(th), ly: r * Math.sin(th),
        t: n === 1 ? 0.5 : (i + 0.5) / n,
      });
    }
    return out;
  }

  /**
   * Renders one video frame.
   * @param {(t:number)=>{camera:{pos,target,fov,focus?,aperture?}}} pose  sets the
   *   scene up for time t (objects, screens) and returns the camera for it.
   * @param {number} t  frame time in seconds
   * @param {{samples?:number, shutter?:number, fps?:number}} opts
   */
  renderFrame(pose, t, { samples = 8, shutter = 0.5, fps = 60 } = {}) {
    const { renderer, camera } = this;
    const pattern = Engine3D.pattern(samples);
    renderer.setRenderTarget(this.accumRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    this.accumMat.uniforms.tSample.value = this.sampleRT.texture;
    this.accumMat.uniforms.weight.value = 1 / samples;
    this.quad.material = this.accumMat;

    for (let i = 0; i < samples; i++) {
      const s = pattern[i];
      const ts = t + (s.t - 0.5) * (shutter / fps);
      const cam = pose(ts);
      this.applyCamera(cam, s);
      renderer.setRenderTarget(this.sampleRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.render(this.scene, camera);
      renderer.setRenderTarget(this.accumRT);
      renderer.render(this.quadScene, this.quadCam);
    }

    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    this.quad.material = this.outMat;
    renderer.render(this.quadScene, this.quadCam);
  }

  // Positions the camera, then shears the projection so every lens sample
  // converges on the focal plane (thin-lens DOF) and adds sub-pixel jitter.
  applyCamera(c, s) {
    const camera = this.camera;
    camera.fov = c.fov ?? 30;
    camera.position.copy(c.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.target);
    if (c.roll) camera.rotateZ(c.roll);
    camera.updateMatrixWorld();
    const focus = c.focus ?? camera.position.distanceTo(c.target);
    const aperture = c.aperture ?? 0;
    const lx = s.lx * aperture, ly = s.ly * aperture;
    if (lx || ly) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(right, lx).addScaledVector(up, ly);
      camera.updateMatrixWorld();
    }
    camera.updateProjectionMatrix();
    const e = camera.projectionMatrix.elements;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    e[8] += -lx / (focus * tanHalf * camera.aspect) + (2 * s.jx) / this.width;
    e[9] += -ly / (focus * tanHalf) + (2 * s.jy) / this.height;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
}
