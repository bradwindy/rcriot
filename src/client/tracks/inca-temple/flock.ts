import * as THREE from 'three';
import type { RGB } from '../../render/geometry';
import type { IncaMats } from './palette';

/** One macaw's loop: a circle round (x, z) at a height, its radius, speed (radians a second, sign for direction) and size. */
type Loop = [x: number, z: number, y: number, r: number, speed: number, size: number];

const LOOPS: Loop[] = [
  [120, -300, 34, 46, 0.32, 2.4],
  [120, -300, 40, 30, -0.4, 2],
  [130, -290, 29, 60, 0.26, 2.2],
  [-150, -240, 22, 34, -0.36, 2.2],
  [-130, -230, 26, 50, 0.3, 2.5],
  [-150, -70, 24, 40, 0.34, 2],
  [-30, -20, 34, 44, -0.3, 2.3],
];

/** Red, blue and gold macaws, or blue and gold ones. Body, wing tops, tail. */
const COATS: [RGB, RGB, RGB][] = [
  [[0.95, 0.12, 0.08], [0.1, 0.35, 0.95], [1, 0.8, 0.1]],
  [[0.15, 0.4, 1], [1, 0.78, 0.12], [0.1, 0.3, 0.8]],
];

/** Body: beak, the two shoulders, tail tip. Wings: root front, root back, tip. All in the bird's own frame. */
const TRIS = 8;

/** Macaws wheeling over the temple and the gorge, all in one mesh rewritten each frame. */
export function flock(inca: IncaMats): { mesh: THREE.Mesh; update(time: number): void } {
  const count = LOOPS.length;
  const pos = new Float32Array(count * TRIS * 9);
  const col = new Float32Array(count * TRIS * 9);
  const nor = new Float32Array(count * TRIS * 9);
  const uv = new Float32Array(count * TRIS * 6);
  for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1;
  LOOPS.forEach((_, b) => {
    const [body, wing, tail] = COATS[b % COATS.length];
    const shades = [body, body, wing, wing, wing, wing, tail, tail];
    shades.forEach((c, t) => {
      for (let v = 0; v < 3; v++) col.set(c, ((b * TRIS + t) * 3 + v) * 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -150), 600);
  const mesh = new THREE.Mesh(g, inca.bird);
  mesh.frustumCulled = false;

  const at = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const local = (x: number, y: number, z: number, out: number) => {
    pos[out] = at.x + side.x * x + fwd.x * z;
    pos[out + 1] = at.y + y;
    pos[out + 2] = at.z + side.z * x + fwd.z * z;
  };
  return {
    mesh,
    update(time) {
      LOOPS.forEach(([cx, cz, cy, r, speed, size], b) => {
        const a = time * speed + b * 1.7;
        at.set(cx + Math.cos(a) * r, cy + Math.sin(time * 0.7 + b) * 2, cz + Math.sin(a) * r);
        fwd.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.sign(speed) * size);
        side.set(-fwd.z, 0, fwd.x);
        const flap = Math.sin(time * 9 + b * 2.3) * 0.75 * size;
        const pts: [number, number, number][] = [
          // body, two triangles
          [0, 0, 0.9], [-0.22, 0.05, 0], [0.22, 0.05, 0],
          [-0.22, 0.05, 0], [0, 0, -0.8], [0.22, 0.05, 0],
          // left wing
          [-0.15, 0.05, 0.3], [-0.15, 0.05, -0.3], [-1.3, flap / size, -0.1],
          [-1.3, flap / size, -0.1], [-0.15, 0.05, -0.3], [-1.6, (flap * 1.3) / size, -0.5],
          // right wing
          [0.15, 0.05, 0.3], [1.3, flap / size, -0.1], [0.15, 0.05, -0.3],
          [1.3, flap / size, -0.1], [1.6, (flap * 1.3) / size, -0.5], [0.15, 0.05, -0.3],
          // tail
          [-0.12, 0, -0.7], [0, 0, -1.8], [0.12, 0, -0.7],
          [-0.12, 0, -0.7], [-0.2, 0, -1.6], [0, 0, -1.8],
        ];
        pts.forEach(([x, y, z], k) => local(x, y * size, z, (b * TRIS * 3 + k) * 3));
      });
      g.getAttribute('position').needsUpdate = true;
    },
  };
}
