// A product-photography lighting environment, baked to a PMREM for image-based
// lighting. A soft grey cyclorama with large softboxes gives the white-studio
// feel; two black flags and two thin strip lights give metal edges and cover
// glass the bright/dark reflection lines that make them read as real.
import * as THREE from "three";

function emitter(w, h, intensity, color = 0xffffff) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function studioEnvironment(renderer) {
  const scene = new THREE.Scene();

  // Cyclorama: vertical gradient, brighter towards the floor bounce.
  const geo = new THREE.SphereGeometry(50, 64, 32);
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50; // -1..1
    const v = y < 0 ? 0.78 + 0.1 * -y : 0.78 - 0.38 * y;
    colors.push(v, v, v * 1.01);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const place = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); scene.add(mesh); };
  // Overhead softbox.
  place(emitter(40, 26, 3.2), 0, 38, 6);
  // Large key from front-left, fill from front-right.
  place(emitter(22, 30, 4.2), -30, 10, 28);
  place(emitter(18, 26, 1.6), 32, 6, 26);
  // Strip rims behind the subject.
  place(emitter(3.2, 42, 7.5), -34, 6, -24);
  place(emitter(3.2, 42, 6.5), 36, 6, -20);
  // Black flags to cut dark lines into reflections.
  const flag = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.DoubleSide }));
  place(flag(18, 44), -44, 0, 4);
  place(flag(18, 44), 44, 0, 0);
  place(flag(60, 10), 0, -12, -44);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return env;
}
