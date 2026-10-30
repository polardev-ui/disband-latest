// Frame composer for "The Internet, Reconnected.": sets up the renderer and
// renders the world at time t.
import { DURATION, WIDTH, HEIGHT } from "./timeline.js";
import { Engine3D } from "../src/engine3d.js";
import { createWorld } from "./world.js";

window.PREVIEW = new URLSearchParams(location.search).has("preview");
await document.fonts.load('800 220px "Inter"');
await document.fonts.load('500 220px "Inter"');

const engine = new Engine3D(document.getElementById("gl"), WIDTH, HEIGHT);
// Close-ups run the camera a few centimetres from the parts.
engine.camera.near = 0.05;
engine.camera.far = 400;
// The shared output pass, minus the neutral tone curve's toe, so the captured
// UI keeps its exact dark greys; highlights still roll off.
engine.outMat.fragmentShader = engine.outMat.fragmentShader.replace("float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;", "float offset = 0.0;");
engine.outMat.needsUpdate = true;
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
engine.outMat.uniforms.bg.value.setRGB(toLinear(11), toLinear(12), toLinear(14));
const world = await createWorld(engine);
window.__engine = engine;

window.renderFrame = (t) => {
  engine.renderFrame((ts) => world.pose(ts), t, { samples: world.samplesFor(t), shutter: 0.4, fps: 30 });
  return Promise.resolve(true);
};
window.stageInfo = { duration: DURATION };
document.body.dataset.ready = "1";
